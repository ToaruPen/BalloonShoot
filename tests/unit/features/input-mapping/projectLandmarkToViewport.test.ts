import { describe, expect, it } from "vitest";
import { projectLandmarkToViewport } from "../../../../src/features/input-mapping/projectLandmarkToViewport";

const normalizedPoint = { x: 0.25, y: 0.25 };

describe("projectLandmarkToViewport", () => {
  it("mirrors points without cropping when source and viewport aspect ratios match", () => {
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: 640, height: 480 },
        { width: 1280, height: 960 },
        { mirrorX: true }
      )
    ).toEqual({ x: 960, y: 240 });
  });

  it("applies centered cover cropping when a 4:3 source fills a 16:9 viewport", () => {
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: 640, height: 480 },
        { width: 1280, height: 720 },
        { mirrorX: true }
      )
    ).toEqual({ x: 960, y: 120 });
  });

  it("applies centered cover cropping when a 4:3 source fills a portrait viewport", () => {
    const projected = projectLandmarkToViewport(
      { x: 0.4, y: 0.5 },
      { width: 640, height: 480 },
      { width: 720, height: 1280 },
      { mirrorX: true }
    );

    expect(projected.x).toBeCloseTo(530.67, 2);
    expect(projected.y).toBe(640);
  });

  it("clamps points that land outside the visible covered viewport", () => {
    expect(
      projectLandmarkToViewport(
        { x: 0, y: 0 },
        { width: 640, height: 480 },
        { width: 720, height: 1280 },
        { mirrorX: true }
      )
    ).toEqual({ x: 720, y: 0 });
  });

  it("falls back deterministically for invalid source dimensions", () => {
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: 0, height: 480 },
        { width: 1280, height: 720 }
      )
    ).toEqual({ x: 0, y: 0 });
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: -1, height: 480 },
        { width: 1280, height: 720 }
      )
    ).toEqual({ x: 0, y: 0 });
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: Number.NaN, height: 480 },
        { width: 1280, height: 720 }
      )
    ).toEqual({ x: 0, y: 0 });
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: Number.POSITIVE_INFINITY, height: 480 },
        { width: 1280, height: 720 }
      )
    ).toEqual({ x: 0, y: 0 });
  });

  it("falls back deterministically for invalid viewport dimensions", () => {
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: 640, height: 480 },
        { width: 1280, height: 0 }
      )
    ).toEqual({ x: 0, y: 0 });
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: 640, height: 480 },
        { width: 1280, height: -1 }
      )
    ).toEqual({ x: 0, y: 0 });
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: 640, height: 480 },
        { width: Number.NaN, height: 720 }
      )
    ).toEqual({ x: 0, y: 0 });
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: 640, height: 480 },
        { width: 1280, height: Number.POSITIVE_INFINITY }
      )
    ).toEqual({ x: 0, y: 0 });
  });

  it("falls back deterministically when both source and viewport inputs are invalid", () => {
    expect(
      projectLandmarkToViewport(
        normalizedPoint,
        { width: Number.NaN, height: 0 },
        { width: -1, height: Number.POSITIVE_INFINITY }
      )
    ).toEqual({ x: 0, y: 0 });
  });
});
