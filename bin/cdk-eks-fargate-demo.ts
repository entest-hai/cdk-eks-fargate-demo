import * as cdk from "aws-cdk-lib";
import { EksFaragteStack } from "../lib/eks-fargate-stack";
import { VpcStack } from "../lib/network-stack";
import { ServiceAccountStack } from "../lib/service-account-stack";

const region = "us-east-1";
const app = new cdk.App();

const network = new VpcStack(app, "VpcStack", {
  cidr: "10.0.0.0/16",
  name: "EksVpc",
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
  oidc: "123",
  serviceAccount: cluster.oidc,
  env: {
    region: region, 
    account: process.env.CDK_DEFAULT_ACCOUNT
  }
})

service.addDependency(cluster)
