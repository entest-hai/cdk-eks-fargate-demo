import { aws_iam, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as fs from "fs";
import * as path from "path";


export class ServiceAccountStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const json = fs.readFileSync(
      path.join(__dirname, "./../service-account/policy.json"),
      {
        encoding: "utf-8",
      }
    );

    const document = JSON.parse(json)

    const role = new aws_iam.Role(this, "RoleForAlbController", {
      roleName: "RoleForAlbController",
      assumedBy: new aws_iam.FederatedPrincipal(
        "arn:aws:iam::$ACCOUNT_ID:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/$OIDC"
      ).withConditions({
        StringEquals: {
          "oidc.eks.us-east-1.amazonaws.com/id/$OIDC:aud": "sts.amazonaws.com",
          "oidc.eks.us-east-1.amazonaws.com/id/$OIDC:sub":
            "system:serviceaccount:kube-system:$SERVICE_ACCOUNT_NAME",
        },
      }),
    });

    const policy = new aws_iam.Policy(this, "PolicyForAlbController", {
      policyName: "PolicyForAlbController",
      document: aws_iam.PolicyDocument.fromJson(document),
    });

    policy.attachToRole(role);
  }
}
