import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type {
  HandDetection,
  HandFrame,
  HandednessCategory,
  Point3D
} from "../../shared/types/hand";
import { createOneEuroFilter, type OneEuroFilterConfig } from "./oneEuroFilter";

interface LandmarkLike {
  x: number;
  y: number;
  z: number;
}

interface HandednessLike {
  score: number;
  index: number;
  categoryName: string;
  displayName: string;
}

interface HandLandmarkerResultLike {
  landmarks: LandmarkLike[][];
  handedness?: HandednessLike[][];
}

interface MediaPipeHandTracker {
  detect(
    bitmap: ImageBitmap,
    frameAtMs: number
  ): Promise<HandDetection | undefined>;
}

export interface MediaPipeHandTrackerOptions {
  getFilterConfig: () => OneEuroFilterConfig;
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

type TrackedLandmarkName = keyof typeof HAND_LANDMARK_INDEX;

type OneEuroFilterInstance = ReturnType<typeof createOneEuroFilter>;

const TRACKED_LANDMARK_NAMES = Object.keys(
  HAND_LANDMARK_INDEX
) as TrackedLandmarkName[];

type LandmarkFilters = Record<
  TrackedLandmarkName,
  {
    x: OneEuroFilterInstance;
    y: OneEuroFilterInstance;
    z: OneEuroFilterInstance;
  }
>;

const createLandmarkFilters = (
  getConfig: () => OneEuroFilterConfig
): LandmarkFilters => {
  const filters = {} as LandmarkFilters;

  for (const name of TRACKED_LANDMARK_NAMES) {
    filters[name] = {
      x: createOneEuroFilter(getConfig),
      y: createOneEuroFilter(getConfig),
      z: createOneEuroFilter(getConfig)
    };
  }

  return filters;
};

const resetLandmarkFilters = (filters: LandmarkFilters): void => {
  for (const name of TRACKED_LANDMARK_NAMES) {
    filters[name].x.reset();
    filters[name].y.reset();
    filters[name].z.reset();
  }
};

const filterPoint = (
  point: Point3D,
  filters: LandmarkFilters[TrackedLandmarkName],
  frameAtMs: number
): Point3D => ({
  x: filters.x.filter(point.x, frameAtMs),
  y: filters.y.filter(point.y, frameAtMs),
  z: filters.z.filter(point.z, frameAtMs)
});

const filterHandFrame = (
  raw: HandFrame,
  filters: LandmarkFilters,
  frameAtMs: number
): HandFrame => ({
  ...raw,
  landmarks: {
    wrist: filterPoint(raw.landmarks.wrist, filters.wrist, frameAtMs),
    thumbIp: filterPoint(raw.landmarks.thumbIp, filters.thumbIp, frameAtMs),
    thumbTip: filterPoint(raw.landmarks.thumbTip, filters.thumbTip, frameAtMs),
    indexMcp: filterPoint(raw.landmarks.indexMcp, filters.indexMcp, frameAtMs),
    indexTip: filterPoint(raw.landmarks.indexTip, filters.indexTip, frameAtMs),
    middleTip: filterPoint(
      raw.landmarks.middleTip,
      filters.middleTip,
      frameAtMs
    ),
    ringTip: filterPoint(raw.landmarks.ringTip, filters.ringTip, frameAtMs),
    pinkyTip: filterPoint(raw.landmarks.pinkyTip, filters.pinkyTip, frameAtMs)
  }
});

const toPoint3D = (landmark: LandmarkLike | undefined): Point3D | undefined =>
  landmark
    ? {
        x: landmark.x,
        y: landmark.y,
        z: landmark.z
      }
    : undefined;

const toHandFrame = (
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
  const selectedHandedness = result.handedness?.[0];
  const handedness: HandednessCategory[] | undefined =
    selectedHandedness !== undefined && selectedHandedness.length > 0
      ? selectedHandedness
      : undefined;

  if (
    !wrist ||
    !thumbIp ||
    !thumbTip ||
    !indexMcp ||
    !indexTip ||
    !middleTip ||
    !ringTip ||
    !pinkyTip
  ) {
    return undefined;
  }

  return {
    width: sourceSize.width,
    height: sourceSize.height,
    ...(handedness ? { handedness } : {}),
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

export const createMediaPipeHandTracker = async (
  options: MediaPipeHandTrackerOptions
): Promise<MediaPipeHandTracker> => {
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/models/hand_landmarker.task"
    },
    numHands: 1,
    runningMode: "VIDEO"
  });
  const filters = createLandmarkFilters(options.getFilterConfig);

  return {
    detect(
      bitmap: ImageBitmap,
      frameAtMs: number
    ): Promise<HandDetection | undefined> {
      const raw = toHandFrame(
        handLandmarker.detectForVideo(bitmap, frameAtMs),
        {
          width: bitmap.width,
          height: bitmap.height
        }
      );

      if (!raw) {
        resetLandmarkFilters(filters);
        return Promise.resolve(undefined);
      }

      const filtered = filterHandFrame(raw, filters, frameAtMs);

      return Promise.resolve({ rawFrame: raw, filteredFrame: filtered });
    }
  };
};
