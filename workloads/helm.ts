// Deploy the NGINX ingress controller using the Helm chart.
const nginx = new k8s.helm.v2.Chart("nginx",
    {
        namespace: appsNamespaceName,
        chart: "nginx-ingress",
        version: "1.24.4",
        fetchOpts: {repo: "https://kubernetes-charts.storage.googleapis.com/"},
        // chart: "ingress-nginx",
        // version: "2.15.0",
        // fetchOpts: {repo: "https://kubernetes.github.io/ingress-nginx"},
        values: {controller: {publishService: {enabled: true}}},
        transformations: [
            (obj: any) => {
                // Do transformations on the YAML to set the namespace
                if (obj.metadata) {
                    obj.metadata.namespace = appsNamespaceName;
                }
            },
        ],
    },
    {providers: {kubernetes: provider}},
);
