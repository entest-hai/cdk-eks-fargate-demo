import * as cdk from "aws-cdk-lib";
import { EksFaragteStack } from "../lib/eks-fargate-stack";
import { VpcStack } from "../lib/network-stack";
import {
  ServiceAccountBookAppStack,
  ServiceAccountStack,
} from "../lib/service-account-stack";

const region = "ap-southeast-1";
const app = new cdk.App();

const network = new VpcStack(app, "EksFargateNetworkStack", {
  cidr: "172.16.0.0/16",
  name: "EksFargateVpc",
  env: {
    region: region,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

const cluster = new EksFaragteStack(app, "EksFaragteStack", {
  vpc: network.vpc,
  eksSecurityGroup: network.eksSecurityGroup,
  clusterName: "Demo",
  env: {
    region: region,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

const service = new ServiceAccountStack(app, "ServiceAccountStack", {
  oidc: "oidc.eks.ap-southeast-1.amazonaws.com/id/xxx",
  serviceAccount: "aws-alb-controller",
  env: {
    region: region,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new ServiceAccountBookAppStack(app, "ServiceAccountBookAppStack", {
  oidc: "oidc.eks.ap-southeast-1.amazonaws.com/id/xxx",
  serviceAccount: "book-app-service-account",
  env: {
    region: region,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

//service.addDependency(cluster)
