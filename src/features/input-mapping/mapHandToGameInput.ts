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
  const rawCrosshair = {
    x: (1 - frame.landmarks.indexTip.x) * canvasSize.width,
    y: frame.landmarks.indexTip.y * canvasSize.height
  };
  const crosshair = smoothCrosshair(runtime?.crosshair, rawCrosshair);
  const gunPoseActive = evaluateGunPose(frame);
  const triggerState = evaluateThumbTrigger(frame);
  const shotFired = gunPoseActive && runtime?.triggerState === "open" && triggerState === "pulled";

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
