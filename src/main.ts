import "./styles/app.css";
import { startApp, type StartAppDebugHooks } from "./app/bootstrap/startApp";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

const debugHooks = import.meta.env.DEV
  ? (
      window as Window & {
        __balloonShootTestHooks?: StartAppDebugHooks;
      }
    ).__balloonShootTestHooks
  : undefined;

startApp(appRoot, undefined, debugHooks);
