import { createAudioController, type AudioController } from "../../features/audio/createAudioController";
import { createCameraController, type CameraController } from "../../features/camera/createCameraController";
import {
  createMediaPipeHandTracker,
  toHandFrame
} from "../../features/hand-tracking/createMediaPipeHandTracker";
import {
  mapHandToGameInput,
  type InputRuntimeState
} from "../../features/input-mapping/mapHandToGameInput";
import { createGameEngine, registerShot } from "../../features/gameplay/domain/createGameEngine";
import { drawGameFrame } from "../../features/rendering/drawGameFrame";
import { gameConfig } from "../../shared/config/gameConfig";
import { renderShell } from "../screens/renderShell";
import type { AppEvent } from "../state/appState";
import { createInitialAppState, reduceAppEvent } from "../state/reduceAppEvent";

const CROSSHAIR_Y_RATIO = 0.62;

interface ImageCaptureLike {
  grabFrame(): Promise<ImageBitmap>;
}

type ImageCaptureConstructorLike = new (track: MediaStreamTrack) => ImageCaptureLike;

type CameraFeedListener = (stream: MediaStream | undefined) => void;

export interface DebugValues {
  smoothingAlpha: number;
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
}

let cameraFeedStream: MediaStream | undefined;
let cameraFeedListener: CameraFeedListener | undefined;

const publishCameraFeedStream = (stream: MediaStream | undefined): void => {
  cameraFeedStream = stream;
  cameraFeedListener?.(stream);
};

export const getCameraFeedStream = (): MediaStream | undefined => cameraFeedStream;

export const setCameraFeedStreamListener = (
  listener: CameraFeedListener | undefined
): void => {
  cameraFeedListener = listener;
  listener?.(cameraFeedStream);
};

export const createDefaultDebugValues = (): DebugValues => ({
  smoothingAlpha: gameConfig.input.smoothingAlpha,
  triggerPullThreshold: gameConfig.input.triggerPullThreshold,
  triggerReleaseThreshold: gameConfig.input.triggerReleaseThreshold
});

const createImageCapture = (stream: MediaStream): ImageCaptureLike => {
  const ImageCaptureApi = (
    window as Window & {
      ImageCapture?: ImageCaptureConstructorLike;
    }
  ).ImageCapture;
  const videoTrack = stream.getVideoTracks()[0];

  if (!ImageCaptureApi) {
    throw new Error("ImageCapture API is unavailable");
  }

  if (!videoTrack) {
    throw new Error("Camera stream is missing a video track");
  }

  return new ImageCaptureApi(videoTrack);
};

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

