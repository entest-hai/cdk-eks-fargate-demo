import { Construct } from "constructs";
import { Chart, ChartProps } from "cdk8s";
import {
  IntOrString,
  KubeDeployment,
  KubeIngress,
  KubeService,
  Quantity,
} from "../imports/k8s";

export class BookChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    // public subnet ids => better vpc.publicSubnets here
    const pubSubnets =
      "subnet-0c1a39df6e4561307, subnet-0107065aade86f71d, subnet-0ba625f63ecab6627";

    const label = { app: "book-app", environment: "dev" };

    const namespace = "demo";

    // deployment
    new KubeDeployment(this, "deployment", {
      metadata: {
        name: "book-app-deployment",
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
            serviceAccountName: "book-app-service-account",
            containers: [
              {
                name: "book-app",
                image:
                  "$ACCOUNT_ID.dkr.ecr.ap-southeast-1.amazonaws.com/book-app:latest",
                ports: [{ containerPort: 8080 }],
                resources: {
                  limits: { cpu: Quantity.fromString("100m") },
                  requests: { cpu: Quantity.fromString("100m") },
                },
              },
            ],
          },
        },
      },
    });

    // service
    const service = new KubeService(this, "service", {
      metadata: {
        name: "book-app-service",
        namespace: namespace,
        annotations: {
          "service.beta.kubernetes.io/aws-load-balancer-backend-protocol":
            "http",
          "service.beta.kubernetes.io/aws-load-balancer-ssl-cert":
            "arn:aws:acm:ap-southeast-1:$ACCOUNT_ID:certificate/xxx",
          "service.beta.kubernetes.io/aws-load-balancer-ssl-ports": "https",
        },
      },
      spec: {
        type: "NodePort",
        ports: [
          { port: 80, targetPort: IntOrString.fromNumber(8080), name: "http" },
          {
            port: 443,
            targetPort: IntOrString.fromNumber(8080),
            name: "https",
          },
        ],
        selector: label,
      },
    });

    // ingress
    new KubeIngress(this, "ingress", {
      metadata: {
        annotations: {
          "alb.ingress.kubernetes.io/group.name": "dev",
          "alb.ingress.kubernetes.io/scheme": "internet-facing",
          "alb.ingress.kubernetes.io/target-type": "ip",
          "kubernetes.io/ingress.class": "alb",
          "alb.ingress.kubernetes.io/subnets": pubSubnets,
          "alb.ingress.kubernetes.io/listen-ports":
            '[{"HTTP": 80}, {"HTTPS":443}]',
          "alb.ingress.kubernetes.io/ssl-redirect": "443",
          "alb.ingress.kubernetes.io/certificate-arn":
            "arn:aws:acm:ap-southeast-1:562271415333:certificate/cf9a6cd0-29a5-4be9-8dd8-45214557e9e9",
        },
        namespace: namespace,
        name: "book-app-ingress",
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
  }
}
