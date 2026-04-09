export const CAMERA_WIDTH = 640;
export const CAMERA_HEIGHT = 480;
export const INPUT_SMOOTHING_ALPHA = 0.28;
export const INPUT_TRIGGER_PULL_THRESHOLD = 0.18;
export const INPUT_TRIGGER_RELEASE_THRESHOLD = 0.1;

export const gameConfig = {
  camera: {
    width: CAMERA_WIDTH,
    height: CAMERA_HEIGHT
  },
  input: {
    smoothingAlpha: INPUT_SMOOTHING_ALPHA,
    triggerPullThreshold: INPUT_TRIGGER_PULL_THRESHOLD,
    triggerReleaseThreshold: INPUT_TRIGGER_RELEASE_THRESHOLD
  }
} as const;
