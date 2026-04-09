import { gameConfig } from "../../shared/config/gameConfig";
import type { HandFrame } from "../../shared/types/hand";
import { smoothCrosshair, type CrosshairPoint } from "./createCrosshairSmoother";
import { evaluateGunPose } from "./evaluateGunPose";
import {
  projectLandmarkToViewport,
  type ViewportSize
} from "./projectLandmarkToViewport";
import {
  evaluateThumbTrigger,
  type TriggerState,
  type TriggerTuning
} from "./evaluateThumbTrigger";

export interface InputRuntimeState {
  crosshair?: CrosshairPoint;
  triggerState: TriggerState;
}

export interface GameInputFrame {
  crosshair: CrosshairPoint;
  gunPoseActive: boolean;
  triggerState: TriggerState;
  shotFired: boolean;
  runtime: InputRuntimeState;
}

export interface InputTuning extends TriggerTuning {
  smoothingAlpha: number;
}

export const mapHandToGameInput = (
  frame: HandFrame,
  viewportSize: ViewportSize,
  runtime: InputRuntimeState | undefined,
  tuning: InputTuning = gameConfig.input
): GameInputFrame => {
  const rawCrosshair = projectLandmarkToViewport(
    frame.landmarks.indexTip,
    { width: frame.width, height: frame.height },
    viewportSize,
    { mirrorX: true }
  );
  const crosshair = smoothCrosshair(runtime?.crosshair, rawCrosshair, tuning.smoothingAlpha);
  const gunPoseActive = evaluateGunPose(frame);
  const previousTriggerState = runtime?.triggerState ?? "open";
  const triggerState = evaluateThumbTrigger(frame, previousTriggerState, tuning);
  const shotFired = gunPoseActive && previousTriggerState === "open" && triggerState === "pulled";

  return {
    crosshair,
    gunPoseActive,
    triggerState,
    shotFired,
    runtime: {
      crosshair,
      triggerState
    }
  };
};
