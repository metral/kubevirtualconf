import * as gcp from "@pulumi/gcp";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import * as rand from "@pulumi/random";
import * as utils from "./utils";

const projectName = pulumi.getProject();

// Enable default cluster settings for the project's config namespace.
const config = new pulumi.Config();
const nodeCount = config.getNumber("nodeCount") || 2;
const appReplicaCount = config.getNumber("appReplicaCount") || 1;

// Generate a strong password for the cluster.
const password = new rand.RandomPassword(`${projectName}-password`, { 
    length: 20,
},{ additionalSecretOutputs: ["result"] }).result;

// Create the GKE cluster.
// Find the latest 1.15.x engine version.
const engineVersion = gcp.container.getEngineVersions({
    location: gcp.config.zone,
    project: gcp.config.project,
}).then(v => v.validMasterVersions.filter(v => v.startsWith("1.16"))[0]);

const cluster = new gcp.container.Cluster(`${projectName}`, {
    initialNodeCount: nodeCount,
    minMasterVersion: engineVersion,
    nodeConfig: {
        machineType: "n1-standard-4",
        oauthScopes: [
            "https://www.googleapis.com/auth/compute",
            "https://www.googleapis.com/auth/devstorage.read_only",
            "https://www.googleapis.com/auth/logging.write",
            "https://www.googleapis.com/auth/monitoring",
        ],
        labels: {"instanceType": "n1-standard-4"},
    },
    masterAuth: {username: "example-user", password: password},
});
export const clusterName = cluster.name;
export const kubeconfig = utils.createKubeconfig(clusterName, cluster.endpoint, cluster.masterAuth);

// Create a k8s provider instance of the cluster.
const provider = new k8s.Provider(`${projectName}-gke`, {kubeconfig}, {dependsOn: cluster});

// Create apps namespace for developers.
const appsNamespace = new k8s.core.v1.Namespace("apps", undefined, {provider: provider});
export const appsNamespaceName = appsNamespace.metadata.name;

// Deploy nginx.
const appLabels = { "app": "app-nginx" };
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
