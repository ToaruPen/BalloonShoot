import { describe, expect, it } from "vitest";
import {
  measureIndexCurl,
  type IndexCurlState,
  type IndexCurlTuning
} from "../../../../src/features/input-mapping/evaluateIndexCurl";
import { createIndexCurlFrame } from "./indexCurlTestHelper";

const tuning: IndexCurlTuning = {
  extendedThreshold: 1.15,
  curledThreshold: 0.65,
  curlHysteresisGap: 0.05,
  zAssistWeight: 0
};

const measure = (
  ratio: number,
  previous: IndexCurlState | undefined,
  options: { zDelta?: number; mirror?: boolean; handScale?: number } = {}
) => measureIndexCurl(createIndexCurlFrame({ ratio, ...options }), previous, tuning);

describe("measureIndexCurl", () => {
  it("returns 'extended' when ratio is well above the extended threshold", () => {
    expect(measure(1.4, undefined).rawCurlState).toBe("extended");
  });

  it("returns 'curled' when ratio is well below the curled threshold", () => {
    expect(measure(0.45, undefined).rawCurlState).toBe("curled");
  });

  it("returns 'partial' when ratio sits between thresholds", () => {
    expect(measure(0.9, undefined).rawCurlState).toBe("partial");
  });

  it("does not flicker on a single noisy frame inside the hysteresis gap (extended → partial)", () => {
    expect(measure(1.18, "extended").rawCurlState).toBe("extended");
  });

  it("does not flicker on a single noisy frame inside the hysteresis gap (partial → curled)", () => {
    expect(measure(0.68, "curled").rawCurlState).toBe("curled");
  });

  it("transitions extended → partial when ratio drops past the extended threshold", () => {
    expect(measure(1.10, "extended").rawCurlState).toBe("partial");
  });

  it("transitions partial → curled when ratio drops past the curled threshold", () => {
    expect(measure(0.55, "partial").rawCurlState).toBe("curled");
  });

  it("transitions curled → partial when ratio rises past curled + hysteresis", () => {
    expect(measure(0.75, "curled").rawCurlState).toBe("partial");
  });

  it("transitions partial → extended when ratio rises past extended + hysteresis", () => {
    expect(measure(1.25, "partial").rawCurlState).toBe("extended");
  });

  it("does NOT transition partial → extended inside the hysteresis gap (1.18 < 1.20)", () => {
    // Spec D3 requires a 0.05 gap on the partial → extended boundary so a single
    // noisy frame at 1.16-1.19 cannot re-arm after a freeze.
    expect(measure(1.18, "partial").rawCurlState).toBe("partial");
  });

  it("normalises by handScale so the same ratio gives the same state across hand sizes", () => {
    expect(measure(0.55, undefined, { handScale: 0.1 }).rawCurlState).toBe("curled");
    expect(measure(0.55, undefined, { handScale: 0.3 }).rawCurlState).toBe("curled");
  });

  it("returns the same state for mirrored (left-hand) frames", () => {
    expect(measure(0.55, undefined, { mirror: true }).rawCurlState).toBe("curled");
    expect(measure(1.4, undefined, { mirror: true }).rawCurlState).toBe("extended");
  });

  it("reports the raw distance ratio in `details.ratio`", () => {
    const result = measure(0.9, undefined);
    expect(result.details.ratio).toBeCloseTo(0.9, 5);
  });

  it("reports zDelta = indexTip.z - indexMcp.z", () => {
    const result = measure(0.9, undefined, { zDelta: -0.05 });
    expect(result.details.zDelta).toBeCloseTo(-0.05, 5);
  });

  it("does not feed zDelta into curl confidence when zAssistWeight is 0", () => {
    const withoutZ = measure(0.9, undefined, { zDelta: 0 });
    const withZ = measure(0.9, undefined, { zDelta: -0.5 });
    expect(withZ.confidence).toBeCloseTo(withoutZ.confidence, 5);
  });

  it("safely returns the previous state when handScale is zero", () => {
    const frame = createIndexCurlFrame({ ratio: 0.9, handScale: 0 });
    const result = measureIndexCurl(frame, "extended", tuning);
    expect(result.rawCurlState).toBe("extended");
  });
});
