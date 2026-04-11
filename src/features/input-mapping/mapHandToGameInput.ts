import { gameConfig } from "../../shared/config/gameConfig";
import type { HandFrame } from "../../shared/types/hand";
import {
  smoothCrosshair,
  type CrosshairPoint
} from "./createCrosshairSmoother";
import {
  buildHandEvidence,
  type HandEvidence,
  type HandEvidenceRuntimeState,
  type HandEvidenceTuning
} from "./createHandEvidence";
import type { IndexCurlState, IndexCurlTuning } from "./evaluateIndexCurl";
import {
  advanceShotIntentState,
  type ShotIntentResult,
  type ShotIntentState
} from "./shotIntentStateMachine";
import type { ViewportSize } from "./projectLandmarkToViewport";

// Orchestration-owned fields — read and written only by `mapHandToGameInput`.
// The state machine and `buildHandEvidence` do not see these fields.
interface OrchestratorRuntimeExtras {
  lastExtendedCrosshair?: CrosshairPoint | undefined;
  lockedCrosshair?: CrosshairPoint | undefined;
  curlRatio: number;
  curlZDelta: number;
}

export type InputRuntimeState = ShotIntentState & HandEvidenceRuntimeState & OrchestratorRuntimeExtras;

// `advanceShotIntentState` structurally spreads whatever state-like object it
// receives. If we passed the full `InputRuntimeState`, orchestrator-only fields
// would bleed through `intent.state` and defeat the ownership split. Pick the
// ShotIntentState slice so the state machine only sees what it owns.
const toShotIntentState = (runtime: InputRuntimeState | undefined): ShotIntentState | undefined => {
  if (!runtime) {
    return undefined;
  }
  return {
    phase: runtime.phase,
    rejectReason: runtime.rejectReason,
    curlState: runtime.curlState,
    rawCurlState: runtime.rawCurlState,
    curlConfidence: runtime.curlConfidence,
    gunPoseConfidence: runtime.gunPoseConfidence,
    curledFrames: runtime.curledFrames,
    extendedFrames: runtime.extendedFrames,
    gunPoseActive: runtime.gunPoseActive,
    nonGunPoseFrames: runtime.nonGunPoseFrames,
    trackingPresentFrames: runtime.trackingPresentFrames
  };
};

export interface GameInputFrame {
  crosshair?: CrosshairPoint;
  gunPoseActive: boolean;
  curlState: IndexCurlState;
  shotFired: boolean;
  crosshairLockAction: ShotIntentResult["crosshairLockAction"];
  runtime: InputRuntimeState;
}

export interface InputTuning extends IndexCurlTuning {
  smoothingAlpha: number;
}

const computeNextLastExtendedCrosshair = (
  evidence: HandEvidence,
  runtime: InputRuntimeState | undefined,
  alpha: number
): CrosshairPoint | undefined => {
  if (!evidence.projectedCrosshairCandidate) {
    return runtime?.lastExtendedCrosshair;
  }
  if (evidence.curl?.rawCurlState !== "extended") {
    return runtime?.lastExtendedCrosshair;
  }
  return smoothCrosshair(runtime?.lastExtendedCrosshair, evidence.projectedCrosshairCandidate, alpha);
};

const computeNextLockedCrosshair = (
  intent: ShotIntentResult,
  nextLastExtendedCrosshair: CrosshairPoint | undefined,
  previousLockedCrosshair: CrosshairPoint | undefined
): CrosshairPoint | undefined => {
  switch (intent.crosshairLockAction) {
    case "freeze":
      // D4.3 physical guard: only freeze when we have something to freeze.
      return nextLastExtendedCrosshair ?? previousLockedCrosshair;
    case "release":
      return undefined;
    case "none":
    default:
      return previousLockedCrosshair;
  }
};

const resolveFinalCrosshair = (
  intent: ShotIntentResult,
  nextLockedCrosshair: CrosshairPoint | undefined,
  nextLastExtendedCrosshair: CrosshairPoint | undefined,
  evidence: HandEvidence
): CrosshairPoint | undefined => {
  if (intent.state.phase === "tracking_lost") {
    return undefined;
  }
  return (
    nextLockedCrosshair ??
    nextLastExtendedCrosshair ??
    evidence.projectedCrosshairCandidate ??
    { x: 0, y: 0 }
  );
};

export const mapHandToGameInput = (
  frame: HandFrame | undefined,
  viewportSize: ViewportSize,
  runtime: InputRuntimeState | undefined,
  tuning: InputTuning = gameConfig.input
): GameInputFrame => {
  const evidence = buildHandEvidence(
    frame,
    viewportSize,
    runtime,
    undefined,
    tuning as HandEvidenceTuning
  );

  const nextLastExtendedCrosshair = computeNextLastExtendedCrosshair(
    evidence,
    runtime,
    tuning.smoothingAlpha
  );

  const intent = advanceShotIntentState(toShotIntentState(runtime), evidence);

  const nextLockedCrosshair = computeNextLockedCrosshair(
    intent,
    nextLastExtendedCrosshair,
    runtime?.lockedCrosshair
  );

  const nextRuntime: InputRuntimeState = {
    ...intent.state,
    rawCurlState:
      evidence.curl?.rawCurlState ?? intent.state.rawCurlState,
    curlRatio: evidence.curl?.details.ratio ?? runtime?.curlRatio ?? 0,
    curlZDelta: evidence.curl?.details.zDelta ?? runtime?.curlZDelta ?? 0,
    ...(nextLastExtendedCrosshair === undefined
      ? {}
      : { lastExtendedCrosshair: nextLastExtendedCrosshair }),
    ...(nextLockedCrosshair === undefined
      ? {}
      : { lockedCrosshair: nextLockedCrosshair })
  };

  const finalCrosshair = resolveFinalCrosshair(
    intent,
    nextLockedCrosshair,
    nextLastExtendedCrosshair,
    evidence
  );

  return {
    gunPoseActive: intent.state.gunPoseActive,
    curlState: intent.state.curlState,
    shotFired: intent.shotFired,
    crosshairLockAction: intent.crosshairLockAction,
    ...(finalCrosshair === undefined ? {} : { crosshair: finalCrosshair }),
    runtime: nextRuntime
  };
};
