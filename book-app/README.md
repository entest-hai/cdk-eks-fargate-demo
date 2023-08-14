---
title: flask tailwind polly demo
description: flask tailwind polly demo
author: haimtran
publishedDate: 06/07/2023
date: 2023-06-07
---

## Introduction

[GitHub](https://github.com/cdk-entest/flask-tailwind-polly) this note shows how to

- create a flask web app
- add tailwind
- add polly and s3 client
- add userdata for deployment

## Flask Web

Let create a fask web app with project structures as following

```bash
python3 -m venv .env
```

Then install dependencies

```bash
python -m pip install -r requirements.txt
```

Project structure

```
|--.env
|--app
   |--app.py
   |--static
      |--book.json
      |--output.css
   |--templates
      |--index.html
      |--polly.html
      |--login.html
      |--speech.html
      |--user.html
   |--requirements.txt
   |--README.sh
   |--run.sh
```

## Tailwind

Let add tailwind to the project, here is content of tailwind.config.js

```js
module.exports = {
  darkMode: "class",
  content: ["./src/**/*.{html,js}", "./templates/**/*.html"],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

Tailwind compile

```bash
npx tailwindcss -i ./src/input.css -o ./static/output.css --watch
```

## Home Page

Let create a simple grid of book

```html
<div class="mx-auto max-w-5xl">
  <div class="grid grid-cols-2 gap-5">
    {% for row in range(0,nrow,2) %}
    <div class="ml-4 bg-white p-3 dark:bg-slate-900 dark:text-white">
      <h4 class="font-bold mb-8">{{ books[row].title }}</h4>
      <div>
        <img
          src="{{ books[row].image }}"
          class="float-left h-auto w-64 mr-6"
          alt="book-image"
        />
      </div>
      <p class="text-sm">{{ books[row].description }}</p>
      <a href="{{ books[row].amazon }}" target="_blank">
        <button
          class="bg-orange-400 px-14 py-3 rounded-md shadow-md hover:bg-orange-500 mt-2"
        >
          Amazon
        </button>
      </a>
    </div>
    {% endfor %}
  </div>
</div>
```

## Polly

Let add polly to convert text to speech. First att a form which capture text and send a post report to the web flask server

```html
<div class="flex items-center justify-center mx-auto max-w-4xl">
  <form class="w-full px-5" method="POST" action="{{ url_for('speech')}} ">
    <label class="dark:text-white">Write your message</label>
    <textarea
      name="text"
      id="polly"
      rows="12"
      class="dark:text-white form-control block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500 my-5"
      placeholder="Write your thoughts here..."
    ></textarea>
    <input
      class="cursor-pointer bg-orange-300 px-10 py-2 rounded-sm"
      type="submit"
      value="Submit"
    />
  </form>
</div>
```

Then implement a post handler at speech link and function

```py
@app.route("/speech", methods=["POST"])
def speech():
    message = request.form.to_dict().get("text")
    print(f"data from text area {message}", flush=True)
    # get audio url
    audio_url = polly_text_to_speech(message=message)
    # return
    return render_template("speech.html", audio_url=audio_url, message=message)
```

Finally the speech interface which play the audio

```html
<div class="mx-auto max-w-4xl px-5">
  <div class="flex h-[480px] items-center justify-center">
    <video
      controls
      class="h-full w-auto max-h-[480px] py-5 cursor-pointer"
      poster="https://d2cvlmmg8c0xrp.cloudfront.net/pirf/tree.jpg"
    >
      <source src="{{ audio_url }}" />
    </video>
  </div>
  <div class="dark:text-white">{{ message }}</div>
</div>
```

## User Data

Please take note app.py when deploying in EC2

```py
app.run(host="0.0.0.0", port=80)
```

Here is the userdata for deploying in EC2

```bash
#!/bin/bash
cd ~
wget https://github.com/cdk-entest/flask-tailwind-polly/archive/refs/heads/master.zip
unzip master.zip
cd flask-tailwind-polly-master
python3 -m ensurepip --upgrade
python3 -m pip install -r requirements.txt
cd app
export BUCKET_NAME=""
export REGION="ap-southeast-1"
python3 -m app
```
