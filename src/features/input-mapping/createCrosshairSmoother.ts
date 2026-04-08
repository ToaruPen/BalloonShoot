import { gameConfig } from "../../shared/config/gameConfig";

export interface CrosshairPoint {
  x: number;
  y: number;
}

export const smoothCrosshair = (
  previous: CrosshairPoint | undefined,
  next: CrosshairPoint,
  alpha: number = gameConfig.input.smoothingAlpha
): CrosshairPoint => {
  if (!previous) {
    return next;
  }

  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha
  };
};
