import type { HandFrame } from "../../shared/types/hand";
import { smoothCrosshair, type CrosshairPoint } from "./createCrosshairSmoother";
import { evaluateGunPose } from "./evaluateGunPose";
import { evaluateThumbTrigger, type TriggerState } from "./evaluateThumbTrigger";

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

export const mapHandToGameInput = (
  frame: HandFrame,
  canvasSize: { width: number; height: number },
  runtime: InputRuntimeState | undefined
): GameInputFrame => {
  const indexTipX = Math.min(Math.max(frame.landmarks.indexTip.x, 0), 1);
  const indexTipY = Math.min(Math.max(frame.landmarks.indexTip.y, 0), 1);
  const rawCrosshair = {
    x: (1 - indexTipX) * canvasSize.width,
    y: indexTipY * canvasSize.height
  };
  const crosshair = smoothCrosshair(runtime?.crosshair, rawCrosshair);
  const gunPoseActive = evaluateGunPose(frame);
  const triggerState = evaluateThumbTrigger(frame);
  const previousTriggerState = runtime?.triggerState ?? "open";
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
