import { createDebugPanel, type DebugValues } from "../../features/debug/createDebugPanel";
import { createGameEngine } from "../../features/gameplay/domain/createGameEngine";
import { drawGameFrame } from "../../features/rendering/drawGameFrame";
import { gameConfig } from "../../shared/config/gameConfig";
import { renderShell } from "../screens/renderShell";
import type { AppEvent } from "../state/appState";
import { createInitialAppState, reduceAppEvent } from "../state/reduceAppEvent";

const CROSSHAIR_Y_RATIO = 0.62;

export const resolveOverlayAction = (
  target: Element | null,
  overlayRoot: Pick<HTMLElement, "contains">
): string | undefined => {
  if (!target) {
    return undefined;
  }

  const actionElement = target.closest<HTMLElement>("[data-action]");

  if (!actionElement || !overlayRoot.contains(actionElement)) {
    return undefined;
  }

  return actionElement.dataset["action"];
};

export const startApp = (root: HTMLDivElement): void => {
  let state = createInitialAppState();
  let engine = createGameEngine();
  let countdownTimerId: number | undefined;
  let frameRequestId: number | undefined;
  let lastFrameAtMs: number | undefined;

  root.innerHTML = `
    <div class="app-layout">
      <div class="camera-underlay" id="camera-root" aria-hidden="true">
        <video class="camera-feed" playsinline muted></video>
      </div>
      <canvas class="game-canvas"></canvas>
      <div class="overlay-root"></div>
      <div class="debug-root" id="debug-root"></div>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>(".game-canvas");
  const overlayRoot = root.querySelector<HTMLDivElement>(".overlay-root");
  const cameraVideo = root.querySelector<HTMLVideoElement>(".camera-feed");
  const debugRoot = root.querySelector<HTMLElement>("#debug-root");

  if (!canvas || !overlayRoot || !cameraVideo || !debugRoot) {
    throw new Error("Missing app shell roots");
  }

  const debugPanel = createDebugPanel({ ...gameConfig.input } satisfies DebugValues);
  debugRoot.innerHTML = debugPanel.render();
  debugPanel.bind(debugRoot.querySelectorAll<HTMLInputElement>("[data-debug]"));

  // TODO(codex/issue-9-backend-adapters): codex's wiring will assign
  // `cameraVideo.srcObject` from `await camera.requestStream()` inside the
  // camera-ready dispatch, and feed `debugPanel.values` into the hand tracker
  // and input-mapping loop. The `void` keeps TypeScript silent until then.
  void cameraVideo;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas 2D context is unavailable");
  }

  const resizeCanvas = (): void => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  const stopCountdown = (): void => {
    if (countdownTimerId === undefined) {
      return;
    }

    window.clearInterval(countdownTimerId);
    countdownTimerId = undefined;
  };

  const stopGameLoop = (): void => {
    if (frameRequestId === undefined) {
      return;
    }

    window.cancelAnimationFrame(frameRequestId);
    frameRequestId = undefined;
    lastFrameAtMs = undefined;
  };

  const syncScore = (): void => {
    state = reduceAppEvent(state, {
      type: "SCORE_SYNC",
      score: engine.score,
      combo: engine.combo,
      multiplier: engine.multiplier
    });
  };

  const render = (): void => {
    overlayRoot.innerHTML = renderShell(state);
    drawGameFrame(ctx, {
      balloons: engine.balloons,
      ...(state.screen === "playing"
        ? {
            crosshair: {
              x: canvas.width / 2,
              y: canvas.height * CROSSHAIR_Y_RATIO
            }
          }
        : {})
    });
  };

  const finishRound = (): void => {
    syncScore();
    state = reduceAppEvent(state, { type: "TIME_UP" });
    stopGameLoop();
    render();
  };

  const tickGameLoop = (frameAtMs: number): void => {
    if (state.screen !== "playing") {
      stopGameLoop();
      return;
    }

    lastFrameAtMs ??= frameAtMs;

    const deltaMs = Math.min(32, frameAtMs - lastFrameAtMs);
    lastFrameAtMs = frameAtMs;

    engine.advance(deltaMs, Math.random);
    syncScore();
    render();

    if (engine.timeRemainingMs <= 0) {
      finishRound();
      return;
    }

    frameRequestId = window.requestAnimationFrame(tickGameLoop);
  };

  const startPlaying = (): void => {
    stopGameLoop();
    syncScore();
    render();
    frameRequestId = window.requestAnimationFrame(tickGameLoop);
  };

  const startCountdown = (): void => {
    stopCountdown();
    render();

    let secondsRemaining = 3;

    countdownTimerId = window.setInterval(() => {
      secondsRemaining -= 1;
      state = reduceAppEvent(state, { type: "COUNTDOWN_TICK", secondsRemaining });
      render();

      if (secondsRemaining > 0) {
        return;
      }

      stopCountdown();
      startPlaying();
    }, 1_000);
  };

  const dispatch = (event: AppEvent): void => {
    if (event.type === "START_CLICKED") {
      const nextState = reduceAppEvent(state, event);

      if (nextState === state) {
        return;
      }

      state = nextState;
      stopGameLoop();
      engine = createGameEngine();
      startCountdown();
      return;
    }

    if (event.type === "RETRY_CLICKED") {
      const nextState = reduceAppEvent(state, event);

      if (nextState === state) {
        return;
      }

      stopCountdown();
      stopGameLoop();
      engine = createGameEngine();
      state = nextState;
      render();
      return;
    }

    state = reduceAppEvent(state, event);
    render();
  };

  overlayRoot.addEventListener("click", (event) => {
    const target = event.target;
    const action = target instanceof Element ? resolveOverlayAction(target, overlayRoot) : undefined;

    if (action === "camera") {
      dispatch({ type: "CAMERA_READY" });
      return;
    }

    if (action === "start") {
      dispatch({ type: "START_CLICKED" });
      return;
    }

    if (action === "retry") {
      dispatch({ type: "RETRY_CLICKED" });
    }
  });

  resizeCanvas();
  window.addEventListener("resize", () => {
    resizeCanvas();
    render();
  });
  render();
};
