import type { HandFrame } from "../../shared/types/hand";

export const evaluateGunPose = (frame: HandFrame): boolean => {
  const { wrist, indexTip, indexMcp, middleTip, ringTip, pinkyTip } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y) || 1;
  const curledThreshold = handScale * 0.25;

  const indexExtended = indexTip.y < indexMcp.y;
  const curledFingers = [middleTip, ringTip, pinkyTip].filter((point) => point.y > indexMcp.y + curledThreshold).length;

  return indexExtended && curledFingers >= 2;
};
