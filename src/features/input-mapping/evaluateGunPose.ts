import type { HandFrame } from "../../shared/types/hand";

const FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55;

export interface GunPoseMeasurement {
  detected: boolean;
  confidence: number;
  details: {
    indexExtended: boolean;
    curledFingerCount: number;
    curledThreshold: number;
  };
}

export const measureGunPose = (frame: HandFrame): GunPoseMeasurement => {
  const { wrist, indexTip, indexMcp, middleTip, ringTip, pinkyTip } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y) || 1;
  const curledThreshold = handScale * 0.25;
  const indexExtended = indexTip.y < indexMcp.y;
  const curledFingerCount = [middleTip, ringTip, pinkyTip].filter(
    (point) => point.y > indexMcp.y + curledThreshold
  ).length;

  // Gun-pose is now defined ONLY by the other three fingers being folded.
  // Index curl/extension is the curl trigger's responsibility, not gun-pose's.
  const detected = curledFingerCount >= 2;
  // Confidence shape mirrors the previous trigger's: high when detected, capped
  // just below FIRE_ENTRY for "near-pose" frames so the state machine's
  // FIRE_EXIT_GUN_POSE_CONFIDENCE = 0.45 hysteresis still keeps `armed` alive
  // through a single-frame finger wobble. A frame with zero folded fingers
  // collapses to 0 so a fully open hand drops out cleanly.
  const hasAnyFold = curledFingerCount >= 1;
  const rawConfidence = hasAnyFold ? Math.min(1, 0.5 + curledFingerCount / 6) : 0;
  const confidence = detected
    ? rawConfidence
    : Math.min(rawConfidence, FIRE_ENTRY_GUN_POSE_CONFIDENCE - Number.EPSILON);

  return {
    detected,
    confidence,
    details: {
      indexExtended,
      curledFingerCount,
      curledThreshold
    }
  };
};

export const evaluateGunPose = (frame: HandFrame): boolean => {
  return measureGunPose(frame).detected;
};
