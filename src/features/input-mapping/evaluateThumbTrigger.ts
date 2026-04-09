import type { HandFrame } from "../../shared/types/hand";
import { gameConfig } from "../../shared/config/gameConfig";

export type TriggerState = "open" | "pulled";

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

export const evaluateThumbTrigger = (
  frame: HandFrame,
  previousState: TriggerState | undefined,
  tuning: TriggerTuning = gameConfig.input
): TriggerState => {
  const thumbPull = measureThumbPull(frame);
  const safeTuning = normalizeTriggerTuning(tuning);

  if (previousState === "pulled") {
    return thumbPull > safeTuning.triggerReleaseThreshold ? "pulled" : "open";
  }

  return thumbPull > safeTuning.triggerPullThreshold ? "pulled" : "open";
};
