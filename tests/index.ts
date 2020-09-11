import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

const projectName = pulumi.getProject();

// Enable default cluster settings for the project's config namespace.
const config = new pulumi.Config();
const appReplicaCount = config.getNumber("appReplicaCount") || 1;

// Create a k8s provider instance of the cluster.
const provider = new k8s.Provider(`${projectName}`);

// Create apps namespace for developers.
const appsNamespace = new k8s.core.v1.Namespace("apps", undefined, {provider: provider});
export const appsNamespaceName = appsNamespace.metadata.name;

// Deploy nginx.
const appLabels = { "app": "nginx" };
const app = new k8s.apps.v1.Deployment("nginx-deploy", {
    metadata: {namespace: appsNamespaceName},
    spec: {
        selector: { matchLabels: appLabels },
        replicas: appReplicaCount,
        template: {
            metadata: { labels: appLabels },
            spec: {
                containers: [{ name: "nginx", image: "nginx" }],
            },
        },
    },
}, {provider});

// Create a public load balanced Service listening for traffic on port 80.
const appService = new k8s.core.v1.Service("nginx-svc", {
    metadata: {namespace: appsNamespaceName},
    spec: {
        type: "LoadBalancer",
        selector: app.spec.template.metadata.labels,
        ports: [{ port: 80 }],
    },
}, {provider});
export const ingressIp = appService.status.loadBalancer.ingress[0].ip;
export const ingressUrl = pulumi.interpolate`http://${appService.status.loadBalancer.ingress[0].ip}`;
