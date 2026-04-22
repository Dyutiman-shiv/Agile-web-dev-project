import re
import time
from flask import Blueprint, request, jsonify, Response
from flask_login import login_required, current_user
import requests

calendar_api = Blueprint("calendar_api", __name__)

# Simple in-memory cache: { (user_id, url): (timestamp, data) }
_ical_cache = {}
ICAL_CACHE_TTL = 120  # seconds


@calendar_api.route("/get_ical")
@login_required
def get_ical():
    url = request.args.get("url", "")
    if not url or not re.match(r"^https?://", url):
        return jsonify({"error": "A valid http(s) URL is required."}), 400

    cache_key = (current_user.id, url)
    now = time.time()

    # Return cached data if fresh
    if cache_key in _ical_cache:
        ts, data = _ical_cache[cache_key]
        if now - ts < ICAL_CACHE_TTL:
            return Response(data, mimetype="text/calendar")

    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        _ical_cache[cache_key] = (now, response.text)
        return Response(response.text, mimetype="text/calendar")
    except requests.RequestException:
        # Serve stale cache if available
        if cache_key in _ical_cache:
            _, data = _ical_cache[cache_key]
            return Response(data, mimetype="text/calendar")
        return jsonify({"error": "Failed to fetch iCal data."}), 502
