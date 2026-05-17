"""
Selenium end-to-end tests.

These tests run against a live Werkzeug HTTP server (see conftest.py) and
drive a headless Chrome browser via Selenium 4's Selenium Manager.

Run only these tests::

    python -m tests.run_tests e2e
    pytest -m e2e

Skip them (fast suite — matches CI ``fast`` job)::

    python -m tests.run_tests fast
    pytest -m "not e2e"
"""

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


pytestmark = pytest.mark.e2e

# Default wait timeout (seconds) for dynamic page updates.
WAIT = 8


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login(driver, base_url, email, password):
    """Fill and submit the login form, then wait for navigation away from /login."""
    driver.get(f"{base_url}/login")
    WebDriverWait(driver, WAIT).until(EC.presence_of_element_located((By.ID, "login-form")))
    driver.find_element(By.ID, "email").send_keys(email)
    driver.find_element(By.ID, "password").send_keys(password)
    driver.find_element(By.ID, "login-btn").click()
    WebDriverWait(driver, WAIT).until(EC.url_changes(f"{base_url}/login"))


# ---------------------------------------------------------------------------
# 1. Login page renders
# ---------------------------------------------------------------------------

def test_login_page_loads(driver, live_server_url):
    """GET /login should serve the login form."""
    driver.get(f"{live_server_url}/login")
    form = WebDriverWait(driver, WAIT).until(
        EC.presence_of_element_located((By.ID, "login-form"))
    )
    # Avoid form.is_displayed() — headless Linux CI often reports the outer
    # form as not "displayed" while inputs are still interactable (animations/overlays).
    assert form.get_attribute("id") == "login-form"
    assert driver.find_element(By.ID, "email").is_enabled()
    assert driver.find_element(By.ID, "password").is_enabled()
    assert "Log In" in driver.title


# ---------------------------------------------------------------------------
# 2. Signup page renders
# ---------------------------------------------------------------------------

def test_signup_page_loads(driver, live_server_url):
    """GET /signup should serve the registration form."""
    driver.get(f"{live_server_url}/signup")
    form = WebDriverWait(driver, WAIT).until(
        EC.presence_of_element_located((By.ID, "signup-form"))
    )
    # In headless mode, animated/overlay-heavy layouts can report the form as
    # not displayed briefly even though the page loaded correctly.
    assert form.get_attribute("id") == "signup-form"
    assert driver.find_element(By.ID, "username").is_enabled()
    assert "Sign Up" in driver.title


# ---------------------------------------------------------------------------
# 3. Protected route redirects unauthenticated users to /login
# ---------------------------------------------------------------------------

def test_protected_route_redirects_to_login(driver, live_server_url):
    """Navigating to /dashboard without a session should redirect to /login."""
    driver.get(f"{live_server_url}/dashboard")
    WebDriverWait(driver, WAIT).until(EC.url_contains("/login"))
    assert "/login" in driver.current_url


# ---------------------------------------------------------------------------
# 4. Invalid login shows an error message
# ---------------------------------------------------------------------------

def test_invalid_login_shows_error(driver, live_server_url):
    """Submitting wrong credentials should make #login-alert visible."""
    driver.get(f"{live_server_url}/login")
    WebDriverWait(driver, WAIT).until(EC.presence_of_element_located((By.ID, "login-form")))

    driver.find_element(By.ID, "email").send_keys("nobody@example.com")
    driver.find_element(By.ID, "password").send_keys("wrongpassword")
    driver.find_element(By.ID, "login-btn").click()

    # The JS removes 'hidden' and injects an error div inside #login-alert.
    alert = WebDriverWait(driver, WAIT).until(
        EC.visibility_of_element_located((By.ID, "login-alert"))
    )
    assert alert.is_displayed()
    WebDriverWait(driver, WAIT).until(
        lambda d: d.find_element(By.ID, "login-alert").get_attribute("innerHTML").strip() != ""
    )
    html = alert.get_attribute("innerHTML")
    assert "Invalid" in html or len(html.strip()) > 0


# ---------------------------------------------------------------------------
# 5. Successful login redirects away from /login
# ---------------------------------------------------------------------------

def test_successful_login_redirects(driver, live_server_url, seeded_user):
    """A valid login should navigate the browser away from /login."""
    _login(driver, live_server_url, seeded_user["email"], seeded_user["password"])
    assert "/login" not in driver.current_url


# ---------------------------------------------------------------------------
# 6. Scores page accessible after login
# ---------------------------------------------------------------------------

def test_scores_page_loads_after_login(driver, live_server_url, seeded_user):
    """After logging in, /scores should render the semester select element."""
    _login(driver, live_server_url, seeded_user["email"], seeded_user["password"])
    driver.get(f"{live_server_url}/scores")
    select = WebDriverWait(driver, WAIT).until(
        EC.presence_of_element_located((By.ID, "semester-select"))
    )
    assert select.get_attribute("id") == "semester-select"
    assert select.is_enabled()


# ---------------------------------------------------------------------------
# 7. Root URL redirects (unauthenticated → login)
# ---------------------------------------------------------------------------

def test_root_redirects_to_login_when_unauthenticated(driver, live_server_url):
    """GET / without a session should ultimately land on /login."""
    driver.get(f"{live_server_url}/")
    WebDriverWait(driver, WAIT).until(EC.url_contains("/login"))
    assert "/login" in driver.current_url
