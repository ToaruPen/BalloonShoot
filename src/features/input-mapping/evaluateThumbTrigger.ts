import type { HandFrame } from "../../shared/types/hand";
import { gameConfig } from "../../shared/config/gameConfig";

export type TriggerState = "open" | "pulled";

export interface ThumbTriggerMeasurement {
  rawState: TriggerState;
  confidence: number;
  details: {
    projection: number;
    pullThreshold: number;
    releaseThreshold: number;
  };
}

export interface TriggerTuning {
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
}

const HYSTERESIS_GAP = 0.01;

const measureThumbPull = (frame: HandFrame): number => {
  const { wrist, indexMcp, thumbIp, thumbTip } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y) || 1;
  const axisX = indexMcp.x - thumbIp.x;
  const axisY = indexMcp.y - thumbIp.y;
  const axisLength = Math.hypot(axisX, axisY) || 1;
  const thumbX = thumbTip.x - thumbIp.x;
  const thumbY = thumbTip.y - thumbIp.y;
  const projection = (thumbX * axisX + thumbY * axisY) / axisLength;

  return projection / handScale;
};

const normalizeTriggerTuning = (tuning: TriggerTuning): TriggerTuning => {
  const triggerPullThreshold = Number.isFinite(tuning.triggerPullThreshold)
    ? tuning.triggerPullThreshold
    : gameConfig.input.triggerPullThreshold;
  const triggerReleaseThreshold = Number.isFinite(tuning.triggerReleaseThreshold)
    ? tuning.triggerReleaseThreshold
    : gameConfig.input.triggerReleaseThreshold;

  return {
    triggerPullThreshold,
    triggerReleaseThreshold: Math.min(
      triggerReleaseThreshold,
      triggerPullThreshold - HYSTERESIS_GAP
    )
  };
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export const measureThumbTrigger = (
  frame: HandFrame,
  previousState: TriggerState | undefined,
  tuning: TriggerTuning = gameConfig.input
): ThumbTriggerMeasurement => {
  const thumbPull = measureThumbPull(frame);
  const safeTuning = normalizeTriggerTuning(tuning);
  const rawState =
    previousState === "pulled"
      ? thumbPull > safeTuning.triggerReleaseThreshold
        ? "pulled"
        : "open"
      : thumbPull > safeTuning.triggerPullThreshold
        ? "pulled"
        : "open";
  const confidenceRange = Math.max(
    safeTuning.triggerPullThreshold - safeTuning.triggerReleaseThreshold,
    Number.EPSILON
  );
  const confidence =
    rawState === "pulled"
      ? clamp01((thumbPull - safeTuning.triggerReleaseThreshold) / confidenceRange)
      : clamp01((safeTuning.triggerPullThreshold - thumbPull) / confidenceRange);

  return {
    rawState,
    confidence,
    details: {
      projection: thumbPull,
      pullThreshold: safeTuning.triggerPullThreshold,
      releaseThreshold: safeTuning.triggerReleaseThreshold
    }
  };
};

export const evaluateThumbTrigger = (
  frame: HandFrame,
  previousState: TriggerState | undefined,
  tuning: TriggerTuning = gameConfig.input
): TriggerState => {
  return measureThumbTrigger(frame, previousState, tuning).rawState;
};
