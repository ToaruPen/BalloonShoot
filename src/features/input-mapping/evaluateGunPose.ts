import type { HandFrame } from "../../shared/types/hand";

export const evaluateGunPose = (frame: HandFrame): boolean => {
  const { indexTip, indexMcp, middleTip, ringTip, pinkyTip } = frame.landmarks;

  const indexExtended = indexTip.y < indexMcp.y;
  const curledFingers = [middleTip, ringTip, pinkyTip].filter((point) => point.y > indexMcp.y + 0.1).length;

  return indexExtended && curledFingers >= 2;
};
