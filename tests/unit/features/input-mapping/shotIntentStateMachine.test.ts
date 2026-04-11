import { describe, expect, it } from "vitest";
import {
  advanceShotIntentState,
  type ShotIntentResult,
  type ShotIntentState
} from "../../../../src/features/input-mapping/shotIntentStateMachine";
import type { HandEvidence } from "../../../../src/features/input-mapping/createHandEvidence";
import type { TriggerState } from "../../../../src/features/input-mapping/evaluateThumbTrigger";

const FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55;
const FIRE_EXIT_GUN_POSE_CONFIDENCE = 0.45;

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

const runSequence = (steps: Parameters<typeof createEvidence>[0][]): ShotIntentResult[] => {
  const results: ShotIntentResult[] = [];
  let state: ShotIntentState | undefined;

  for (const step of steps) {
    const result = advanceShotIntentState(state, createEvidence(step));
    results.push(result);
    state = result.state;
  }

  return results;
};

describe("ShotIntentStateMachine", () => {
  it("promotes idle to ready and ready to armed after three stable open frames", () => {
    const [first, second, third] = runSequence([
      { triggerState: "open" },
      { triggerState: "open" },
      { triggerState: "open" }
    ]);

    expect(first?.state.phase).toBe("idle");
    expect(first?.state.rejectReason).toBe("waiting_for_stable_open");
    expect(first?.shotFired).toBe(false);

    expect(second?.state.phase).toBe("ready");
    expect(second?.state.rejectReason).toBe("waiting_for_fire_entry");
    expect(second?.shotFired).toBe(false);

    expect(third?.state.phase).toBe("armed");
    expect(third?.state.rejectReason).toBe("waiting_for_stable_pulled");
    expect(third?.shotFired).toBe(false);
  });

  it("does not fire on a cold-start open-open-pulled-pulled sequence", () => {
    const results = runSequence([
      { triggerState: "open" },
      { triggerState: "open" },
      { triggerState: "pulled" },
      { triggerState: "pulled" }
    ]);

    expect(results.map((result) => result.state.phase)).toEqual(["idle", "ready", "ready", "ready"]);
    expect(results.some((result) => result.shotFired)).toBe(false);
  });

  it("emits shotFired exactly once on armed to fired and returns to ready after recovering", () => {
    const [first, second, third, fourth, fifth, sixth, seventh] = runSequence([
      { triggerState: "open" },
      { triggerState: "open" },
      { triggerState: "open" },
      { triggerState: "pulled" },
      { triggerState: "pulled" },
      { triggerState: "open" },
      { triggerState: "open" }
    ]);

    expect(first?.state.phase).toBe("idle");
    expect(second?.state.phase).toBe("ready");
    expect(third?.state.phase).toBe("armed");
    expect(fourth?.state.phase).toBe("armed");
    expect(fifth?.state.phase).toBe("fired");
    expect(fifth?.shotFired).toBe(true);
    expect(sixth?.state.phase).toBe("recovering");
    expect(sixth?.shotFired).toBe(false);
    expect(seventh?.state.phase).toBe("ready");
    expect(seventh?.shotFired).toBe(false);

    expect(runSequence([
      { triggerState: "open" },
      { triggerState: "open" },
      { triggerState: "open" },
      { triggerState: "pulled" },
      { triggerState: "pulled" },
      { triggerState: "pulled" },
      { triggerState: "pulled" }
    ]).filter((result) => result.shotFired)).toHaveLength(1);
  });

  it("enters tracking_lost immediately and does not re-arm until two tracking-present frames arrive", () => {
    const [first, second, third, fourth, fifth, sixth, seventh] = runSequence([
      { triggerState: "open" },
      { triggerState: "open" },
      { trackingPresent: false },
      { triggerState: "open" },
      { triggerState: "open" },
      { triggerState: "pulled" },
      { triggerState: "pulled" }
    ]);

    expect(first?.state.phase).toBe("idle");
    expect(second?.state.phase).toBe("ready");
    expect(third?.state.phase).toBe("tracking_lost");
    expect(third?.state.rejectReason).toBe("tracking_lost");
    expect(third?.shotFired).toBe(false);
    expect(fourth?.state.phase).toBe("tracking_lost");
    expect(fifth?.state.phase).toBe("idle");
    expect(sixth?.state.phase).toBe("idle");
    expect(seventh?.state.phase).toBe("idle");
    expect(runSequence([
      { triggerState: "open" },
      { triggerState: "open" },
      { trackingPresent: false },
      { triggerState: "open" },
      { triggerState: "open" },
      { triggerState: "pulled" },
      { triggerState: "pulled" }
    ]).some((result) => result.shotFired)).toBe(false);
  });

  it("keeps reject reasons separate from phases", () => {
    const idleResult = advanceShotIntentState(undefined, createEvidence({ triggerState: "open" }));
    const lostResult = advanceShotIntentState(idleResult.state, createEvidence({ trackingPresent: false }));

    expect(idleResult.state.phase).toBe("idle");
    expect(idleResult.state.rejectReason).toBe("waiting_for_stable_open");
    expect(idleResult.state.rejectReason).not.toBe(idleResult.state.phase);

    expect(lostResult.state.phase).toBe("tracking_lost");
    expect(lostResult.state.rejectReason).toBe("tracking_lost");
    expect(lostResult.state.rejectReason).not.toBe("idle");
  });

  it("keeps pose visible but blocks fire until confidence recovers above the entry threshold", () => {
    const [first, second, third, fourth, fifth, sixth] = runSequence([
      { triggerState: "open", gunPoseConfidence: FIRE_ENTRY_GUN_POSE_CONFIDENCE },
      { triggerState: "open", gunPoseConfidence: FIRE_ENTRY_GUN_POSE_CONFIDENCE },
      { triggerState: "open", gunPoseConfidence: FIRE_ENTRY_GUN_POSE_CONFIDENCE },
      { triggerState: "pulled", gunPoseConfidence: FIRE_ENTRY_GUN_POSE_CONFIDENCE },
      { triggerState: "pulled", gunPoseConfidence: FIRE_EXIT_GUN_POSE_CONFIDENCE },
      { triggerState: "pulled", gunPoseConfidence: FIRE_ENTRY_GUN_POSE_CONFIDENCE }
    ]);

    expect(first?.state.phase).toBe("idle");
    expect(second?.state.phase).toBe("ready");
    expect(third?.state.phase).toBe("armed");
    expect(fourth?.state.phase).toBe("armed");
    expect(fourth?.shotFired).toBe(false);
    expect(fifth?.state.phase).not.toBe("tracking_lost");
    expect(fifth?.state.phase).toBe("armed");
    expect(fifth?.state.gunPoseActive).toBe(true);
    expect(fifth?.shotFired).toBe(false);
    expect(sixth?.state.phase).toBe("fired");
    expect(sixth?.shotFired).toBe(true);
  });
});
