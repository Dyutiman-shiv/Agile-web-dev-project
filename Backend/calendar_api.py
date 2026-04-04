from flask import Flask, request
import requests

app = Flask(__name__)

@app.route("/get_ical")
def get_ical():
    url = request.args.get("url")

    try:
        response = requests.get(url)
        return response.text
    except:
        return "Error loading iCal"

if __name__ == "__main__":
    app.run(debug=True)

from flask import Blueprint, request
import requests

calendar_api = Blueprint("calendar_api", __name__)

@calendar_api.route("/get_ical")
def get_ical():
    url = request.args.get("url")
    response = requests.get(url)
    return response.text