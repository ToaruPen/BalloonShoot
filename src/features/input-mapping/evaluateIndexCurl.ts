import { gameConfig } from "../../shared/config/gameConfig";
import type { HandFrame } from "../../shared/types/hand";

export type IndexCurlState = "extended" | "partial" | "curled";

export interface IndexCurlTuning {
  extendedThreshold: number;
  curledThreshold: number;
  curlHysteresisGap: number;
  zAssistWeight: number;
}

export interface IndexCurlMeasurement {
  rawCurlState: IndexCurlState;
  confidence: number;
  details: {
    ratio: number;
    zDelta: number;
    extendedThreshold: number;
    curledThreshold: number;
    curlHysteresisGap: number;
  };
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const normalizeTuning = (tuning: IndexCurlTuning): IndexCurlTuning => {
  const extendedThreshold = Number.isFinite(tuning.extendedThreshold)
    ? tuning.extendedThreshold
    : gameConfig.input.extendedThreshold;
  const curledThreshold = Number.isFinite(tuning.curledThreshold)
    ? tuning.curledThreshold
    : gameConfig.input.curledThreshold;
  const curlHysteresisGap = Number.isFinite(tuning.curlHysteresisGap)
    ? tuning.curlHysteresisGap
    : gameConfig.input.curlHysteresisGap;
  const zAssistWeight = Number.isFinite(tuning.zAssistWeight)
    ? tuning.zAssistWeight
    : gameConfig.input.zAssistWeight;

  const safeExtended = Math.max(extendedThreshold, curledThreshold + curlHysteresisGap + Number.EPSILON);

  return {
    extendedThreshold: safeExtended,
    curledThreshold,
    curlHysteresisGap,
    zAssistWeight
  };
};

const computeRatio = (frame: HandFrame): number | undefined => {
  const { wrist, indexMcp, indexTip } = frame.landmarks;
  const handScale = Math.hypot(indexMcp.x - wrist.x, indexMcp.y - wrist.y);
  if (handScale === 0 || !Number.isFinite(handScale)) {
    return undefined;
  }
  const tipToMcp = Math.hypot(indexTip.x - indexMcp.x, indexTip.y - indexMcp.y);
  return tipToMcp / handScale;
};

const classify = (
  ratio: number,
  previous: IndexCurlState | undefined,
  tuning: IndexCurlTuning
): IndexCurlState => {
  const { extendedThreshold, curledThreshold, curlHysteresisGap } = tuning;
  const extendedReturnGate = extendedThreshold + curlHysteresisGap;
  const curledReturnGate = curledThreshold + curlHysteresisGap;

  switch (previous) {
    case "extended":
      if (ratio < extendedThreshold) {
        return ratio < curledThreshold ? "curled" : "partial";
      }
      return "extended";
    case "curled":
      if (ratio > curledReturnGate) {
        return ratio >= extendedReturnGate ? "extended" : "partial";
      }
      return "curled";
    case "partial":
      // Spec D3: partial → extended needs the hysteresis gap to prevent
      // single-frame flicker re-arming after a freeze.
      if (ratio >= extendedReturnGate) {
        return "extended";
      }
      if (ratio < curledThreshold) {
        return "curled";
      }
      return "partial";
    case undefined:
    default:
      // Cold start: classify by raw thresholds without a gate.
      if (ratio >= extendedThreshold) {
        return "extended";
      }
      if (ratio < curledThreshold) {
        return "curled";
      }
      return "partial";
  }
};

const computeConfidence = (
  ratio: number,
  rawCurlState: IndexCurlState,
  tuning: IndexCurlTuning
): number => {
  const { extendedThreshold, curledThreshold } = tuning;
  switch (rawCurlState) {
    case "extended":
      return clamp01((ratio - extendedThreshold) / Math.max(extendedThreshold, Number.EPSILON));
    case "curled":
      return clamp01((curledThreshold - ratio) / Math.max(curledThreshold, Number.EPSILON));
    case "partial":
    default: {
      // Confidence in being "partial" is highest at the midpoint of the band
      // (ratio is equally far from both edges) and lowest near either edge.
      const distanceFromExtended = Math.abs(ratio - extendedThreshold);
      const distanceFromCurled = Math.abs(ratio - curledThreshold);
      const bandWidth = Math.max(extendedThreshold - curledThreshold, Number.EPSILON);
      const closer = Math.min(distanceFromExtended, distanceFromCurled);
      return clamp01(closer / (bandWidth / 2));
    }
  }
};

export const measureIndexCurl = (
  frame: HandFrame,
  previousRawCurlState: IndexCurlState | undefined,
  tuning: IndexCurlTuning = gameConfig.input
): IndexCurlMeasurement => {
  const safeTuning = normalizeTuning(tuning);
  const ratio = computeRatio(frame);

  if (ratio === undefined) {
    return {
      rawCurlState: previousRawCurlState ?? "partial",
      confidence: 0,
      details: {
        ratio: 0,
        zDelta: 0,
        extendedThreshold: safeTuning.extendedThreshold,
        curledThreshold: safeTuning.curledThreshold,
        curlHysteresisGap: safeTuning.curlHysteresisGap
      }
    };
  }

  const rawCurlState = classify(ratio, previousRawCurlState, safeTuning);
  const confidence = computeConfidence(ratio, rawCurlState, safeTuning);
  const zDelta = frame.landmarks.indexTip.z - frame.landmarks.indexMcp.z;

  return {
    rawCurlState,
    confidence,
    details: {
      ratio,
      zDelta,
      extendedThreshold: safeTuning.extendedThreshold,
      curledThreshold: safeTuning.curledThreshold,
      curlHysteresisGap: safeTuning.curlHysteresisGap
    }
  };
};
