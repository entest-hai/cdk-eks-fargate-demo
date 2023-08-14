# =====================================================
# haimtran 06/07/2023
# simple services with s3 and polly
# ===================================================== 
import os 
import boto3
from contextlib import closing
import uuid

# parameter 
try: 
    BUCKET_NAME = os.environ['BUCKET_NAME']
    REGION = os.environ["REGION"]
except:
    BUCKET_NAME = "book-polly-demo-bucket"
    REGION = "ap-southeast-1"

# boto3 client
s3_client = boto3.client("s3", region_name=REGION)
polly_client = boto3.client("polly", region_name=REGION)


def get_presigned_url(key):
    """
    generated signed url 
    """
    url = s3_client.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": BUCKET_NAME,
            "Key": key,
        },
    )
    return url


def polly_text_to_speech_test(message: str) -> str:
    """
    call polly api and get audio url
    """
    # call polly api
    # TODO
    # get presigned url s3
    url = get_presigned_url(key="song/hello.mp3")
    # return
    return url


def polly_text_to_speech(message: str):
    """ 
    generate speech from text and save to s3 
    """
    # file name randome 
    file_name = f"{uuid.uuid4()}.mp3"
    # response 
    response = polly_client.synthesize_speech(
        Engine="standard",
        LanguageCode="en-US",
        OutputFormat="mp3",
        VoiceId="Brian",
        Text=message,
    )
    with closing(response["AudioStream"]) as stream:
        # write stream audio to mp3 file
        try:
            with open(f"./{file_name}", "wb") as file:
                file.write(stream.read())
            # upload file to s3
            s3_client.upload_file(
                file_name, 
                BUCKET_NAME,
                f"song/{file_name}"
            )
        except IOError as error:
            print(f"io error {error}")
    # get signed url from s3 
    presigned_url = get_presigned_url(f"song/{file_name}")
    # audio stream
    return presigned_url


if __name__ == "__main__":
    url = polly_text_to_speech(
        message="Good Morning"
    )
    print(url)
