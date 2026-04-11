import { gameConfig } from "../../shared/config/gameConfig";
import type { HandFrame } from "../../shared/types/hand";
import type { CrosshairPoint } from "./createCrosshairSmoother";
import { buildHandEvidence, type HandEvidenceTuning } from "./createHandEvidence";
import {
  advanceShotIntentState,
  type ShotIntentState
} from "./shotIntentStateMachine";
import type { ViewportSize } from "./projectLandmarkToViewport";
import { type TriggerState, type TriggerTuning } from "./evaluateThumbTrigger";

export interface InputRuntimeState extends ShotIntentState {
  crosshair?: CrosshairPoint | undefined;
}

export interface GameInputFrame {
  crosshair?: CrosshairPoint;
  gunPoseActive: boolean;
  triggerState: TriggerState;
  shotFired: boolean;
  runtime: InputRuntimeState;
}

export interface InputTuning extends TriggerTuning {
  smoothingAlpha: number;
}

export { buildHandEvidence } from "./createHandEvidence";

const resolveHandEvidence = (
  frame: HandFrame | undefined,
  viewportSize: ViewportSize,
  runtime: InputRuntimeState | undefined,
  tuning: InputTuning
): ReturnType<typeof buildHandEvidence> =>
  buildHandEvidence(
    frame,
    viewportSize,
    {
      crosshair: runtime?.crosshair,
      rawTriggerState: runtime?.rawTriggerState
    },
    undefined,
    tuning as HandEvidenceTuning
  );

const inferShotIntent = (
  runtime: InputRuntimeState | undefined,
  evidence: ReturnType<typeof buildHandEvidence>
): ReturnType<typeof advanceShotIntentState> => advanceShotIntentState(runtime, evidence);

const dropRuntimeCrosshair = (
  state: InputRuntimeState
): Omit<InputRuntimeState, "crosshair"> => {
  const { crosshair: _previousCrosshair, ...runtimeState } = state;

  return runtimeState;
};

const adaptGameInputFrame = (
  evidence: ReturnType<typeof buildHandEvidence>,
  intent: ReturnType<typeof advanceShotIntentState>
): GameInputFrame => {
  const crosshair =
    intent.state.phase === "tracking_lost"
      ? undefined
      : evidence.smoothedCrosshairCandidate ?? { x: 0, y: 0 };

  return {
    gunPoseActive: intent.state.gunPoseActive,
    triggerState: intent.state.triggerState,
    shotFired: intent.shotFired,
    ...(crosshair === undefined ? {} : { crosshair }),
    // `advanceShotIntentState` preserves prior runtime fields, so drop any stale crosshair
    // before attaching the current one.
    runtime: {
      ...dropRuntimeCrosshair(intent.state as InputRuntimeState),
      rejectReason: intent.state.rejectReason,
      ...(crosshair === undefined ? {} : { crosshair })
    }
  };
};

export const mapHandToGameInput = (
  frame: HandFrame | undefined,
  viewportSize: ViewportSize,
  runtime: InputRuntimeState | undefined,
  tuning: InputTuning = gameConfig.input
): GameInputFrame => {
  const evidence = resolveHandEvidence(frame, viewportSize, runtime, tuning);
  const intent = inferShotIntent(runtime, evidence);

  return adaptGameInputFrame(evidence, intent);
};
