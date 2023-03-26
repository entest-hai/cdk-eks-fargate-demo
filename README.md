## Introduction

This note shows you how to getting started with EKS (Fargate) and cdk8s. It helps you understand some essential concepts, hopefully

- Fargate Profile
- Service Account
- Application Load Balancer Controller

It consists of main steps below

- Create a EKS cluster and Fargate profiles using CDK
- Update kubeconfig to access the cluster via kubectl
- Setup a service account
- Install add-on application load balancer for EKS
- Develop a service using cdk8s

## Project Structure

```ts
|--bin
   |--cdk-eks-fargate-demo.ts
|--lib
   |--network-stack.ts
   |--eks-fargate-stack.ts
|--cdk8s-app
   |--main.ts
   |--dist
      |--cdk8s-app.k8s.yaml
```

bin, lib directories contains CDK stack for infrastructure, and cdk8s-app contain the kube app in ts and yaml files.

## VPC Network Stack

We need a VPC with at least 2 zones, both public and private subnets

```ts
const vpc = new aws_ec2.Vpc(this, `${props.name}-Vpc`, {
  vpcName: props.name,
  maxAzs: 3,
  enableDnsHostnames: true,
  enableDnsSupport: true,
  ipAddresses: aws_ec2.IpAddresses.cidr(props.cidr),
  // aws nat gateway service not instance
  natGatewayProvider: aws_ec2.NatProvider.gateway(),
  // can be less than num az default 1 natgw/zone
  natGateways: 1,
  // which public subet have the natgw
  // natGatewaySubnets: {
  //   subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
  // },
  subnetConfiguration: [
    {
      // cdk add igw and route tables
      name: "PublicSubnet",
      cidrMask: 24,
      subnetType: aws_ec2.SubnetType.PUBLIC,
    },
    {
      // cdk add nat and route tables
      name: "PrivateSubnetNat",
      cidrMask: 24,
      subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
    },
  ],
});
```

a self reference security group for EKS

```ts
const eksSecurityGroup = new aws_ec2.SecurityGroup(this, "EksSecurityGroup", {
  securityGroupName: "EksSecurityGroup",
  vpc: vpc,
});

eksSecurityGroup.addIngressRule(
  eksSecurityGroup,
  aws_ec2.Port.allIcmp(),
  "self reference security group"
);
```

a sts vpc endpoint, so EKS application load balancer controller (an addon) can assume role to create ALB for an ingress.

```ts
vpc.addInterfaceEndpoint("STSVpcEndpoint", {
  service: aws_ec2.InterfaceVpcEndpointAwsService.STS,
  open: true,
  subnets: {
    subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
  },
  securityGroups: [eksSecurityGroup],
});
```

## EKS Cluster Stack

First look up private subnet in the vpc

```ts
const subnets: string[] = props.vpc.privateSubnets.map((subnet) =>
  subnet.subnetId.toString()
);
```

Create a role which will be assumed by EKS cluster (control plane).

```ts
const role = new aws_iam.Role(this, `RoleForEksCluster-${props.clusterName}`, {
  roleName: `RoleForEksCluster-${props.clusterName}`,
  assumedBy: new aws_iam.ServicePrincipal("eks.amazonaws.com"),
});

role.addManagedPolicy(
  aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSClusterPolicy")
);
```

Create a EKS cluster

```ts
const cluster = new aws_eks.CfnCluster(
  this,
  `EksCluster-${props.clusterName}`,
  {
    name: props.clusterName,
    version: "1.25",
    resourcesVpcConfig: {
      // at least two subnets in different zones
      // at least 6 ip address, recommended 16
      subnetIds: subnets,
      //
      endpointPrivateAccess: false,
      //
      endpointPublicAccess: true,
      // cidr block allowed to access cluster
      // default 0/0
      publicAccessCidrs: ["0.0.0.0/0"],
      // eks will create a security group to allow
      // communication between control and data plane
      // nodegroup double check
      securityGroupIds: [props.eksSecurityGroup.securityGroupId],
    },
    kubernetesNetworkConfig: {
      // don not overlap with VPC
      // serviceIpv4Cidr: "",
    },
    // role for eks call aws service on behalf of you
    roleArn: role.roleArn,
    logging: {
      // by deault control plan logs is not exported to CW
      clusterLogging: {
        enabledTypes: [
          {
            // api | audit | authenticator | controllerManager
            type: "api",
          },
          {
            type: "controllerManager",
          },
          {
            type: "scheduler",
          },
          {
            type: "authenticator",
          },
        ],
      },
    },
  }
);
```

