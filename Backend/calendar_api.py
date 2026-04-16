import re
from flask import Blueprint, request, jsonify
from flask_login import login_required
import requests

calendar_api = Blueprint("calendar_api", __name__)


@calendar_api.route("/get_ical")
@login_required
def get_ical():
    url = request.args.get("url", "")
    if not url or not re.match(r"^https?://", url):
        return jsonify({"error": "A valid http(s) URL is required."}), 400
    try:
        response = requests.get(url, timeout=15)
        response.raise_for_status()
        return response.text
    except requests.RequestException as e:
        return jsonify({"error": "Failed to fetch iCal data."}), 502
