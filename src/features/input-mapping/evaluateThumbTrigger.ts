import type { HandFrame } from "../../shared/types/hand";

export type TriggerState = "open" | "pulled";

export const evaluateThumbTrigger = (frame: HandFrame): TriggerState => {
  const { thumbTip, thumbIp } = frame.landmarks;

  return thumbTip.x > thumbIp.x ? "pulled" : "open";
};
