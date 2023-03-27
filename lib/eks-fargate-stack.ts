import {
  aws_ec2,
  aws_eks,
  aws_iam,
  aws_lambda_event_sources,
  Stack,
  StackProps,
} from "aws-cdk-lib";
import { Construct } from "constructs";

interface EksFaragteProps extends StackProps {
  vpc: aws_ec2.Vpc;
  eksSecurityGroup: aws_ec2.SecurityGroup;
  clusterName: string;
}

export class EksFaragteStack extends Stack {
  public readonly oidc: string;

  constructor(scope: Construct, id: string, props: EksFaragteProps) {
    super(scope, id, props);

    const subnets: string[] = props.vpc.privateSubnets.map((subnet) =>
      subnet.subnetId.toString()
    );

    const role = new aws_iam.Role(
      this,
      `RoleForEksCluster-${props.clusterName}`,
      {
        roleName: `RoleForEksCluster-${props.clusterName}`,
        assumedBy: new aws_iam.ServicePrincipal("eks.amazonaws.com"),
      }
    );

    role.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEKSClusterPolicy")
    );

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

    const podRole = new aws_iam.Role(
      this,
      `RoleForFargatePod-${props.clusterName}`,
      {
        roleName: `RoleForFargatePod-${props.clusterName}`,
        assumedBy: new aws_iam.ServicePrincipal(
          "eks-fargate-pods.amazonaws.com"
        ),
      }
    );

    podRole.addManagedPolicy(
      aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonEKSFargatePodExecutionRolePolicy"
      )
    );

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

    const adminFargateProfile = new aws_eks.CfnFargateProfile(
      this,
      "FirstFargateProfileDemo2",
      {
        clusterName: cluster.name!,
        podExecutionRoleArn: podRole.roleArn,
        selectors: [
          {
            namespace: "*",
          },
        ],
        fargateProfileName: "forall",
        // default all private subnet in the vpc
        subnets: subnets,
        tags: [
          {
            key: "name",
            value: "forall",
          },
        ],
      }
    );

    const idp = new aws_eks.CfnIdentityProviderConfig(
      this,
      "OIDCIdentityProvider",
      {
        clusterName: props.clusterName,
        type: "oidc",
        identityProviderConfigName: "OIDCIdentityProvider",
        oidc: {
          clientId: "sts.amazonaws.com",
          issuerUrl: cluster.attrOpenIdConnectIssuerUrl,
        },
      }
    );

    this.oidc = cluster.attrOpenIdConnectIssuerUrl;

    // dependency 
    appFargateProfile.addDependency(cluster);
    adminFargateProfile.addDependency(appFargateProfile);
    idp.addDependency(adminFargateProfile);
  }
}
