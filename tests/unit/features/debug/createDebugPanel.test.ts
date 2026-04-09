import { describe, expect, it } from "vitest";
import {
  createDebugPanel,
  type DebugInputElement,
  type DebugValues
} from "../../../../src/features/debug/createDebugPanel";

const sampleInitial: DebugValues = {
  smoothingAlpha: 0.28,
  triggerPullThreshold: 0.18,
  triggerReleaseThreshold: 0.1
};

interface FakeInput extends DebugInputElement {
  fireInput: () => void;
}

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

describe("createDebugPanel", () => {
  it("starts with a copy of the initial values", () => {
    const panel = createDebugPanel(sampleInitial);

    expect(panel.values).toEqual(sampleInitial);
    expect(panel.values).not.toBe(sampleInitial);
  });

  it("renders a labelled slider for every debug key with current values", () => {
    const panel = createDebugPanel(sampleInitial);

    const html = panel.render();

    expect(html).toContain('class="debug-panel"');
    expect(html).toContain('data-debug="smoothingAlpha"');
    expect(html).toContain('data-debug="triggerPullThreshold"');
    expect(html).toContain('data-debug="triggerReleaseThreshold"');
    expect(html).toContain('value="0.28"');
    expect(html).toContain('value="0.18"');
    expect(html).toContain('value="0.1"');
    expect(html).toContain('min="0.05"');
    expect(html).toContain('max="0.4"');
    expect(html).toContain('min="0.02"');
    expect(html).toContain('max="0.25"');
  });

  it("updates values in place when bound inputs fire", () => {
    const panel = createDebugPanel(sampleInitial);
    const smoothing = createFakeInput("smoothingAlpha", "0.28");
    const pull = createFakeInput("triggerPullThreshold", "0.18");
    const release = createFakeInput("triggerReleaseThreshold", "0.1");

    panel.bind([smoothing, pull, release]);

    smoothing.value = "0.42";
    smoothing.fireInput();
    pull.value = "0.35";
    pull.fireInput();
    release.value = "0.08";
    release.fireInput();

    expect(panel.values.smoothingAlpha).toBeCloseTo(0.42);
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.35);
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.08);
  });

  it("keeps release at least one step below pull when either threshold changes", () => {
    const panel = createDebugPanel(sampleInitial);
    const pull = createFakeInput("triggerPullThreshold", "0.18");
    const release = createFakeInput("triggerReleaseThreshold", "0.1");

    panel.bind([pull, release]);

    release.value = "0.3";
    release.fireInput();
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.18);
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.17);
    expect(pull.value).toBe("0.18");
    expect(release.value).toBe("0.17");

    pull.value = "0.12";
    pull.fireInput();
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.12);
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.11);
    expect(pull.value).toBe("0.12");
    expect(release.value).toBe("0.11");
  });

  it("keeps the values reference stable so external loops can hold it", () => {
    const panel = createDebugPanel(sampleInitial);
    const ref = panel.values;

    panel.bind([]);

    expect(panel.values).toBe(ref);
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

    smoothing.value = "not-a-number";
    smoothing.fireInput();

    expect(panel.values.smoothingAlpha).toBe(sampleInitial.smoothingAlpha);
  });

  it("clamps out-of-range values to the slider bounds", () => {
    const panel = createDebugPanel(sampleInitial);
    const smoothing = createFakeInput("smoothingAlpha", "0.28");
    const pull = createFakeInput("triggerPullThreshold", "0.18");
    const release = createFakeInput("triggerReleaseThreshold", "0.1");

    panel.bind([smoothing, pull, release]);

    smoothing.value = "0.9";
    smoothing.fireInput();
    expect(panel.values.smoothingAlpha).toBeCloseTo(0.6);

    smoothing.value = "0.05";
    smoothing.fireInput();
    expect(panel.values.smoothingAlpha).toBeCloseTo(0.1);

    pull.value = "0.8";
    pull.fireInput();
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.4);

    pull.value = "0.01";
    pull.fireInput();
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.05);

    // Release clamps to its own max (0.25) and then to pull - gap (0.05 - 0.01).
    pull.value = "0.05";
    pull.fireInput();
    release.value = "0.5";
    release.fireInput();
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.04);

    release.value = "0.01";
    release.fireInput();
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.02);
  });

  it("clamps out-of-range initial values so untrusted config cannot render outside bounds", () => {
    const panel = createDebugPanel({
      smoothingAlpha: 0.05,
      triggerPullThreshold: 0.06,
      triggerReleaseThreshold: 0.25
    });

    expect(panel.values.smoothingAlpha).toBeCloseTo(0.1);
    expect(panel.values.triggerPullThreshold).toBeCloseTo(0.06);
    expect(panel.values.triggerReleaseThreshold).toBeCloseTo(0.05);
  });
});
