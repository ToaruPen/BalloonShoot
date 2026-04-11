import "./styles/app.css";
import { createMediaPipeHandTracker } from "./features/hand-tracking/createMediaPipeHandTracker";
import { startApp, type StartAppDebugHooks } from "./app/bootstrap/startApp";

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("Missing #app root");
}

const debugHooks = import.meta.env.DEV
  ? {
      createHandTracker: () => {
        const testHooks = (
          window as Window & {
            __balloonShootTestHooks?: StartAppDebugHooks;
          }
        ).__balloonShootTestHooks;

        return testHooks?.createHandTracker() ?? createMediaPipeHandTracker();
      }
    }
  : undefined;

startApp(appRoot, undefined, debugHooks);
