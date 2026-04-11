import { gameConfig } from '../../shared/config/gameConfig';
import type { HandFrame } from '../../shared/types/hand';
import type { CrosshairPoint } from './createCrosshairSmoother';
import {
  measureGunPose,
  type GunPoseMeasurement
} from './evaluateGunPose';
import {
  measureIndexCurl,
  type IndexCurlMeasurement,
  type IndexCurlState,
  type IndexCurlTuning
} from './evaluateIndexCurl';
import type { ViewportSize } from './projectLandmarkToViewport';
import { projectLandmarkToViewport } from './projectLandmarkToViewport';

// `buildHandEvidence` only needs the prior `rawCurlState` to seed curl
// hysteresis. Orchestration-owned fields (`lastExtendedCrosshair`,
// `lockedCrosshair`, `curlRatio`, `curlZDelta`) live in `mapHandToGameInput`.
export interface HandEvidenceRuntimeState {
  rawCurlState?: IndexCurlState | undefined;
}

export interface HandEvidenceTuning extends IndexCurlTuning {
  smoothingAlpha: number;
}

export interface HandEvidence {
  trackingPresent: boolean;
  frameAtMs: number | undefined;
  projectedCrosshairCandidate: CrosshairPoint | null;
  curl: IndexCurlMeasurement | null;
  gunPose: GunPoseMeasurement | null;
}

export const buildHandEvidence = (
  frame: HandFrame | undefined,
  viewportSize: ViewportSize,
  runtime: HandEvidenceRuntimeState | undefined,
  frameAtMs?: number,
  tuning: HandEvidenceTuning = gameConfig.input
): HandEvidence => {
  if (!frame) {
    return {
      trackingPresent: false,
      frameAtMs,
      projectedCrosshairCandidate: null,
      curl: null,
      gunPose: null
    };
  }

  const projectedCrosshairCandidate = projectLandmarkToViewport(
    frame.landmarks.indexTip,
    { width: frame.width, height: frame.height },
    viewportSize,
    { mirrorX: true }
  );

  const curl = measureIndexCurl(frame, runtime?.rawCurlState, tuning);
  const gunPose = measureGunPose(frame);

  return {
    trackingPresent: true,
    frameAtMs,
    projectedCrosshairCandidate,
    curl,
    gunPose
  };
};
