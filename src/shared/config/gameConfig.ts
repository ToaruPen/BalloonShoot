const CAMERA_WIDTH = 640;
const CAMERA_HEIGHT = 480;
const INPUT_SMOOTHING_ALPHA = 0.28;
// Trigger thresholds compare against measureThumbCosine: -1 fully open, +1 fully pulled.
const INPUT_TRIGGER_PULL_THRESHOLD = 0.3;
const INPUT_TRIGGER_RELEASE_THRESHOLD = 0.1;
// 1€ filter defaults. Beta starts at 0 per https://gery.casiez.net/1euro/.
const HAND_FILTER_MIN_CUTOFF_HZ = 1.0;
const HAND_FILTER_BETA = 0;
const HAND_FILTER_D_CUTOFF_HZ = 1.0;

export const gameConfig = {
  camera: {
    width: CAMERA_WIDTH,
    height: CAMERA_HEIGHT
  },
  input: {
    smoothingAlpha: INPUT_SMOOTHING_ALPHA,
    triggerPullThreshold: INPUT_TRIGGER_PULL_THRESHOLD,
    triggerReleaseThreshold: INPUT_TRIGGER_RELEASE_THRESHOLD,
    handFilterMinCutoff: HAND_FILTER_MIN_CUTOFF_HZ,
    handFilterBeta: HAND_FILTER_BETA,
    handFilterDCutoff: HAND_FILTER_D_CUTOFF_HZ
  }
} as const;
