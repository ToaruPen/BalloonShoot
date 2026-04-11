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

interface ClassifyGates {
  extendedThreshold: number;
  curledThreshold: number;
  extendedReturnGate: number;
  curledReturnGate: number;
}

const classifyFromExtended = (ratio: number, gates: ClassifyGates): IndexCurlState => {
  if (ratio >= gates.extendedThreshold) {
    return "extended";
  }
  return ratio < gates.curledThreshold ? "curled" : "partial";
};

const classifyFromCurled = (ratio: number, gates: ClassifyGates): IndexCurlState => {
  if (ratio <= gates.curledReturnGate) {
    return "curled";
  }
  return ratio >= gates.extendedReturnGate ? "extended" : "partial";
};

// Spec D3: partial → extended needs the hysteresis gap to prevent single-frame
// flicker re-arming after a freeze. partial → curled has no gap (fires on first
// sub-threshold frame so curled confirmation can start immediately).
const classifyFromPartial = (ratio: number, gates: ClassifyGates): IndexCurlState => {
  if (ratio >= gates.extendedReturnGate) {
    return "extended";
  }
  return ratio < gates.curledThreshold ? "curled" : "partial";
};

// Cold start: no prior state, classify by raw thresholds without a return gate.
const classifyColdStart = (ratio: number, gates: ClassifyGates): IndexCurlState => {
  if (ratio >= gates.extendedThreshold) {
    return "extended";
  }
  return ratio < gates.curledThreshold ? "curled" : "partial";
};

const classify = (
  ratio: number,
  previous: IndexCurlState | undefined,
  tuning: IndexCurlTuning
): IndexCurlState => {
  const gates: ClassifyGates = {
    extendedThreshold: tuning.extendedThreshold,
    curledThreshold: tuning.curledThreshold,
    extendedReturnGate: tuning.extendedThreshold + tuning.curlHysteresisGap,
    curledReturnGate: tuning.curledThreshold + tuning.curlHysteresisGap
  };

  switch (previous) {
    case "extended":
      return classifyFromExtended(ratio, gates);
    case "curled":
      return classifyFromCurled(ratio, gates);
    case "partial":
      return classifyFromPartial(ratio, gates);
    case undefined:
    default:
      return classifyColdStart(ratio, gates);
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
