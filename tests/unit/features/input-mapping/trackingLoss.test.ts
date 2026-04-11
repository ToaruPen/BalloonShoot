import { describe, expect, it } from "vitest";
import { createIndexCurlFrame } from "./indexCurlTestHelper";
import { gameConfig } from "../../../../src/shared/config/gameConfig";
import {
  mapHandToGameInput,
  type GameInputFrame
} from "../../../../src/features/input-mapping/mapHandToGameInput";
import {
  advanceShotIntentState,
  type ShotIntentResult,
  type ShotIntentState
} from "../../../../src/features/input-mapping/shotIntentStateMachine";
import type { HandEvidence } from "../../../../src/features/input-mapping/createHandEvidence";
import type { IndexCurlState } from "../../../../src/features/input-mapping/evaluateIndexCurl";

const FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55;

interface EvidenceOptions {
  trackingPresent?: boolean;
  rawCurlState?: IndexCurlState;
  gunPoseConfidence?: number;
}

const createEvidence = ({
  trackingPresent = true,
  rawCurlState = "extended",
  gunPoseConfidence = FIRE_ENTRY_GUN_POSE_CONFIDENCE
}: EvidenceOptions = {}): HandEvidence => ({
  trackingPresent,
  frameAtMs: undefined,
  projectedCrosshairCandidate: trackingPresent ? { x: 0.5, y: 0.5 } : null,
  curl: trackingPresent
    ? {
        rawCurlState,
        confidence: 1,
        details: {
          ratio: rawCurlState === "extended" ? 1.4 : rawCurlState === "curled" ? 0.5 : 0.9,
          zDelta: 0,
          extendedThreshold: 1.15,
          curledThreshold: 0.65,
          curlHysteresisGap: 0.05
        }
      }
    : null,
  gunPose: trackingPresent
    ? {
        detected: gunPoseConfidence >= FIRE_ENTRY_GUN_POSE_CONFIDENCE,
        confidence: gunPoseConfidence,
        details: {
          indexExtended: false,
          curledFingerCount: 3,
          curledThreshold: 0.05
        }
      }
    : null
});

const runSequence = (steps: EvidenceOptions[]): ShotIntentResult[] => {
  const results: ShotIntentResult[] = [];
  let state: ShotIntentState | undefined;

  for (const step of steps) {
    const result = advanceShotIntentState(state, createEvidence(step));
    results.push(result);
    state = result.state;
  }

  return results;
};

const canvasSize = { width: 1280, height: 720 };

const createArmedRuntime = (): GameInputFrame["runtime"] => {
  const openFrame = createIndexCurlFrame({ ratio: 1.4 });
  const first = mapHandToGameInput(openFrame, canvasSize, undefined, gameConfig.input);
  const second = mapHandToGameInput(openFrame, canvasSize, first.runtime, gameConfig.input);
  const third = mapHandToGameInput(openFrame, canvasSize, second.runtime, gameConfig.input);

  return third.runtime;
};

describe("tracking loss", () => {
  it("drops armed intent on tracking loss and requires a fresh extended cycle after recovery", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { trackingPresent: false },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "partial" },
      { rawCurlState: "curled" },
      { rawCurlState: "curled" }
    ]);

    expect(results[0]?.state.phase).toBe("idle");
    expect(results[1]?.state.phase).toBe("ready");
    expect(results[2]?.state.phase).toBe("armed");
    expect(results[3]?.state.phase).toBe("tracking_lost");
    expect(results[3]?.shotFired).toBe(false);
    expect(results[3]?.crosshairLockAction).toBe("release");
    // Tracking recovers — state machine needs fresh extended cycle before arming again.
    expect(results[4]?.state.phase).toBe("tracking_lost");
    expect(results[5]?.state.phase).toBe("idle");
    expect(results[6]?.state.phase).toBe("ready");
    expect(results[7]?.state.phase).toBe("armed");
    // A freshly observed partial after the new armed state produces freeze.
    expect(results[9]?.crosshairLockAction).toBe("freeze");
    // 2-frame curled confirmation fires.
    expect(results[11]?.state.phase).toBe("fired");
    expect(results[11]?.shotFired).toBe(true);
  });

  it("turns missing tracking into tracking_lost, clears the crosshair, and releases the lock", () => {
    const result = mapHandToGameInput(undefined, canvasSize, createArmedRuntime());

    expect(result.runtime.phase).toBe("tracking_lost");
    expect(result.runtime.rejectReason).toBe("tracking_lost");
    expect(result.shotFired).toBe(false);
    expect(result.crosshair).toBeUndefined();
    expect(result.crosshairLockAction).toBe("release");
    expect(result.runtime.lockedCrosshair).toBeUndefined();
    expect(result.runtime.rawCurlState).toBe("partial");
    expect(result.runtime.curledFrames).toBe(0);
    expect(result.runtime.extendedFrames).toBe(0);
  });
});
