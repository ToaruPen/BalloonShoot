import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandFrame, Point3D } from "../../shared/types/hand";

interface LandmarkLike {
  x: number;
  y: number;
  z: number;
}

interface HandLandmarkerResultLike {
  landmarks: LandmarkLike[][];
}

const HAND_LANDMARK_INDEX = {
  wrist: 0,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  indexTip: 8,
  middleTip: 12,
  ringTip: 16,
  pinkyTip: 20
} as const;

const toPoint3D = (landmark: LandmarkLike | undefined): Point3D | undefined =>
  landmark
    ? {
        x: landmark.x,
        y: landmark.y,
        z: landmark.z
      }
    : undefined;

export const toHandFrame = (
  result: HandLandmarkerResultLike,
  sourceSize: { width: number; height: number }
): HandFrame | undefined => {
  const landmarks = result.landmarks[0];

  if (!landmarks) {
    return undefined;
  }

  const wrist = toPoint3D(landmarks[HAND_LANDMARK_INDEX.wrist]);
  const thumbIp = toPoint3D(landmarks[HAND_LANDMARK_INDEX.thumbIp]);
  const thumbTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.thumbTip]);
  const indexMcp = toPoint3D(landmarks[HAND_LANDMARK_INDEX.indexMcp]);
  const indexTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.indexTip]);
  const middleTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.middleTip]);
  const ringTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.ringTip]);
  const pinkyTip = toPoint3D(landmarks[HAND_LANDMARK_INDEX.pinkyTip]);

  if (!wrist || !thumbIp || !thumbTip || !indexMcp || !indexTip || !middleTip || !ringTip || !pinkyTip) {
    return undefined;
  }

  return {
    width: sourceSize.width,
    height: sourceSize.height,
    landmarks: {
      wrist,
      thumbIp,
      thumbTip,
      indexMcp,
      indexTip,
      middleTip,
      ringTip,
      pinkyTip
    }
  };
};

// MediaPipe's WASM runtime is fetched from jsDelivr instead of vendored.
// Vendoring would add ~33 MB of binaries to the repo; the CDN is pinned to the
// same @mediapipe/tasks-vision version declared in package.json.
const MEDIAPIPE_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";

export const createMediaPipeHandTracker = async (): Promise<HandLandmarker> => {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/models/hand_landmarker.task"
    },
    numHands: 1,
    runningMode: "VIDEO"
  });
};
