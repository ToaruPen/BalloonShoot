import { describe, expect, it } from "vitest";
import {
  createDebugPanel,
  type DebugInputElement,
  type DebugOutputElement,
  type DebugTelemetry,
  type DebugValues
} from "../../../../src/features/debug/createDebugPanel";

const sampleInitial: DebugValues = {
  smoothingAlpha: 0.28,
  extendedThreshold: 1.15,
  curledThreshold: 0.65,
  zAssistWeight: 0,
  curlHysteresisGap: 0.05
};

const sampleTelemetry: DebugTelemetry = {
  phase: "armed",
  rejectReason: "waiting_for_stable_curled",
  curlState: "curled",
  rawCurlState: "partial",
  curlConfidence: 0.67,
  gunPoseConfidence: 0.91,
  ratio: 0.74,
  zDelta: 0.08,
  extendedFrames: 2,
  curledFrames: 1,
  trackingPresentFrames: 4,
  nonGunPoseFrames: 0
};

interface FakeInput extends DebugInputElement {
  fireInput: () => void;
}

type FakeOutput = DebugOutputElement;

const createFakeInput = (key: string, initialValue: string): FakeInput => {
  let listener: (() => void) | undefined;
  const addEventListener = (type: string, cb: () => void): void => {
    if (type !== "input") {
      throw new Error(`Unexpected event type: ${type}`);
    }

    listener = cb;
  };
  const input: FakeInput = {
    dataset: { debug: key },
    value: initialValue,
    addEventListener: addEventListener as DebugInputElement["addEventListener"],
    fireInput: () => {
      if (listener) {
        listener();
      }
    }
  };
  return input;
};

const createFakeOutput = (key: string): FakeOutput => ({
  dataset: { debugOutput: key },
  textContent: ""
});