Create role for pods

```ts
const podRole = new aws_iam.Role(
  this,
  `RoleForFargatePod-${props.clusterName}`,
  {
    roleName: `RoleForFargatePod-${props.clusterName}`,
    assumedBy: new aws_iam.ServicePrincipal("eks-fargate-pods.amazonaws.com"),
  }
);

podRole.addManagedPolicy(
  aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
    "AmazonEKSFargatePodExecutionRolePolicy"
  )
);
```

Create Fargate profile

```ts
const appFargateProfile = new aws_eks.CfnFargateProfile(
  this,
  "FirstFargateProfileDemo1",
  {
    clusterName: cluster.name!,
    podExecutionRoleArn: podRole.roleArn,
    selectors: [
      {
        namespace: "demo",
        labels: [
          {
            key: "environment",
            value: "dev",
          },
        ],
      },
    ],
    fargateProfileName: "demo",
    // default all private subnet in the vpc
    subnets: subnets,
    tags: [
      {
        key: "name",
        value: "test",
      },
    ],
  }
);
```

## Update Kubeconfig

When the EKS cluster is created by CDK execution role, we need to update kebug config in our local machine to accesss eks clsuter via kubectl

- Find the CDK execution role in CloudFormation (Bootstrap stack)
- Then update kubeconfig as below

```bash
aws eks update-kubeconfig --name Demo --region ap-southeast-2 --role-arn 'arn:aws:iam::$ACCOUNT:role/cdk-hnb659fds-cfn-exec-role-$ACCOUNT-$REGION'
```

## Create an Service Account

To expose a service via AWS application load balancer we need

- deploy an kube ingress
- eks uses an addon (application load balancer controler) to create an AWS ALB
- eks needs a service account with binding aws iam role

There are several ways to create a service account and bind it with an iam role. For example,follow guide [here](https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html)

- create a service account in eks
- create a policy assumed by the oicd of the service account
- attach the policy to an iam role
- bind the role with the service account

First, create a service account using kubectl with below yaml file

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-service-account
  namespace: default
```

Next, create iam policy and role in aws. Set account_id env variable

```bash
account_id=$(aws sts get-caller-identity --query "Account" --output text)
```

set oidc_provider env variable

```bash
oidc_provider=$(aws eks describe-cluster --name Demo --region ap-southeast-2 --query "cluster.identity.oidc.issuer" --output text | sed -e "s/^https:\/\///")
```

export some variables

```bash
export namespace=kube-system
export service_account=aws-alb-controller
```

Create a trust relationship policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::$account_id:oidc-provider/$oidc_provider"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "$oidc_provider:aud": "sts.amazonaws.com",
          "$oidc_provider:sub": "system:serviceaccount:$namespace:$service_account"
        }
      }
    }
  ]
}
```

Create an IAM role

```bash
aws iam create-role --role-name my-role --assume-role-policy-document file://trust-relationship.json --description "my-role-description"
```

Attach policy to iam role

```bash
aws iam attach-role-policy --role-name my-role --policy-arn=arn:aws:iam::$account_id:policy/my-policy
```

Annotate the service

```bash
kubectl annotate serviceaccount -n $namespace $service_account eks.amazonaws.com/role-arn=arn:aws:iam::$account_id:role/AmazonEKSLoadBalancerControllerRole
```

Confirm service account are good

```bash

aws iam get-role --role-name my-role --query Role.AssumeRolePolicyDocument
```

Describe the service account

```bash
kubectl describe serviceaccount my-service-account -n default
```

Goto aws console and double check the role, ensure that it can be assumed by the oidc

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::$ACCOUNT:oidc-provider/oidc.eks.$REGION.amazonaws.com/id/OICD_ID"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "oidc.eks.$REGION.com/id/$OICD_ID:sub": "system:serviceaccount:kube-system:$SERVICE_ACCOUNT_NAME",
          "oidc.eks.$REGION.com/id/$OICD_ID:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
