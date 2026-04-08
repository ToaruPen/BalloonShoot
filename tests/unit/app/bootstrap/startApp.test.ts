import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAudioControllerMock,
  createCameraControllerMock,
  createMediaPipeHandTrackerMock,
  createGameEngineMock,
  registerShotMock,
  drawGameFrameMock
} = vi.hoisted(() => ({
  createAudioControllerMock: vi.fn(),
  createCameraControllerMock: vi.fn(),
  createMediaPipeHandTrackerMock: vi.fn(),
  createGameEngineMock: vi.fn(() => ({
    score: 0,
    combo: 0,
    multiplier: 1,
    balloons: [],
    timeRemainingMs: 60_000,
    advance: vi.fn()
  })),
  registerShotMock: vi.fn(),
  drawGameFrameMock: vi.fn()
}));

vi.mock("../../../../src/features/audio/createAudioController", () => ({
  createAudioController: createAudioControllerMock
}));

vi.mock("../../../../src/features/camera/createCameraController", () => ({
  createCameraController: createCameraControllerMock
}));

vi.mock("../../../../src/features/hand-tracking/createMediaPipeHandTracker", () => ({
  createMediaPipeHandTracker: createMediaPipeHandTrackerMock
}));

vi.mock("../../../../src/features/gameplay/domain/createGameEngine", () => ({
  createGameEngine: createGameEngineMock,
  registerShot: registerShotMock
}));

vi.mock("../../../../src/features/rendering/drawGameFrame", () => ({
  drawGameFrame: drawGameFrameMock
}));

vi.mock("../../../../src/app/screens/renderShell", () => ({
  renderShell: (state: { screen: string }) =>
    `<div data-screen="${state.screen}"><button data-action="${
      state.screen === "permission" ? "camera" : state.screen === "ready" ? "start" : "retry"
    }"></button></div>`
}));

class FakeElement {
  constructor(
    readonly dataset: { action?: string } = {},
    private readonly closestResult: FakeElement | null = null
  ) {}

  closest(): FakeElement | null {
    return this.closestResult;
  }
}

class FakeOverlayRoot {
  innerHTML = "";
  private clickHandler: ((event: { target: unknown }) => void) | undefined;

  addEventListener(type: string, handler: (event: { target: unknown }) => void): void {
    if (type === "click") {
      this.clickHandler = handler;
    }
  }

  contains(value: unknown): boolean {
    return value instanceof FakeElement;
  }

  click(action: string): void {
    const actionElement = new FakeElement({ action });
    const target = new FakeElement({}, actionElement);

    this.clickHandler?.({ target });
  }
}

