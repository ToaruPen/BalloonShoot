import type { HandFrame } from "../../../../src/shared/types/hand";

export interface IndexCurlFrameOptions {
  /** distance(indexTip, indexMcp) / handScale value to bake into the frame */
  ratio: number;
  /** handScale = hypot(indexMcp - wrist). Default 1 (unit scale) */
  handScale?: number;
  /** zDelta = indexTip.z - indexMcp.z baked into the frame */
  zDelta?: number;
  /** Mirror the frame horizontally (simulate the other hand) */
  mirror?: boolean;
}

/**
 * Constructs a deterministic HandFrame whose
 * `distance(indexTip, indexMcp) / hypot(indexMcp - wrist)` equals `ratio`.
 *
 * The wrist is at (0.5, 0.9), the indexMcp is `handScale` units above it,
 * and the indexTip is `ratio * handScale` units further in the same direction.
 */
export const createIndexCurlFrame = ({
  ratio,
  handScale = 0.2,
  zDelta = 0,
  mirror = false
}: IndexCurlFrameOptions): HandFrame => {
  const wrist = { x: 0.5, y: 0.9, z: 0 };
  const indexMcp = { x: wrist.x, y: wrist.y - handScale, z: 0 };
  const indexTip = { x: indexMcp.x, y: indexMcp.y - ratio * handScale, z: zDelta };

  const frame: HandFrame = {
    width: 640,
    height: 480,
    landmarks: {
      wrist,
      thumbIp: { x: wrist.x - 0.05, y: wrist.y - 0.05, z: 0 },
      thumbTip: { x: wrist.x - 0.08, y: wrist.y - 0.08, z: 0 },
      indexMcp,
      indexPip: { x: indexMcp.x, y: indexMcp.y - 0.33 * handScale, z: 0 },
      indexDip: { x: indexMcp.x, y: indexMcp.y - 0.66 * handScale, z: 0 },
      indexTip,
      middleTip: { x: wrist.x + 0.02, y: wrist.y, z: 0 },
      ringTip: { x: wrist.x + 0.04, y: wrist.y, z: 0 },
      pinkyTip: { x: wrist.x + 0.06, y: wrist.y, z: 0 }
    }
  };

  if (!mirror) {
    return frame;
  }

  const mirrored = (point: { x: number; y: number; z: number }) => ({
    x: 1 - point.x,
    y: point.y,
    z: point.z
  });

  return {
    ...frame,
    landmarks: {
      wrist: mirrored(frame.landmarks.wrist),
      thumbIp: mirrored(frame.landmarks.thumbIp),
      thumbTip: mirrored(frame.landmarks.thumbTip),
      indexMcp: mirrored(frame.landmarks.indexMcp),
      indexPip: mirrored(frame.landmarks.indexPip),
      indexDip: mirrored(frame.landmarks.indexDip),
      indexTip: mirrored(frame.landmarks.indexTip),
      middleTip: mirrored(frame.landmarks.middleTip),
      ringTip: mirrored(frame.landmarks.ringTip),
      pinkyTip: mirrored(frame.landmarks.pinkyTip)
    }
  };
};
