import { aws_ec2, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";

interface VpcProps extends StackProps {
  cidr: string;
  name: string;
}

export class VpcStack extends Stack {
  public readonly vpc: aws_ec2.Vpc;
  public readonly eksSecurityGroup: aws_ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: VpcProps) {
    super(scope, id, props);

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

    const eksSecurityGroup = new aws_ec2.SecurityGroup(
      this,
      "EksSecurityGroup",
      {
        securityGroupName: "EksSecurityGroup",
        vpc: vpc,
      }
    );

    eksSecurityGroup.addIngressRule(
      eksSecurityGroup,
      aws_ec2.Port.allIcmp(),
      "self reference security group"
    );

    vpc.addInterfaceEndpoint("STSVpcEndpoint", {
      service: aws_ec2.InterfaceVpcEndpointAwsService.STS,
      open: true,
      subnets: {
        subnetType: aws_ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [eksSecurityGroup],
    });

    this.vpc = vpc;
    this.eksSecurityGroup = eksSecurityGroup;
  }
}
