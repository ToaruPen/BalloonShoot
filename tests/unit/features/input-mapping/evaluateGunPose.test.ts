import { describe, expect, it } from "vitest";
import { measureGunPose } from "../../../../src/features/input-mapping/evaluateGunPose";
import type { HandFrame } from "../../../../src/shared/types/hand";

const baseLandmarks = (): HandFrame["landmarks"] => ({
  wrist: { x: 0.5, y: 0.9, z: 0 },
  indexMcp: { x: 0.5, y: 0.7, z: 0 },
  indexPip: { x: 0.5, y: 0.6, z: 0 },
  indexDip: { x: 0.5, y: 0.5, z: 0 },
  indexTip: { x: 0.5, y: 0.4, z: 0 }, // straight up
  thumbIp: { x: 0.45, y: 0.85, z: 0 },
  thumbTip: { x: 0.42, y: 0.82, z: 0 },
  middleTip: { x: 0.52, y: 0.85, z: 0 }, // folded (below indexMcp + threshold)
  ringTip: { x: 0.54, y: 0.86, z: 0 },
  pinkyTip: { x: 0.56, y: 0.87, z: 0 }
});

const buildFrame = (overrides?: Partial<HandFrame["landmarks"]>): HandFrame => ({
  width: 640,
  height: 480,
  landmarks: { ...baseLandmarks(), ...overrides }
});

describe("measureGunPose", () => {
  it("detects gun-pose when middle, ring, and pinky are folded — regardless of index curl", () => {
    expect(measureGunPose(buildFrame()).detected).toBe(true);
  });

  it("still detects gun-pose when the index finger is bent (curl trigger fired)", () => {
    const bentIndex = buildFrame({
      indexTip: { x: 0.5, y: 0.72, z: 0 } // tip dropped below indexMcp.y
    });
    expect(measureGunPose(bentIndex).detected).toBe(true);
  });

  it("does not detect gun-pose when fewer than 2 of (middle, ring, pinky) are folded", () => {
    const fewerThanTwo = buildFrame({
      middleTip: { x: 0.52, y: 0.4, z: 0 }, // sticking up
      ringTip: { x: 0.54, y: 0.4, z: 0 } // also sticking up
    });
    expect(measureGunPose(fewerThanTwo).detected).toBe(false);
  });

  it("does not regress on the prior smoke fixture: open hand returns false", () => {
    const openHand = buildFrame({
      middleTip: { x: 0.52, y: 0.4, z: 0 },
      ringTip: { x: 0.54, y: 0.4, z: 0 },
      pinkyTip: { x: 0.56, y: 0.4, z: 0 }
    });
    expect(measureGunPose(openHand).detected).toBe(false);
  });

  it("reports `details.indexExtended` for backward inspection but does not gate `detected` on it", () => {
    const bent = buildFrame({ indexTip: { x: 0.5, y: 0.72, z: 0 } });
    const result = measureGunPose(bent);
    expect(result.details.indexExtended).toBe(false);
    expect(result.detected).toBe(true);
  });

  it("keeps confidence above FIRE_EXIT_GUN_POSE_CONFIDENCE for a 'two fingers un-folded' wobble", () => {
    // Pose-drop tolerance contract: a frame where only one of middle/ring/pinky
    // is folded must still produce confidence > 0.45 so the state machine's
    // hysteresis exit can keep `armed` alive for a frame.
    const wobble = buildFrame({
      middleTip: { x: 0.52, y: 0.4, z: 0 }, // un-folded
      ringTip: { x: 0.54, y: 0.4, z: 0 } // un-folded; only pinky folded
    });
    const result = measureGunPose(wobble);
    expect(result.detected).toBe(false);
    expect(result.details.curledFingerCount).toBe(1);
    expect(result.confidence).toBeGreaterThan(0.45);
  });

  it("collapses confidence to 0 when no fingers are folded (fully open hand drops out)", () => {
    const open = buildFrame({
      middleTip: { x: 0.52, y: 0.4, z: 0 },
      ringTip: { x: 0.54, y: 0.4, z: 0 },
      pinkyTip: { x: 0.56, y: 0.4, z: 0 }
    });
    const result = measureGunPose(open);
    expect(result.detected).toBe(false);
    expect(result.confidence).toBe(0);
  });
});
