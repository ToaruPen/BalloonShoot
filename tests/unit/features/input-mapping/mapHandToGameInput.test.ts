import { describe, expect, it } from "vitest";
import {
  mapHandToGameInput,
  type InputRuntimeState
} from "../../../../src/features/input-mapping/mapHandToGameInput";
import type { InputTuning } from "../../../../src/features/input-mapping/mapHandToGameInput";
import { createIndexCurlFrame } from "./indexCurlTestHelper";

const VIEWPORT = { width: 1280, height: 720 };
const TUNING: InputTuning = {
  smoothingAlpha: 0.28,
  extendedThreshold: 1.15,
  curledThreshold: 0.65,
  curlHysteresisGap: 0.05,
  zAssistWeight: 0
};

const advance = (
  steps: { ratio: number }[]
): ReturnType<typeof mapHandToGameInput>[] => {
  const results: ReturnType<typeof mapHandToGameInput>[] = [];
  let runtime: InputRuntimeState | undefined;

  for (const step of steps) {
    const frame = createIndexCurlFrame({ ratio: step.ratio });
    const next = mapHandToGameInput(frame, VIEWPORT, runtime, TUNING);
    results.push(next);
    runtime = next.runtime;
  }

  return results;
};

describe("mapHandToGameInput (curl orchestration)", () => {
  it("updates lastExtendedCrosshair only on extended frames", () => {
    const results = advance([
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 0.9 },
      { ratio: 0.5 }
    ]);
    const lastExtendedHistory = results.map((r) => r.runtime.lastExtendedCrosshair);

    expect(lastExtendedHistory[0]).toBeDefined();
    expect(lastExtendedHistory[1]).toBeDefined();
    expect(lastExtendedHistory[2]).toEqual(lastExtendedHistory[1]);
    expect(lastExtendedHistory[3]).toEqual(lastExtendedHistory[1]);
  });

  it("locks the crosshair to lastExtendedCrosshair when state machine emits freeze", () => {
    const results = advance([
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 0.9 }
    ]);
    const last = results[3];

    expect(last?.crosshairLockAction).toBe("freeze");
    expect(last?.runtime.lockedCrosshair).toBeDefined();
    expect(last?.crosshair).toEqual(last?.runtime.lockedCrosshair);
  });

  it("uses the locked crosshair as the shot coordinate", () => {
    const results = advance([
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 0.9 },
      { ratio: 0.5 },
      { ratio: 0.5 }
    ]);
    const fireFrame = results[5];

    expect(fireFrame?.shotFired).toBe(true);
    expect(fireFrame?.crosshair).toEqual(results[3]?.runtime.lockedCrosshair);
  });

  it("does not lock the crosshair on a cold start that begins in partial (no lastExtendedCrosshair yet)", () => {
    const results = advance([
      { ratio: 0.9 },
      { ratio: 0.9 },
      { ratio: 0.5 }
    ]);

    expect(results.every((r) => r.runtime.lockedCrosshair === undefined)).toBe(true);
  });

  it("releases the lock once two extended frames are observed after a fire", () => {
    const results = advance([
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 1.4 },
      { ratio: 0.9 },
      { ratio: 0.5 },
      { ratio: 0.5 },
      { ratio: 1.4 },
      { ratio: 1.4 }
    ]);

    expect(results[7]?.crosshairLockAction).toBe("release");
    expect(results[7]?.runtime.lockedCrosshair).toBeUndefined();
  });

  it("falls back to projectedCrosshairCandidate when neither locked nor lastExtended is set", () => {
    const result = mapHandToGameInput(
      createIndexCurlFrame({ ratio: 0.9 }),
      VIEWPORT,
      undefined,
      TUNING
    );

    expect(result.crosshair).toBeDefined();
    expect(result.runtime.lastExtendedCrosshair).toBeUndefined();
  });
});
