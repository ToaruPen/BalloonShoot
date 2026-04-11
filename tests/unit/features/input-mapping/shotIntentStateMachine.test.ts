import { describe, expect, it } from "vitest";
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

describe("ShotIntentStateMachine (curl)", () => {
  it("promotes idle -> ready -> armed after stable extended frames", () => {
    const [first, second, third] = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }
    ]);
    expect(first?.state.phase).toBe("idle");
    expect(second?.state.phase).toBe("ready");
    expect(third?.state.phase).toBe("armed");
    expect(third?.crosshairLockAction).toBe("none");
  });

  it("does not fire while extended is held", () => {
    const results = runSequence(Array.from({ length: 10 }, () => ({ rawCurlState: "extended" })));
    expect(results.every((r) => !r.shotFired)).toBe(true);
  });

  it("emits a freeze action on the first armed frame that observes partial", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { rawCurlState: "partial" } // expect freeze
    ]);
    const lockActions = results.map((r) => r.crosshairLockAction);
    expect(lockActions[0]).toBe("none");
    expect(lockActions[3]).toBe("freeze");
  });

  it("does not fire on a single curled frame", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { rawCurlState: "partial" },
      { rawCurlState: "curled" }, // 1 curled frame
      { rawCurlState: "partial" } // backed off
    ]);
    expect(results.some((r) => r.shotFired)).toBe(false);
  });

  it("fires after two consecutive curled frames", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { rawCurlState: "partial" },
      { rawCurlState: "curled" },
      { rawCurlState: "curled" } // fire
    ]);
    expect(results[5]?.shotFired).toBe(true);
    expect(results[5]?.state.phase).toBe("fired");
  });

  it("does not fire while only partial is sustained", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      ...Array.from({ length: 30 }, () => ({ rawCurlState: "partial" as const }))
    ]);
    expect(results.some((r) => r.shotFired)).toBe(false);
  });

  it("blocks re-fire until extended is confirmed for two frames, then emits release", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { rawCurlState: "partial" },
      { rawCurlState: "curled" },
      { rawCurlState: "curled" }, // fired
      { rawCurlState: "extended" }, // recovering, 1 frame extended
      { rawCurlState: "extended" } // ready, lockAction = release
    ]);
    const releaseActions = results.map((r) => r.crosshairLockAction);
    expect(results[5]?.shotFired).toBe(true);
    expect(results[6]?.state.phase).toBe("recovering");
    expect(results[7]?.state.phase).toBe("ready");
    expect(releaseActions[7]).toBe("release");
  });

  it("does not arm on a cold start that begins in partial or curled", () => {
    const partialFirst = runSequence([
      { rawCurlState: "partial" },
      { rawCurlState: "partial" },
      { rawCurlState: "partial" }
    ]);
    expect(partialFirst.every((r) => r.state.phase !== "armed")).toBe(true);
    expect(partialFirst.every((r) => r.crosshairLockAction !== "freeze")).toBe(true);

    const curledFirst = runSequence([
      { rawCurlState: "curled" },
      { rawCurlState: "curled" },
      { rawCurlState: "curled" }
    ]);
    expect(curledFirst.every((r) => r.state.phase !== "armed")).toBe(true);
    expect(curledFirst.every((r) => r.crosshairLockAction !== "freeze")).toBe(true);
  });

  it("emits release when tracking is lost", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { trackingPresent: false }
    ]);
    expect(results[3]?.crosshairLockAction).toBe("release");
    expect(results[3]?.state.phase).toBe("tracking_lost");
  });

  it("emits release when gun-pose is lost (after grace frames)", () => {
    const results = runSequence([
      { rawCurlState: "extended" },
      { rawCurlState: "extended" },
      { rawCurlState: "extended" }, // armed
      { gunPoseConfidence: 0 },
      { gunPoseConfidence: 0 },
      { gunPoseConfidence: 0 }
    ]);
    const releaseEmitted = results.some((r) => r.crosshairLockAction === "release");
    expect(releaseEmitted).toBe(true);
  });
});
