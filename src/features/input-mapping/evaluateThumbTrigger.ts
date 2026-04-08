import type { HandFrame } from "../../shared/types/hand";
import { gameConfig } from "../../shared/config/gameConfig";

export type TriggerState = "open" | "pulled";

export interface TriggerTuning {
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
}

export const evaluateThumbTrigger = (
  frame: HandFrame,
  previousState: TriggerState | undefined,
  tuning: TriggerTuning = gameConfig.input
): TriggerState => {
  const { wrist, thumbTip, indexMcp } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y) || 1;
  const normalizedThumbTravel = Math.max(0, (thumbTip.x - wrist.x) / handScale);

  if (previousState === "pulled") {
    return normalizedThumbTravel > tuning.triggerReleaseThreshold ? "pulled" : "open";
  }

  return normalizedThumbTravel > tuning.triggerPullThreshold ? "pulled" : "open";
};