export const startApp = (
  root: HTMLDivElement,
  debugValues: DebugValues = createDefaultDebugValues()
): void => {
  let state = createInitialAppState();
  let engine = createGameEngine();
  let audio: AudioController | undefined;
  let camera: CameraController | undefined;
  let countdownTimerId: number | undefined;
  let trackerPromise: ReturnType<typeof createMediaPipeHandTracker> | undefined;
  let gameFrameRequestId: number | undefined;
  let trackingFrameRequestId: number | undefined;
  let trackingCapture: ImageCaptureLike | undefined;
  let trackingFramePending = false;
  let inputRuntime: InputRuntimeState | undefined;
  let trackedCrosshair:
    | {
        x: number;
        y: number;
      }
    | undefined;
  let lastFrameAtMs: number | undefined;

  root.innerHTML = `
    <div class="app-layout">
      <div class="camera-underlay" id="camera-root" aria-hidden="true">
        <p>Camera feed will attach here in issue #9.</p>
      </div>
      <canvas class="game-canvas"></canvas>
      <div class="overlay-root"></div>
    </div>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>(".game-canvas");
  const cameraRoot = root.querySelector<HTMLDivElement>("#camera-root");
  const overlayRoot = root.querySelector<HTMLDivElement>(".overlay-root");

  if (!canvas || !cameraRoot || !overlayRoot) {
    throw new Error("Missing app shell roots");
  }

  // UI: mount stream into camera-feed from `setCameraFeedStreamListener()`.
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
    if (gameFrameRequestId === undefined) {
      return;
    }

    window.cancelAnimationFrame(gameFrameRequestId);
    gameFrameRequestId = undefined;
    lastFrameAtMs = undefined;
  };

  const stopTrackerLoop = (): void => {
    if (trackingFrameRequestId !== undefined) {
      window.cancelAnimationFrame(trackingFrameRequestId);
      trackingFrameRequestId = undefined;
    }

    trackingCapture = undefined;
    trackingFramePending = false;
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
            crosshair:
              trackedCrosshair ??
              inputRuntime?.crosshair ?? {
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
    stopTrackerLoop();
    stopGameLoop();
    render();
  };

  const processTrackingFrame = async (frameAtMs: number): Promise<void> => {
    if (trackingFrameRequestId === undefined) {
      return;
    }

    trackingFrameRequestId = window.requestAnimationFrame((nextFrameAtMs) => {
      void processTrackingFrame(nextFrameAtMs);
    });

    if (trackingFramePending || state.screen !== "playing") {
      return;
    }

    const stream = getCameraFeedStream();

    if (!stream) {
      return;
    }

    trackingFramePending = true;

    try {
      trackingCapture ??= createImageCapture(stream);

      const tracker = await (trackerPromise ??= createMediaPipeHandTracker());
      const bitmap = await trackingCapture.grabFrame();

      try {
        const detection = tracker.detectForVideo(bitmap, frameAtMs);
        const handFrame = toHandFrame(detection, {
          width: bitmap.width,
          height: bitmap.height
        });

        if (!handFrame) {
          return;
        }

        const input = mapHandToGameInput(
          handFrame,
          { width: canvas.width, height: canvas.height },
          inputRuntime,
          debugValues
        );

        inputRuntime = input.runtime;
        trackedCrosshair = input.crosshair;

        if (input.shotFired) {
          audio?.playShot();

          const scoreBefore = engine.score;
          registerShot(engine, {
            x: input.crosshair.x,
            y: input.crosshair.y,
            hit: true
          });

          if (engine.score > scoreBefore) {
            audio?.playHit();
          }

          syncScore();
          render();
        }
      } finally {
        bitmap.close();
      }
    } finally {
      trackingFramePending = false;
    }
  };

  const startTrackerLoop = (): void => {
    if (trackingFrameRequestId !== undefined) {
      return;
    }

    trackingFrameRequestId = window.requestAnimationFrame((frameAtMs) => {
      void processTrackingFrame(frameAtMs);
    });
  };

  const handleTimeUp = (): void => {
    stopTrackerLoop();
    audio?.stopBgm();
    audio?.playTimeout();
    audio?.playResult();
    finishRound();
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
      handleTimeUp();
      return;
    }

    gameFrameRequestId = window.requestAnimationFrame(tickGameLoop);
  };

  const startPlaying = (): void => {
    stopGameLoop();
    syncScore();
    render();
    gameFrameRequestId = window.requestAnimationFrame(tickGameLoop);
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
      inputRuntime = undefined;
      trackedCrosshair = undefined;
      engine = createGameEngine();
      void audio?.startBgm();
      startTrackerLoop();
      startCountdown();
      return;
    }

    if (event.type === "RETRY_CLICKED") {
      const nextState = reduceAppEvent(state, event);

      if (nextState === state) {
        return;
      }

      stopCountdown();
      stopTrackerLoop();
      stopGameLoop();
      audio?.stopBgm();
      camera?.stop();
      publishCameraFeedStream(undefined);
      inputRuntime = undefined;
      trackedCrosshair = undefined;
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
      audio ??= createAudioController();
      camera ??= createCameraController();
      trackerPromise ??= createMediaPipeHandTracker();

      void camera.requestStream().then((stream) => {
        trackingCapture = createImageCapture(stream);
        publishCameraFeedStream(stream);
        dispatch({ type: "CAMERA_READY" });
      });
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