```

## Update CoreDNS

By default coredns configured for EKS with EC2, not Fargate, so we have to update it following [docs](https://docs.aws.amazon.com/eks/latest/userguide/fargate-getting-started.html)

```bash
kubectl patch deployment coredns \
    -n kube-system \
    --type json \
    -p='[{"op": "remove", "path": "/spec/template/metadata/annotations/eks.amazonaws.com~1compute-type"}]'
```

## Install ALB Controller

After update the coredns, we install an application load balancer (an eks addon) using helm. This controller will request aws to create ALB when we deploy an ingress.

```bash
helm repo add eks https://aws.github.io/eks-charts
```

update

```bash
helm repo update

```

```bash
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
-n kube-system \
--set clusterName=Demo \
--set serviceAccount.create=false \
--set serviceAccount.name=$SERVICE_ACCOUNT_NAME \
--set region=$REGION \
--set vpcId=$VPC_ID
```

delete

```bash
helm delete aws-load-balancer-controller -n kube-system
```

check

```bash
kubectl get pods -n kube-system
```

## Develop with CDK8S

Install cdk8s

```bash
npm install -g cdk8s-cli
```

Go inside the cdk8s-app and initialize a new cdk8s project

```bash
cdk8s init typescript-app
```

Write a service

```ts
// public subnet ids => better vpc.publicSubnets here
const pubSubnets = "pub-subnet-1, pub-subnet-2, pub-subnet-3";

const label = { app: "hello-cdk8s" };

const namespace = "demo";

new KubeDeployment(this, "deployment", {
  metadata: {
    name: "cdk8s-deployment",
    namespace: namespace,
  },
  spec: {
    replicas: 2,
    selector: {
      matchLabels: label,
    },
    template: {
      metadata: { labels: label },
      spec: {
        containers: [
          {
            name: "hello-kubernetes",
            image: "paulbouwer/hello-kubernetes:1.7",
            ports: [{ containerPort: 8080 }],
          },
        ],
      },
    },
  },
});

const service = new KubeService(this, "service", {
  metadata: {
    name: "cdk8s-service",
    namespace: namespace,
  },
  spec: {
    type: "NodePort",
    ports: [{ port: 80, targetPort: IntOrString.fromNumber(8080) }],
    selector: label,
  },
});
```

Create a ingress

```ts
// KubeIngress
new KubeIngress(this, "ingress", {
  metadata: {
    annotations: {
      "alb.ingress.kubernetes.io/scheme": "internet-facing",
      "alb.ingress.kubernetes.io/target-type": "ip",
      "kubernetes.io/ingress.class": "alb",
      "alb.ingress.kubernetes.io/subnets": pubSubnets,
    },
    namespace: namespace,
    name: "cdk8s-ingress",
  },
  spec: {
    rules: [
      {
        http: {
          paths: [
            {
              path: "/",
              pathType: "Prefix",
              backend: {
                service: {
                  name: service.name,
                  port: {
                    number: 80,
                  },
                },
              },
            },
          ],
        },
      },
    ],
  },
});
```

Compile into yaml

```bash
cdk8s --app 'npx ts-node main.ts' synth
```

A yaml named cdk8s-app.k8s.yaml file will be generated in dist directory, then we can deploy

```bash
kubectl create -f cdk8s-app.k8s.yaml
```

## Troubleshooting

delete ingress when error

```bash
kubectl patch ingress cdk8s-ingress -n demo -p '{"metadata":{"finalizers":[]}}' --type=merge
```

shell into a pod

```bash
kubectl exec -i -t my-pod --container main-app -- /bin/bash
```

## Reference

- [Fargate support only ALB](https://aws.amazon.com/jp/blogs/aws/amazon-eks-on-aws-fargate-now-generally-available/)

- [Faragate ALB](https://aws.amazon.com/blogs/containers/using-alb-ingress-controller-with-amazon-eks-on-fargate/)

- [Kubernet Ingress Error](https://github.com/kubernetes-sigs/aws-load-balancer-controller/issues/1202)

- [CoreDNS update](https://docs.aws.amazon.com/eks/latest/userguide/fargate-getting-started.html)

- [Service Account](https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html)

- [ALB and Tag on EKS](https://docs.aws.amazon.com/eks/latest/userguide/alb-ingress.html)
