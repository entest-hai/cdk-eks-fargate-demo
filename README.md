---
title: Getting Started with EKS Faragate
description: getting started with eks fargate
author: haimtran
publishedDate: 03/25/2022
date: 2022-03-25
---

## Introduction

This note shows you how to getting started with EKS (Fargate) and cdk8s. It helps you understand some essential concepts, hopefully

- Fargate Profile
- [Service Account](https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html)
- [Application Load Balancer Controller](https://aws.amazon.com/blogs/opensource/kubernetes-ingress-aws-alb-ingress-controller/)

Please read [this](https://aws.amazon.com/blogs/opensource/kubernetes-ingress-aws-alb-ingress-controller/) first to understarnd how ALB controller works and why we need it for EKS Fargate.

It consists of main steps below

- Create a EKS cluster and Fargate profiles using CDK
- Update kubeconfig to access the cluster via kubectl
- Setup a service account
- Install add-on application load balancer for EKS
- Develop a service using cdk8s
- [Multiple ingress in the same ALB](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#group.name)

![arch](https://user-images.githubusercontent.com/20411077/227763871-13ef71c1-4e11-485d-a3d9-f9327b04ad7c.png)

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

Create OIDC identity provider, then we can skip manually creating as below step

```ts
new aws_iam.OpenIdConnectProvider(this, "IamOICDProvider", {
  url: cluster.attrOpenIdConnectIssuerUrl,
  clientIds: ["sts.amazonaws.com"],
});
```

Create a IAM role for the service account

```ts
interface ServiceAccountProps extends StackProps {
  oidc: string;
  serviceAccount: string;
}

interface Condition {
  [key: string]: string;
}

export class ServiceAccountStack extends Stack {
  constructor(scope: Construct, id: string, props: ServiceAccountProps) {
    super(scope, id, props);

    let condition: Condition = {};

    condition[`${props.oidc}:aud`] = "sts.amazonaws.com";
    condition[
      `${props.oidc}:sub`
    ] = `system:serviceaccount:kube-system:${props.serviceAccount}`;

    const json = fs.readFileSync(
      path.join(__dirname, "./../service-account/policy.json"),
      {
        encoding: "utf-8",
      }
    );

    const document = JSON.parse(json);

    const trust = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: {
            Federated: `arn:aws:iam::${this.account}:${props.oidc}`,
          },
          Action: "sts:AssumeRoleWithWebIdentity",
          Condition: {
            StringEquals: condition,
          },
        },
      ],
    };

    new aws_iam.CfnRole(this, "RoleForAlbController", {
      roleName: "RoleForAlbController",
      assumeRolePolicyDocument: trust,
      policies: [
        {
          policyDocument: document,
          policyName: "PolicyForAlbController",
        },
      ],
    });
  }
}
```

## Update Kubeconfig

When the EKS cluster is created by CDK execution role, we need to update kebug config in our local machine to accesss eks clsuter via kubectl

- Find the CDK execution role in CloudFormation (Bootstrap stack)
- Then update kubeconfig as below

```bash
aws eks update-kubeconfig --name Demo --region ap-southeast-2 --role-arn 'arn:aws:iam::$ACCOUNT:role/cdk-hnb659fds-cfn-exec-role-$ACCOUNT-$REGION'
```

## Create an IAM OIDC Provider

This step can be skip as the above stack already created a IAM OIDC identity provider. [this](https://docs.aws.amazon.com/eks/latest/userguide/enable-iam-roles-for-service-accounts.html) to create an iam oidc provider

query oidc

```bash
aws eks describe-cluster --name my-cluster --query "cluster.identity.oidc.issuer" --output text
```

then create an iam oidc provider

```bash
eksctl utils associate-iam-oidc-provider --cluster my-cluster --approve
```

## Create an Service Account

There are several ways to create a service account and bind it with an iam role. For example,follow guide [here](https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html)

- create a service account in eks
- bind the role (created in stack above) with the service account

First, query the oicd

```bash
aws eks describe-cluster --name my-cluster --region $AWS_REGION --query "cluster.identity.oidc.issuer"
```

Third, create a service account using kubectl with below yaml file

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-service-account
  namespace: default
```

Finally, annotate the service

```bash
kubectl annotate serviceaccount -n $namespace $service_account eks.amazonaws.com/role-arn=arn:aws:iam::$account_id:role/AmazonEKSLoadBalancerControllerRole
```

Describe the service account

```bash
kubectl describe serviceaccount my-service-account -n default
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

update the trust relationship of the cloudformation exec role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudformation.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    },
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::$ACCOUNT:role/TeamRole"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

delete ingress when error

```bash
kubectl patch ingress cdk8s-ingress -n demo -p '{"metadata":{"finalizers":[]}}' --type=merge
```

shell into a pod

```bashp
kubectl exec -i -t my-pod --container main-app -- /bin/bash
```

when destroy the EKS stack, the application load balancer and some network interfaces are still there, so we need to manually delete them, then destroy the VPC stack

## Expose HTTPS

```ts
new KubeService(this, "service", {
  metadata: {
    annotations: {
      "service.beta.kubernetes.io/aws-load-balancer-backend-protocol": "http",
      "service.beta.kubernetes.io/aws-load-balancer-ssl-cert":
        "arn:aws:acm:ap-southeast-1:xxx:certificate/xxx",
      "service.beta.kubernetes.io/aws-load-balancer-ssl-ports": "https",
    },
  },
  spec: {
    type: "LoadBalancer",
    ports: [
      {
        name: "http",
        port: 80,
        targetPort: IntOrString.fromNumber(8080),
        protocol: "TCP",
      },
      {
        name: "https",
        port: 443,
        targetPort: IntOrString.fromNumber(8080),
        protocol: "TCP",
      },
    ],
    selector: label,
  },
});
```

## Reference

- [ALB Ingress Controller](https://aws.amazon.com/blogs/opensource/kubernetes-ingress-aws-alb-ingress-controller/)

- [Fargate support only ALB](https://aws.amazon.com/jp/blogs/aws/amazon-eks-on-aws-fargate-now-generally-available/)

- [Faragate ALB](https://aws.amazon.com/blogs/containers/using-alb-ingress-controller-with-amazon-eks-on-fargate/)

- [Kubernet Ingress Error](https://github.com/kubernetes-sigs/aws-load-balancer-controller/issues/1202)

- [CoreDNS update](https://docs.aws.amazon.com/eks/latest/userguide/fargate-getting-started.html)

- [Service Account](https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html)

- [ALB and Tag on EKS](https://docs.aws.amazon.com/eks/latest/userguide/alb-ingress.html)

- [ALB Controller How It Works](https://github.com/kubernetes-sigs/aws-load-balancer-controller/blob/main/docs/how-it-works.md)

- [Annotations](https://kubernetes-sigs.github.io/aws-load-balancer-controller/v2.2/guide/ingress/annotations/#resource-tags)

- [Exposing Kubernetes Applications](https://aws.amazon.com/blogs/containers/exposing-kubernetes-applications-part-2-aws-load-balancer-controller/)

- [How To Expose Multiple Applications on Amazon EKS Using a Single Application Load Balancer](https://aws.amazon.com/blogs/containers/how-to-expose-multiple-applications-on-amazon-eks-using-a-single-application-load-balancer/)

- [IAM OIDC Provider](https://docs.aws.amazon.com/eks/latest/userguide/enable-iam-roles-for-service-accounts.html)

```
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
-n kube-system \
--set clusterName=Demo \
--set serviceAccount.create=false \
--set serviceAccount.name=aws-alb-controller \
--set region=us-east-1\
--set vpcId=vpc-01c50e6ee10b6d6da
```
