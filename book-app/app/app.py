# Hai Tran 13 JUN 2022
# Setup flask
import sys
sys.path.append("./service")
import json
from flask import Flask, render_template, request
from s3 import * 

# app = Flask(__name__)
app = Flask("my app")

app.jinja_env.auto_reload = True
app.config["TEMPLATES_AUTO_RELOAD"] = True

# get book list should be even number
with open("./static/book.json", "rb") as file:
    books = json.load(file)

@app.route("/")
def index():
    return render_template("index.html", books=books, nrow=len(books))

@app.route("/polly")
def polly():
    return render_template("polly.html")

# @app.route("/speech")
# def speech():
#     return render_template("speech.html", audio_url="", message="hello")

@app.route("/speech", methods=["POST"])
def speech():
    message = request.form.to_dict().get("text")
    print(f"data from text area {message}", flush=True)
    # get audio url 
    audio_url = polly_text_to_speech(message=message)
    # return 
    return render_template("speech.html", audio_url=audio_url, message=message) 

@app.route("/book")
def book():
    user = request.args.get("user")
    print(user)
    return render_template("index.html", books=books, nrow=int(user))

@app.route("/login")
def login():
    return render_template("login.html")

@app.route("/user", methods=["GET", "POST"])
def user():
    if request.method == 'POST':
        dict = request.form.to_dict()
        username = dict.get("username") 
        print(f"this is data from form: {dict} and {username}")
        return render_template("user.html", username=username)
    else:
        username = request.args.get("username")
        print(f"data from get request {username}")
        return render_template("user.html", username=username)


# generate blog.html => host by amplify hosting
def gen_static_web():
    with app.app_context():
        rendered = render_template(
            "index.html", books=books, nrow=len(books)
        )
        print(rendered)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080, debug=True)
    # deploy 
    # app.run(host="0.0.0.0", port=80)
    # gen_static_web()
