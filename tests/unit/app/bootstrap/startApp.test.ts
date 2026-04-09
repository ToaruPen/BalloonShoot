import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAudioControllerMock,
  createCameraControllerMock,
  createMediaPipeHandTrackerMock,
  createGameEngineMock,
  registerShotMock,
  drawGameFrameMock,
  createDebugPanelMock,
  debugPanelInstance,
  inputConfig
} = vi.hoisted(() => {
  const inputConfig = {
    smoothingAlpha: 0.28,
    triggerPullThreshold: 0.45,
    triggerReleaseThreshold: 0.25
  };
  const debugPanelInstance = {
    values: { ...inputConfig },
    render: vi.fn(() => `<aside class="debug-panel"></aside>`),
    bind: vi.fn()
  };
  return {
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
    drawGameFrameMock: vi.fn(),
    createDebugPanelMock: vi.fn(() => debugPanelInstance),
    debugPanelInstance,
    inputConfig
  };
});

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

vi.mock("../../../../src/features/debug/createDebugPanel", () => ({
  createDebugPanel: createDebugPanelMock
}));

vi.mock("../../../../src/shared/config/gameConfig", () => ({
  gameConfig: {
    camera: { width: 640, height: 480 },
    input: inputConfig
  }
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
    if (!this.innerHTML.includes(`data-action="${action}"`)) {
      throw new Error(`Action "${action}" is not rendered in the current screen`);
    }

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
  const cameraVideo = {
    srcObject: null as MediaStream | null,
    play: vi.fn(() => Promise.resolve())
  };
  const debugRoot = {
    innerHTML: "",
    querySelectorAll: vi.fn(() => [])
  };
  const selectors = new Map<string, unknown>([
    [".game-canvas", canvas],
    ["#camera-root", cameraRoot],
    [".overlay-root", overlayRoot],
    [".camera-feed", cameraVideo],
    ["#debug-root", debugRoot]
  ]);
  const root = {
    innerHTML: "",
    querySelector: vi.fn((selector: string) => selectors.get(selector) ?? null)
  };

  return {
    root,
    overlayRoot,
    cameraVideo,
    debugRoot
  };
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe("startApp", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    let nextAnimationFrameId = 1;
    const animationFrames = new Map<number, FrameRequestCallback>();

    vi.stubGlobal("Element", FakeElement);

    vi.stubGlobal("window", {
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
          return Promise.resolve({
            width: 640,
            height: 480,
            close: vi.fn()
          } as unknown as ImageBitmap);
        }
      }
    });

    vi.stubGlobal("console", {
      ...console,
      error: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds the debug panel from shared input config", async () => {
    createAudioControllerMock.mockReturnValue({
      startBgm: vi.fn(() => Promise.resolve()),
      stopBgm: vi.fn(),
      playShot: vi.fn(() => Promise.resolve()),
      playHit: vi.fn(() => Promise.resolve()),
      playTimeout: vi.fn(() => Promise.resolve()),
      playResult: vi.fn(() => Promise.resolve())
    });
    createCameraControllerMock.mockReturnValue({
      requestStream: vi.fn(() => Promise.resolve({ getTracks: () => [], getVideoTracks: () => [] })),
      stop: vi.fn()
    });
    createMediaPipeHandTrackerMock.mockResolvedValue({ detect: vi.fn() });

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root } = createFakeRoot();

    startApp(root as unknown as HTMLDivElement);

    expect(createDebugPanelMock).toHaveBeenCalledWith(inputConfig);
    expect(debugPanelInstance.render).toHaveBeenCalled();
    expect(debugPanelInstance.bind).toHaveBeenCalled();
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

  it("keeps the app in ready state when tracker prewarm fails (non-fatal)", async () => {
    const trackerStartupError = new Error("tracker prewarm failed");
    const cameraStop = vi.fn();
    const stream = {
      getTracks: () => [],
      getVideoTracks: () => []
    } as unknown as MediaStream;

    createAudioControllerMock.mockReturnValue({
      startBgm: vi.fn(() => Promise.resolve()),
      stopBgm: vi.fn(),
      playShot: vi.fn(() => Promise.resolve()),
      playHit: vi.fn(() => Promise.resolve()),
      playTimeout: vi.fn(() => Promise.resolve()),
      playResult: vi.fn(() => Promise.resolve())
    });
    createCameraControllerMock.mockReturnValue({
      requestStream: vi.fn(() => Promise.resolve(stream)),
      stop: cameraStop
    });
    createMediaPipeHandTrackerMock.mockImplementationOnce(() =>
      Promise.reject(trackerStartupError)
    );

    const { startApp } = await import("../../../../src/app/bootstrap/startApp");
    const { root, overlayRoot } = createFakeRoot();

    startApp(root as unknown as HTMLDivElement);
    overlayRoot.click("camera");
    await flushPromises();

    // Tracker prewarm failure is logged but non-fatal — state should reach ready,
    // not get reset back to permission.
    expect(cameraStop).not.toHaveBeenCalled();
    expect(overlayRoot.innerHTML).toContain('data-screen="ready"');
  });
});
