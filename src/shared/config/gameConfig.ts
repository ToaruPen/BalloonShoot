const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 480;
const INPUT_SMOOTHING_ALPHA = 0.28;
const INPUT_EXTENDED_THRESHOLD = 1.15;
const INPUT_CURLED_THRESHOLD = 0.65;
const INPUT_CURL_HYSTERESIS_GAP = 0.05;
const INPUT_Z_ASSIST_WEIGHT = 0;

export const gameConfig = {
  camera: {
    width: CAMERA_WIDTH,
    height: CAMERA_HEIGHT
  },
  input: {
    smoothingAlpha: INPUT_SMOOTHING_ALPHA,
    extendedThreshold: INPUT_EXTENDED_THRESHOLD,
    curledThreshold: INPUT_CURLED_THRESHOLD,
    curlHysteresisGap: INPUT_CURL_HYSTERESIS_GAP,
    zAssistWeight: INPUT_Z_ASSIST_WEIGHT
  }
} as const;
