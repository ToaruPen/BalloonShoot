import type { HandFrame, Point3D } from "../../../../src/shared/types/hand";

export type ThumbTriggerPose = "open" | "latched" | "pulled";

export interface ThumbTriggerGeometryOptions {
  scale?: number;
}

const BASE_WIDTH = 640;
const BASE_HEIGHT = 480;

const BASE_LANDMARKS: HandFrame["landmarks"] = {
  wrist: { x: 0.4, y: 0.7, z: 0 },
  indexTip: { x: 0.5, y: 0.3, z: 0 },
  indexMcp: { x: 0.47, y: 0.48, z: 0 },
  thumbIp: { x: 0.37, y: 0.57, z: 0 },
  thumbTip: { x: 0.3, y: 0.6, z: 0 },
  middleTip: { x: 0.45, y: 0.64, z: 0 },
  ringTip: { x: 0.42, y: 0.66, z: 0 },
  pinkyTip: { x: 0.39, y: 0.67, z: 0 }
};

const TRIGGER_PROJECTION: Record<ThumbTriggerPose, number> = {
  open: 0.06,
  latched: 0.11,
  pulled: 0.22
};

const scalePoint = (origin: Point3D, point: Point3D, scale: number): Point3D => ({
  x: origin.x + (point.x - origin.x) * scale,
  y: origin.y + (point.y - origin.y) * scale,
  z: point.z
});

const mirrorPoint = (point: Point3D): Point3D => ({
  ...point,
  x: 1 - point.x
});

const createThumbTip = (
  landmarks: HandFrame["landmarks"],
  triggerProjection: number
): Point3D => {
  const { wrist, indexMcp, thumbIp } = landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y) || 1;
  const axisX = indexMcp.x - thumbIp.x;
  const axisY = indexMcp.y - thumbIp.y;
  const axisLength = Math.hypot(axisX, axisY) || 1;
  const travel = triggerProjection * handScale;

  return {
    x: thumbIp.x + (axisX / axisLength) * travel,
    y: thumbIp.y + (axisY / axisLength) * travel,
    z: thumbIp.z
  };
};

const createGeometryFrame = (
  triggerProjection: number,
  options: ThumbTriggerGeometryOptions = {}
): HandFrame => {
  const scale = options.scale ?? 1;
  const landmarks = Object.fromEntries(
    Object.entries(BASE_LANDMARKS).map(([key, point]) => [
      key,
      scalePoint(BASE_LANDMARKS.wrist, point, scale)
    ])
  ) as HandFrame["landmarks"];

  const thumbTip = createThumbTip(landmarks, triggerProjection);

  return {
    width: BASE_WIDTH,
    height: BASE_HEIGHT,
    landmarks: { ...landmarks, thumbTip }
  };
};

export const createThumbTriggerFrame = (
  pose: ThumbTriggerPose,
  options: ThumbTriggerGeometryOptions = {}
): HandFrame => createGeometryFrame(TRIGGER_PROJECTION[pose], options);

export const createThumbTriggerFrameFromProjection = (
  triggerProjection: number,
  options: ThumbTriggerGeometryOptions = {}
): HandFrame => createGeometryFrame(triggerProjection, options);

export const withThumbTriggerPose = (
  frame: HandFrame,
  pose: ThumbTriggerPose
): HandFrame => ({
  ...frame,
  landmarks: {
    ...frame.landmarks,
    thumbTip: createThumbTip(frame.landmarks, TRIGGER_PROJECTION[pose])
  }
});

export const mirrorThumbTriggerFrame = (frame: HandFrame): HandFrame => ({
  ...frame,
  landmarks: Object.fromEntries(
    Object.entries(frame.landmarks).map(([key, point]) => [key, mirrorPoint(point)])
  ) as HandFrame["landmarks"]
});
