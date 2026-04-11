import { describe, expect, it } from "vitest";
import { createThumbTriggerFrame, withThumbTriggerPose } from "./thumbTriggerTestHelper";
import { gameConfig } from "../../../../src/shared/config/gameConfig";
import { mapHandToGameInput, type GameInputFrame } from "../../../../src/features/input-mapping/mapHandToGameInput";
import {
  advanceShotIntentState,
  type ShotIntentState
} from "../../../../src/features/input-mapping/shotIntentStateMachine";
import type { HandEvidence } from "../../../../src/features/input-mapping/createHandEvidence";
import type { TriggerState } from "../../../../src/features/input-mapping/evaluateThumbTrigger";

const FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55;

const createEvidence = ({
  trackingPresent = true,
  triggerState = "open",
  gunPoseConfidence = FIRE_ENTRY_GUN_POSE_CONFIDENCE
}: {
  trackingPresent?: boolean;
  triggerState?: TriggerState;
  gunPoseConfidence?: number;
} = {}): HandEvidence => ({
  trackingPresent,
  frameAtMs: undefined,
  smoothedCrosshairCandidate: null,
  trigger: trackingPresent
    ? {
        rawState: triggerState,
        confidence: 1,
        details: {
          projection: 0.25,
          pullThreshold: 0.18,
          releaseThreshold: 0.1
        }
      }
    : null,
  gunPose: trackingPresent
    ? {
        detected: gunPoseConfidence >= FIRE_ENTRY_GUN_POSE_CONFIDENCE,
        confidence: gunPoseConfidence,
        details: {
          indexExtended: true,
          curledFingerCount: 2,
          curledThreshold: 0.25
        }
      }
    : null
});

const runSequence = (steps: Parameters<typeof createEvidence>[0][]): ReturnType<typeof advanceShotIntentState>[] => {
  const results: ReturnType<typeof advanceShotIntentState>[] = [];
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
  const openFrame = withThumbTriggerPose(createThumbTriggerFrame("open"), "open");
  const first = mapHandToGameInput(openFrame, canvasSize, undefined, gameConfig.input);
  const second = mapHandToGameInput(openFrame, canvasSize, first.runtime, gameConfig.input);

  return second.runtime;
};

describe("tracking loss", () => {
  it("drops armed intent on tracking loss and requires a fresh open cycle after recovery", () => {
    const [
      first,
      second,
      third,
      fourth,
      fifth,
      sixth,
      seventh,
      eighth,
      ninth,
      tenth,
      eleventh
    ] =
      runSequence([
        { triggerState: "open" },
        { triggerState: "open" },
        { triggerState: "open" },
        { trackingPresent: false },
        { triggerState: "open" },
        { triggerState: "open" },
        { triggerState: "open" },
        { triggerState: "open" },
        { triggerState: "open" },
        { triggerState: "pulled" },
        { triggerState: "pulled" }
      ]);

    expect(first?.state.phase).toBe("idle");
    expect(second?.state.phase).toBe("ready");
    expect(third?.state.phase).toBe("armed");
    expect(fourth?.state.phase).toBe("tracking_lost");
    expect(fourth?.shotFired).toBe(false);
    expect(fifth?.state.phase).toBe("tracking_lost");
    expect(sixth?.state.phase).toBe("idle");
    expect(seventh?.state.phase).toBe("ready");
    expect(eighth?.state.phase).toBe("armed");
    expect(ninth?.state.phase).toBe("armed");
    expect(tenth?.state.phase).toBe("armed");
    expect(eleventh?.state.phase).toBe("fired");
    expect(eleventh?.shotFired).toBe(true);
  });

  it("turns missing tracking into tracking_lost and clears the crosshair", () => {
    const result = mapHandToGameInput(undefined, canvasSize, createArmedRuntime());

    expect(result.runtime.phase).toBe("tracking_lost");
    expect(result.runtime.rejectReason).toBe("tracking_lost");
    expect(result.shotFired).toBe(false);
    expect(result.crosshair).toBeUndefined();
    expect(result.runtime.crosshair).toBeUndefined();
  });
});
