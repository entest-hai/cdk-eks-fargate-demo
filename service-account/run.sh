export SERVICE_ACCOUNT_NAME=aws-alb-controller
export REGION=ap-southeast-2
export VPC_ID=
export NAMESPACE=kube-system
export ROLE=arn:aws:iam::$ACCOUNT_ID:role/RoleForAlbController

kubectl create -f service-account.yaml 

kubectl annotate serviceaccount -n $NAMESPACE  $SERVICE_ACCOUNT_NAME eks.amazonaws.com/role-arn=$ROLE

helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
-n kube-system \
--set clusterName=Demo \
--set serviceAccount.create=false \
--set serviceAccount.name=$SERVICE_ACCOUNT_NAME \
--set region=$REGION \
--set vpcId=$VPC_ID
