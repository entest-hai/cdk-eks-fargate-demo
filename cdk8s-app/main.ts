import { App } from "cdk8s";
import { HelloChart } from "./src/hello-app";
import { BookChart } from "./src/book-app";

const app = new App();

// hello chart
new HelloChart(app, "cdk8s-app");

// book-service
new BookChart(app, "book-app");

// synthesize to yaml
app.synth();
