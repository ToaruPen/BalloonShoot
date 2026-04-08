import type { HandFrame } from "../../shared/types/hand";

export type TriggerState = "open" | "pulled";

export const evaluateThumbTrigger = (frame: HandFrame): TriggerState => {
  const { wrist, thumbTip, indexMcp } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y) || 1;
  const normalizedThumbTravel = (thumbTip.x - wrist.x) / handScale;

  return normalizedThumbTravel > 0.2 ? "pulled" : "open";
};
