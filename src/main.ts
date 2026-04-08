import "./styles/app.css";
import { startApp } from "./app/bootstrap/startApp";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

startApp(appRoot);
