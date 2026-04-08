export interface CrosshairPoint {
  x: number;
  y: number;
}

const FOLLOW_FACTOR = 1.25;

export const smoothCrosshair = (
  previous: CrosshairPoint | undefined,
  next: CrosshairPoint
): CrosshairPoint => {
  if (!previous) {
    return next;
  }

  return {
    x: previous.x + (next.x - previous.x) * FOLLOW_FACTOR,
    y: previous.y + (next.y - previous.y) * FOLLOW_FACTOR
  };
};
