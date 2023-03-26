import { aws_iam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as fs from "fs";
import * as path from "path";

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
    condition[`${props.oidc}:sub`] = `system:serviceaccount:kube-system:${props.serviceAccount}`;

    const json = fs.readFileSync(
      path.join(__dirname, "./../service-account/policy.json"),
      {
        encoding: "utf-8",
      }
    );

    const document = JSON.parse(json);

    const role = new aws_iam.Role(this, "RoleForAlbController", {
      roleName: "RoleForAlbController",
      assumedBy: new aws_iam.FederatedPrincipal(
        `arn:aws:iam::${this.account}:oidc-provider/${props.oidc}`
      ).withConditions({
        StringEquals: condition,
      }),
    });

    const policy = new aws_iam.Policy(this, "PolicyForAlbController", {
      policyName: "PolicyForAlbController",
      document: aws_iam.PolicyDocument.fromJson(document),
    });

    policy.attachToRole(role);
  }
}
