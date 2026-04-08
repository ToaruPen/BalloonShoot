import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEvent, AppState } from "../../../../src/app/state/appState";

const mocks = vi.hoisted(() => {
  const inputConfig = {
    smoothingAlpha: 0.19,
    triggerPullThreshold: 0.57,
    triggerReleaseThreshold: 0.31
  };

  const debugPanel = {
    values: { ...inputConfig },
    render: vi.fn(() => "<aside></aside>"),
    bind: vi.fn()
  };

  return {
    inputConfig,
    debugInputs: [
      {
        dataset: { debug: "smoothingAlpha" },
        value: String(inputConfig.smoothingAlpha),
        addEventListener: vi.fn()
      }
    ],
    debugPanel,
    createDebugPanel: vi.fn(() => debugPanel),
    createGameEngine: vi.fn(() => ({
      balloons: [],
      score: 0,
      combo: 0,
      multiplier: 1,
      timeRemainingMs: 30_000,
      advance: vi.fn()
    })),
    drawGameFrame: vi.fn(),
    renderShell: vi.fn(() => "<div></div>"),
    createInitialAppState: vi.fn(
      (): AppState => ({
        screen: "permission",
        countdown: 3,
        score: 0,
        combo: 0,
        multiplier: 1
      })
    ),
    reduceAppEvent: vi.fn((state: AppState, _event: AppEvent): AppState => state)
  };
});

vi.mock("../../../../src/shared/config/gameConfig", () => ({
  gameConfig: {
    camera: {
      width: 640,
      height: 480
    },
    input: mocks.inputConfig
  }
}));

vi.mock("../../../../src/features/debug/createDebugPanel", () => ({
  createDebugPanel: mocks.createDebugPanel
}));

vi.mock("../../../../src/features/gameplay/domain/createGameEngine", () => ({
  createGameEngine: mocks.createGameEngine
}));

vi.mock("../../../../src/features/rendering/drawGameFrame", () => ({
  drawGameFrame: mocks.drawGameFrame
}));

vi.mock("../../../../src/app/screens/renderShell", () => ({
  renderShell: mocks.renderShell
}));

vi.mock("../../../../src/app/state/reduceAppEvent", () => ({
  createInitialAppState: mocks.createInitialAppState,
  reduceAppEvent: mocks.reduceAppEvent
}));

import { startApp } from "../../../../src/app/bootstrap/startApp";

interface FakeCanvas {
  width: number;
  height: number;
  getContext(type: "2d"): CanvasRenderingContext2D | null;
}

interface FakeOverlayRoot {
  innerHTML: string;
  addEventListener(type: "click", listener: EventListener): void;
  contains(value: unknown): boolean;
}

interface FakeDebugRoot {
  innerHTML: string;
  querySelectorAll(selector: string): typeof mocks.debugInputs;
}

const createRoot = (): HTMLDivElement => {
  const canvas: FakeCanvas = {
    width: 0,
    height: 0,
    getContext: (type) => {
      expect(type).toBe("2d");
      return {} as CanvasRenderingContext2D;
    }
  };

  const overlayRoot: FakeOverlayRoot = {
    innerHTML: "",
    addEventListener: vi.fn(),
    contains: () => true
  };

  const cameraVideo = {};
  const debugRoot: FakeDebugRoot = {
    innerHTML: "",
    querySelectorAll: (selector) => {
      expect(selector).toBe("[data-debug]");
      return mocks.debugInputs;
    }
  };

  return {
    innerHTML: "",
    querySelector: (selector: string) => {
      switch (selector) {
        case ".game-canvas":
          return canvas;
        case ".overlay-root":
          return overlayRoot;
        case ".camera-feed":
          return cameraVideo;
        case "#debug-root":
          return debugRoot;
        default:
          return null;
      }
    }
  } as unknown as HTMLDivElement;
};

describe("startApp", () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.window = {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn()
    } as unknown as Window & typeof globalThis;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
  });

  it("seeds the debug panel from shared input config", () => {
    startApp(createRoot());

    expect(mocks.createDebugPanel).toHaveBeenCalledWith(mocks.inputConfig);
    expect(mocks.debugPanel.bind).toHaveBeenCalledWith(mocks.debugInputs);
  });
});
