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

type InputHandEvidenceRuntimeState = Omit<HandEvidenceRuntimeState, "rawCurlState"> & {
  rawCurlState: IndexCurlState;
};

export interface InputRuntimeState extends ShotIntentState, InputHandEvidenceRuntimeState {}

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

export { buildHandEvidence } from "./createHandEvidence";

const stripHandEvidenceRuntime = (state: InputRuntimeState): InputRuntimeState => {
  const {
    rawCurlState: _rawCurlState,
    lastExtendedCrosshair: _lastExtendedCrosshair,
    lockedCrosshair: _lockedCrosshair,
    ...rest
  } = state;
  return rest as InputRuntimeState;
};

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
  // (a) Build raw evidence (curl measurement, gun-pose, projected crosshair candidate).
  const evidence = buildHandEvidence(
    frame,
    viewportSize,
    runtime,
    undefined,
    tuning as HandEvidenceTuning
  );

  // (b) Conditionally update lastExtendedCrosshair (only when raw curl is extended).
  const nextLastExtendedCrosshair = computeNextLastExtendedCrosshair(
    evidence,
    runtime,
    tuning.smoothingAlpha
  );

  // (c) Drive the state machine.
  const intent = advanceShotIntentState(runtime, evidence);

  // (d) Apply the crosshair lock action with the undefined-data physical guard.
  const nextLockedCrosshair = computeNextLockedCrosshair(
    intent,
    nextLastExtendedCrosshair,
    runtime?.lockedCrosshair
  );

  // (e) Build the next runtime state.
  const baseRuntime = stripHandEvidenceRuntime(intent.state as InputRuntimeState);
  const nextRuntime: InputRuntimeState = {
    ...baseRuntime,
    rawCurlState:
      evidence.curl?.rawCurlState ?? intent.state.rawCurlState,
    ...(nextLastExtendedCrosshair === undefined
      ? {}
      : { lastExtendedCrosshair: nextLastExtendedCrosshair }),
    ...(nextLockedCrosshair === undefined
      ? {}
      : { lockedCrosshair: nextLockedCrosshair })
  };

  // (f) Resolve the final crosshair the game will see.
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
