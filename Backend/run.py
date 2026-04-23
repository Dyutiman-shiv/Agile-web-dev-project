import sys
import os

# Add project root to path so tests/ is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir))

from app import create_app

application = create_app()

if __name__ == "__main__":
    from tests.checks import run_preflight

    if not run_preflight():
        print("Aborting: preflight checks failed.")
        sys.exit(1)

    application.run(debug=True, port=5050)
