import { gameConfig } from "../../shared/config/gameConfig";
import type { HandFrame } from "../../shared/types/hand";
import {
  smoothCrosshair,
  type CrosshairPoint
} from "./createCrosshairSmoother";
import {
  measureGunPose,
  type GunPoseMeasurement
} from "./evaluateGunPose";
import {
  measureThumbTrigger,
  type ThumbTriggerMeasurement,
  type TriggerState,
  type TriggerTuning
} from "./evaluateThumbTrigger";
import type { ViewportSize } from "./projectLandmarkToViewport";
import { projectLandmarkToViewport } from "./projectLandmarkToViewport";

interface HandEvidenceRuntimeState {
  crosshair?: CrosshairPoint | undefined;
  rawTriggerState?: TriggerState | undefined;
}

export interface HandEvidenceTuning extends TriggerTuning {
  smoothingAlpha: number;
}

export interface HandEvidence {
  trackingPresent: boolean;
  frameAtMs: number | undefined;
  smoothedCrosshairCandidate: CrosshairPoint | null;
  trigger: ThumbTriggerMeasurement | null;
  gunPose: GunPoseMeasurement | null;
}

export const buildHandEvidence = (
  frame: HandFrame | undefined,
  viewportSize: ViewportSize,
  runtime: HandEvidenceRuntimeState | undefined,
  frameAtMs?: number,
  tuning: HandEvidenceTuning = gameConfig.input
): HandEvidence => {
  if (!frame) {
    return {
      trackingPresent: false,
      frameAtMs,
      smoothedCrosshairCandidate: null,
      trigger: null,
      gunPose: null
    };
  }

  const projectedCrosshair = projectLandmarkToViewport(
    frame.landmarks.indexTip,
    { width: frame.width, height: frame.height },
    viewportSize,
    { mirrorX: true }
  );
  const smoothedCrosshairCandidate = smoothCrosshair(
    runtime?.crosshair,
    projectedCrosshair,
    tuning.smoothingAlpha
  );
  const trigger = measureThumbTrigger(frame, runtime?.rawTriggerState, tuning);
  const gunPose = measureGunPose(frame);

  return {
    trackingPresent: true,
    frameAtMs,
    smoothedCrosshairCandidate,
    trigger,
    gunPose
  };
};
