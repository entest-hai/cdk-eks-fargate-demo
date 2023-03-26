import * as cdk from "aws-cdk-lib";
import { EksFaragteStack } from "../lib/eks-fargate-stack";
import { VpcStack } from "../lib/network-stack";

const region = "ap-southeast-2";
const app = new cdk.App();

const network = new VpcStack(app, "VpcStack", {
  cidr: "10.0.0.0/16",
  name: "EksVpc",
  env: {
    region: region,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});

new EksFaragteStack(app, "EksFaragteStack", {
  vpc: network.vpc,
  eksSecurityGroup: network.eksSecurityGroup,
  clusterName: "Demo",
  env: {
    region: region,
    account: process.env.CDK_DEFAULT_ACCOUNT,
  },
});
