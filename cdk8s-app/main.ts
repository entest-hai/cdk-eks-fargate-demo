import { Construct } from "constructs";
import { App, Chart, ChartProps } from "cdk8s";
import {
  IntOrString,
  KubeDeployment,
  KubeIngress,
  KubeService,
} from "./imports/k8s";

export class MyChart extends Chart {
  constructor(scope: Construct, id: string, props: ChartProps = {}) {
    super(scope, id, props);

    // public subnet ids => better vpc.publicSubnets here
    const pubSubnets =
      "subnet-06a1d8608e30f11ab, subnet-01c0d97fa07620d1a, subnet-0f1d8776d2005c985";

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
  }
}

const app = new App();
new MyChart(app, "cdk8s-app");
app.synth();
