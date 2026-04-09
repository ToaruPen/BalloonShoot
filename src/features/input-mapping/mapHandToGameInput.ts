import { gameConfig } from "../../shared/config/gameConfig";
import type { HandFrame } from "../../shared/types/hand";
import { smoothCrosshair, type CrosshairPoint } from "./createCrosshairSmoother";
import { evaluateGunPose } from "./evaluateGunPose";
import {
  evaluateThumbTrigger,
  type TriggerState,
  type TriggerTuning
} from "./evaluateThumbTrigger";

const TRIGGER_CONFIRMATION_FRAMES = 2;
const TRIGGER_RELEASE_FRAMES = 2;
const GUN_POSE_GRACE_FRAMES = 1;

export interface InputRuntimeState {
  crosshair?: CrosshairPoint;
  triggerState: TriggerState;
  rawTriggerState: TriggerState;
  pulledFrames: number;
  openFrames: number;
  hasSeenStableOpen: boolean;
  gunPoseActive: boolean;
  nonGunPoseFrames: number;
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
  canvasSize: { width: number; height: number },
  runtime: InputRuntimeState | undefined,
  tuning: InputTuning = gameConfig.input
): GameInputFrame => {
  const indexTipX = Math.min(Math.max(frame.landmarks.indexTip.x, 0), 1);
  const indexTipY = Math.min(Math.max(frame.landmarks.indexTip.y, 0), 1);
  const rawCrosshair = {
    x: (1 - indexTipX) * canvasSize.width,
    y: indexTipY * canvasSize.height
  };
  const crosshair = smoothCrosshair(runtime?.crosshair, rawCrosshair, tuning.smoothingAlpha);
  const previousTriggerState = runtime?.triggerState ?? "open";
  const previousRawTriggerState = runtime?.rawTriggerState ?? previousTriggerState;
  const rawTriggerState = evaluateThumbTrigger(frame, previousRawTriggerState, tuning);
  const pulledFrames =
    rawTriggerState === "pulled" ? (runtime?.pulledFrames ?? 0) + 1 : 0;
  const openFrames = rawTriggerState === "open" ? (runtime?.openFrames ?? 0) + 1 : 0;
  let triggerState = previousTriggerState;

  if (previousTriggerState === "open" && pulledFrames >= TRIGGER_CONFIRMATION_FRAMES) {
    triggerState = "pulled";
  } else if (previousTriggerState === "pulled" && openFrames >= TRIGGER_RELEASE_FRAMES) {
    triggerState = "open";
  }

  const hasSeenStableOpen =
    openFrames >= TRIGGER_RELEASE_FRAMES || runtime?.hasSeenStableOpen === true;

  const rawGunPoseActive = evaluateGunPose(frame);
  const nonGunPoseFrames = rawGunPoseActive ? 0 : (runtime?.nonGunPoseFrames ?? 0) + 1;
  const previousGunPoseActive = runtime?.gunPoseActive ?? false;
  const gunPoseActive =
    rawGunPoseActive ||
    (previousGunPoseActive && nonGunPoseFrames <= GUN_POSE_GRACE_FRAMES);
  const stablePullStarted = previousTriggerState === "open" && triggerState === "pulled";
  const shotFired = hasSeenStableOpen && gunPoseActive && stablePullStarted;

  return {
    crosshair,
    gunPoseActive,
    triggerState,
    shotFired,
    runtime: {
      crosshair,
      triggerState,
      rawTriggerState,
      pulledFrames,
      openFrames,
      hasSeenStableOpen,
      gunPoseActive,
      nonGunPoseFrames
    }
  };
};