const createFakeRoot = () => {
  const overlayRoot = new FakeOverlayRoot();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({}))
  };
  const cameraRoot = {};
  const selectors = new Map<string, unknown>([
    [".game-canvas", canvas],
    ["#camera-root", cameraRoot],
    [".overlay-root", overlayRoot]
  ]);
  const root = {
    innerHTML: "",
    querySelector: vi.fn((selector: string) => selectors.get(selector) ?? null)
  };

  return {
    root,
    overlayRoot
  };
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("startApp camera recovery", () => {
  let runNextAnimationFrame: (frameAtMs?: number) => void;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    let nextAnimationFrameId = 1;
    const animationFrames = new Map<number, FrameRequestCallback>();
    runNextAnimationFrame = (frameAtMs = 16) => {
      const firstEntry = animationFrames.entries().next().value;

      if (!firstEntry) {
        throw new Error("Expected a scheduled animation frame");
      }

      animationFrames.delete(firstEntry[0]);
      firstEntry[1](frameAtMs);
    };

    Object.defineProperty(globalThis, "Element", {
      configurable: true,
      value: FakeElement
    });

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        innerWidth: 1280,
        innerHeight: 720,
        addEventListener: vi.fn(),
        setInterval: vi.fn(() => 1),
        clearInterval: vi.fn(),
        requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
          const id = nextAnimationFrameId;
          nextAnimationFrameId += 1;
          animationFrames.set(id, callback);
          return id;
        }),
        cancelAnimationFrame: vi.fn((id: number) => {
          animationFrames.delete(id);
        }),
        ImageCapture: class {
          grabFrame(): Promise<ImageBitmap> {
            return Promise.resolve({ width: 640, height: 480, close: vi.fn() } as unknown as ImageBitmap);
          }
        }
      }
    });

    Object.defineProperty(globalThis, "console", {
      configurable: true,
      value: {
        ...console,
        error: vi.fn()
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears the prewarmed tracker promise when camera startup fails so the user can retry", async () => {
    const cameraStop = vi.fn();
    createAudioControllerMock.mockReturnValue({
      startBgm: vi.fn(() => Promise.resolve()),
      stopBgm: vi.fn(),
      playShot: vi.fn(() => Promise.resolve()),
      playHit: vi.fn(() => Promise.resolve()),
      playTimeout: vi.fn(() => Promise.resolve()),
      playResult: vi.fn(() => Promise.resolve())
    });
    createCameraControllerMock.mockReturnValue({
      requestStream: vi.fn(() => Promise.reject(new Error("camera denied"))),
      stop: cameraStop
    });
    createMediaPipeHandTrackerMock.mockResolvedValue({
      detect: vi.fn()
    });

    const { getCameraFeedStream, startApp } = await import(
      "../../../../src/app/bootstrap/startApp"
    );
    const { root, overlayRoot } = createFakeRoot();

    startApp(root as unknown as HTMLDivElement);
    overlayRoot.click("camera");
    await flushPromises();

    expect(cameraStop).toHaveBeenCalledTimes(1);
    expect(getCameraFeedStream()).toBeUndefined();
    expect(overlayRoot.innerHTML).toContain('data-screen="permission"');

    overlayRoot.click("camera");
    await flushPromises();

    expect(createMediaPipeHandTrackerMock).toHaveBeenCalledTimes(2);
  });

  it("stops tracking, clears the camera feed, and retries tracker creation after tracker startup fails", async () => {
    const trackerStartupError = new Error("tracker failed");
    const trackStop = vi.fn();
    const stream = {
      getTracks: () => [{ stop: trackStop }],
      getVideoTracks: () => [{ stop: trackStop }]
    } as unknown as MediaStream;
    const startBgm = vi.fn(() => Promise.resolve());
    const stopBgm = vi.fn();
    let rejectTracker: ((error: Error) => void) | undefined;

    createAudioControllerMock.mockReturnValue({
      startBgm,
      stopBgm,
      playShot: vi.fn(() => Promise.resolve()),
      playHit: vi.fn(() => Promise.resolve()),
      playTimeout: vi.fn(() => Promise.resolve()),
      playResult: vi.fn(() => Promise.resolve())
    });
    createCameraControllerMock.mockReturnValue({
      requestStream: vi.fn(() => Promise.resolve(stream)),
      stop: trackStop
    });
    createMediaPipeHandTrackerMock
      .mockImplementationOnce(
        () =>
          new Promise((_, reject: (error: Error) => void) => {
            rejectTracker = reject;
          })
      )
      .mockResolvedValueOnce({
        detect: vi.fn().mockResolvedValue(undefined)
      });

    const { getCameraFeedStream, startApp } = await import(
      "../../../../src/app/bootstrap/startApp"
    );
    const { root, overlayRoot } = createFakeRoot();

    startApp(root as unknown as HTMLDivElement);
    overlayRoot.click("camera");
    await flushPromises();
    overlayRoot.click("start");
    runNextAnimationFrame();
    rejectTracker?.(trackerStartupError);
    await flushPromises();

    expect(stopBgm).toHaveBeenCalledTimes(1);
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(getCameraFeedStream()).toBeUndefined();
    expect(overlayRoot.innerHTML).toContain('data-screen="permission"');

    overlayRoot.click("camera");
    await flushPromises();

    expect(createMediaPipeHandTrackerMock).toHaveBeenCalledTimes(2);
    expect(startBgm).toHaveBeenCalledTimes(1);
  });
});