describe("createDebugPanel", () => {
  it("starts with a copy of the curl debug values", () => {
    const panel = createDebugPanel(sampleInitial);

    expect(panel.values).toEqual(sampleInitial);
    expect(panel.values).not.toBe(sampleInitial);
  });

  it("renders every curl slider and telemetry output key", () => {
    const panel = createDebugPanel(sampleInitial);

    const html = panel.render();

    expect(html).toContain('class="debug-panel"');
    expect(html).toContain('data-debug="smoothingAlpha"');
    expect(html).toContain('data-debug="extendedThreshold"');
    expect(html).toContain('data-debug="curledThreshold"');
    expect(html).toContain('data-debug="zAssistWeight"');
    expect(html).toContain('value="0.28"');
    expect(html).toContain('value="1.15"');
    expect(html).toContain('value="0.65"');
    expect(html).toContain('value="0"');
    expect(html).toContain('min="0.9"');
    expect(html).toContain('max="1.6"');
    expect(html).toContain('min="0.4"');
    expect(html).toContain('max="0.9"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="0.1"');
    expect(html).toContain('data-debug-output="phase"');
    expect(html).toContain('data-debug-output="rejectReason"');
    expect(html).toContain('data-debug-output="curlState"');
    expect(html).toContain('data-debug-output="ratio"');
    expect(html).toContain('data-debug-output="ratioStats"');
    expect(html).toContain('data-debug-output="zDelta"');
    expect(html).toContain('data-debug-output="gunPose"');
    expect(html).toContain('data-debug-output="counters"');
  });

  it("renders curl telemetry into bound debug outputs", () => {
    const panel = createDebugPanel(sampleInitial);
    const curlState = createFakeOutput("curlState");
    const ratio = createFakeOutput("ratio");
    const ratioStats = createFakeOutput("ratioStats");
    const zDelta = createFakeOutput("zDelta");
    const gunPose = createFakeOutput("gunPose");
    const counters = createFakeOutput("counters");

    panel.bind([], [curlState, ratio, ratioStats, zDelta, gunPose, counters]);
    panel.setTelemetry(sampleTelemetry);

    expect(curlState.textContent).toBe("curled (raw: partial)");
    expect(ratio.textContent).toBe("0.74");
    expect(ratioStats.textContent).toBe("min=0.74 med=0.74 max=0.74");
    expect(zDelta.textContent).toBe("0.08");
    expect(gunPose.textContent).toBe("0.91");
    expect(counters.textContent).toBe("extended=2 curled=1 track=4 pose=0");
  });

  it("updates curl debug values in place when bound inputs fire", () => {
    const panel = createDebugPanel(sampleInitial);
    const extended = createFakeInput("extendedThreshold", "1.15");
    const curled = createFakeInput("curledThreshold", "0.65");
    const zAssist = createFakeInput("zAssistWeight", "0");

    panel.bind([extended, curled, zAssist]);

    extended.value = "1.32";
    extended.fireInput();
    curled.value = "0.72";
    curled.fireInput();
    zAssist.value = "0.05";
    zAssist.fireInput();

    expect(panel.values.extendedThreshold).toBeCloseTo(1.32);
    expect(panel.values.curledThreshold).toBeCloseTo(0.72);
    expect(panel.values.zAssistWeight).toBeCloseTo(0.05);
  });

  it("normalizes extendedThreshold upward after a curledThreshold input crosses the gap", () => {
    const panel = createDebugPanel(sampleInitial);
    const extended = createFakeInput("extendedThreshold", "1.15");
    const curled = createFakeInput("curledThreshold", "0.65");

    panel.bind([extended, curled]);

    curled.value = "1.2";
    curled.fireInput();

    expect(panel.values.curledThreshold).toBeCloseTo(0.9);
    expect(panel.values.extendedThreshold).toBeGreaterThanOrEqual(
      panel.values.curledThreshold + 0.05
    );
    expect(panel.values.extendedThreshold).toBeCloseTo(1.15);
    expect(extended.value).toBe("1.15");
    expect(curled.value).toBe("0.9");
  });

  it("normalizes invalid initial curl thresholds", () => {
    const panel = createDebugPanel({
      smoothingAlpha: 0.28,
      extendedThreshold: 0.95,
      curledThreshold: 0.92,
      zAssistWeight: 0,
      curlHysteresisGap: 0.05
    });

    expect(panel.values.extendedThreshold).toBeCloseTo(0.97);
    expect(panel.values.curledThreshold).toBeCloseTo(0.9);
  });

  it("ignores inputs whose debug key is not a known DebugValues field", () => {
    const panel = createDebugPanel(sampleInitial);
    const foreign = createFakeInput("nonsense", "0.99");

    panel.bind([foreign]);
    foreign.fireInput();

    expect(panel.values).toEqual(sampleInitial);
  });

  it("ignores non-finite input values so stale sliders cannot poison the config", () => {
    const panel = createDebugPanel(sampleInitial);
    const smoothing = createFakeInput("smoothingAlpha", "0.28");

    panel.bind([smoothing]);

    smoothing.value = "Infinity";
    smoothing.fireInput();

    expect(panel.values.smoothingAlpha).toBe(sampleInitial.smoothingAlpha);
    expect(smoothing.value).toBe("Infinity");
  });

  it("clamps out-of-range values to the curl slider bounds", () => {
    const panel = createDebugPanel(sampleInitial);
    const smoothing = createFakeInput("smoothingAlpha", "0.28");
    const extended = createFakeInput("extendedThreshold", "1.15");
    const curled = createFakeInput("curledThreshold", "0.65");
    const zAssist = createFakeInput("zAssistWeight", "0");

    panel.bind([smoothing, extended, curled, zAssist]);

    smoothing.value = "0.9";
    smoothing.fireInput();
    expect(panel.values.smoothingAlpha).toBeCloseTo(0.6);

    smoothing.value = "0.05";
    smoothing.fireInput();
    expect(panel.values.smoothingAlpha).toBeCloseTo(0.1);

    extended.value = "2";
    extended.fireInput();
    expect(panel.values.extendedThreshold).toBeCloseTo(1.6);

    extended.value = "0.1";
    extended.fireInput();
    expect(panel.values.extendedThreshold).toBeCloseTo(0.9);

    curled.value = "2";
    curled.fireInput();
    expect(panel.values.curledThreshold).toBeCloseTo(0.9);
    expect(panel.values.extendedThreshold).toBeCloseTo(0.95);

    curled.value = "0.1";
    curled.fireInput();
    expect(panel.values.curledThreshold).toBeCloseTo(0.4);

    zAssist.value = "1";
    zAssist.fireInput();
    expect(panel.values.zAssistWeight).toBeCloseTo(0.1);

    zAssist.value = "-1";
    zAssist.fireInput();
    expect(panel.values.zAssistWeight).toBeCloseTo(0);
  });

  it("computes ratioStats from telemetry ratio history", () => {
    const panel = createDebugPanel(sampleInitial);
    const ratioStats = createFakeOutput("ratioStats");
    const baseTelemetry: DebugTelemetry = {
      ...sampleTelemetry,
      phase: "ready",
      rejectReason: "waiting_for_fire_entry",
      curlState: "extended",
      rawCurlState: "extended",
      zDelta: 0,
      extendedFrames: 1,
      curledFrames: 0,
      trackingPresentFrames: 5,
      nonGunPoseFrames: 0
    };

    panel.bind([], [ratioStats]);
    expect(ratioStats.textContent).toBe("min=-- med=-- max=--");

    panel.setTelemetry({ ...baseTelemetry, ratio: 1 });
    panel.setTelemetry({ ...baseTelemetry, ratio: 1.4 });
    panel.setTelemetry({ ...baseTelemetry, ratio: 0.7 });

    expect(ratioStats.textContent).toBe("min=0.70 med=1.00 max=1.40");
  });

  it("keeps zAssistWeight as a display-only value for this panel", () => {
    const panel = createDebugPanel(sampleInitial);
    const zAssist = createFakeInput("zAssistWeight", "0");
    const curlState = createFakeOutput("curlState");
    const ratio = createFakeOutput("ratio");

    panel.bind([zAssist], [curlState, ratio]);
    panel.setTelemetry(sampleTelemetry);

    zAssist.value = "0.05";
    zAssist.fireInput();

    expect(panel.values.zAssistWeight).toBeCloseTo(0.05);
    expect(curlState.textContent).toBe("curled (raw: partial)");
    expect(ratio.textContent).toBe("0.74");
    // D7/D8 keep zAssistWeight disconnected from curl judgement in this task.
  });
});
