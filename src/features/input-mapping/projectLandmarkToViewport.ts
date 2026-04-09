import type { CrosshairPoint } from "./createCrosshairSmoother";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface ProjectLandmarkOptions {
  mirrorX?: boolean;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const isPositiveFinite = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const isValidSize = (size: ViewportSize): boolean =>
  isPositiveFinite(size.width) && isPositiveFinite(size.height);

export const projectLandmarkToViewport = (
  point: NormalizedPoint,
  sourceSize: ViewportSize,
  viewportSize: ViewportSize,
  options: ProjectLandmarkOptions = {}
): CrosshairPoint => {
  if (!isValidSize(sourceSize) || !isValidSize(viewportSize)) {
    return { x: 0, y: 0 };
  }

  const normalizedX = clamp(point.x, 0, 1);
  const normalizedY = clamp(point.y, 0, 1);
  const scale = Math.max(
    viewportSize.width / sourceSize.width,
    viewportSize.height / sourceSize.height
  );
  const renderedWidth = sourceSize.width * scale;
  const renderedHeight = sourceSize.height * scale;
  const offsetX = (renderedWidth - viewportSize.width) / 2;
  const offsetY = (renderedHeight - viewportSize.height) / 2;
  const projectedX = normalizedX * renderedWidth - offsetX;
  const projectedY = normalizedY * renderedHeight - offsetY;
  const mirrorX = options.mirrorX === true;
  const mirroredX = mirrorX ? viewportSize.width - projectedX : projectedX;

  return {
    x: clamp(mirroredX, 0, viewportSize.width),
    y: clamp(projectedY, 0, viewportSize.height)
  };
};
