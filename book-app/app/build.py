"""
troubleshooting
sudo docker kill $(docker ps -q)
kubectl rollout restart deployment/book-app-deployment
"""

import os 

# parameters
REGION = "ap-southeast-1"
ACCOUNT = "562271415333"

# delete all docker images 
os.system("sudo docker system prune -a") 

# build book-app image 
os.system("sudo docker build -t book-app . ")

#  aws ecr login 
os.system(f"aws ecr get-login-password --region {REGION} | sudo docker login --username AWS --password-stdin {ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com")

# get image id 
IMAGE_ID=os.popen("sudo docker images -q book-app:latest").read()

# tag book-app image 
os.system(f"sudo docker tag {IMAGE_ID.strip()} {ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/book-app:latest")

# create ecr repository 
try: 
  os.system(f"aws ecr create-repository --registry-id {ACCOUNT} --repository-name book-app")
except:
  print("already existed")

# push image to ecr 
os.system(f"sudo docker push {ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/book-app:latest")
