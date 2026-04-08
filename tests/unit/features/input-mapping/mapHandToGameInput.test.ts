import { describe, expect, it } from "vitest";
import { smoothCrosshair } from "../../../../src/features/input-mapping/createCrosshairSmoother";
import { evaluateGunPose } from "../../../../src/features/input-mapping/evaluateGunPose";
import { mapHandToGameInput } from "../../../../src/features/input-mapping/mapHandToGameInput";
import type { HandFrame } from "../../../../src/shared/types/hand";

const frame: HandFrame = {
  width: 640,
  height: 480,
  landmarks: {
    wrist: { x: 0.4, y: 0.7, z: 0 },
    indexTip: { x: 0.5, y: 0.3, z: 0 },
    indexMcp: { x: 0.47, y: 0.48, z: 0 },
    thumbTip: { x: 0.34, y: 0.55, z: 0 },
    thumbIp: { x: 0.37, y: 0.57, z: 0 },
    middleTip: { x: 0.45, y: 0.64, z: 0 },
    ringTip: { x: 0.42, y: 0.66, z: 0 },
    pinkyTip: { x: 0.39, y: 0.67, z: 0 }
  }
};

describe("mapHandToGameInput", () => {
  it("detects a gun pose using hand-size-normalized curl distance", () => {
    expect(
      evaluateGunPose({
        width: 640,
        height: 480,
        landmarks: {
          wrist: { x: 0.4, y: 0.7, z: 0 },
          indexTip: { x: 0.5, y: 0.3, z: 0 },
          indexMcp: { x: 0.46, y: 0.58, z: 0 },
          thumbTip: { x: 0.34, y: 0.55, z: 0 },
          thumbIp: { x: 0.37, y: 0.57, z: 0 },
          middleTip: { x: 0.45, y: 0.62, z: 0 },
          ringTip: { x: 0.42, y: 0.63, z: 0 },
          pinkyTip: { x: 0.39, y: 0.64, z: 0 }
        }
      })
    ).toBe(true);
  });

  it("keeps the smoother between the previous crosshair and the raw target", () => {
    const result = smoothCrosshair(
      { x: 640, y: 0 },
      { x: 256, y: 0 }
    );

    expect(result.x).toBeLessThan(640);
    expect(result.x).toBeGreaterThan(256);
  });

  it("maps the index finger to mirrored canvas coordinates", () => {
    const result = mapHandToGameInput(frame, { width: 1280, height: 720 }, undefined);
    expect(result.crosshair.x).toBeCloseTo(640, 0);
    expect(result.crosshair.y).toBeCloseTo(216, 0);
  });

  it("only emits a shot when a loose gun pose and trigger pull occur", () => {
    const first = mapHandToGameInput(frame, { width: 1280, height: 720 }, undefined);
    const second = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          thumbTip: { x: 0.45, y: 0.62, z: 0 }
        }
      },
      { width: 1280, height: 720 },
      first.runtime
    );
    const third = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          thumbTip: { x: 0.45, y: 0.62, z: 0 }
        }
      },
      { width: 1280, height: 720 },
      second.runtime
    );

    expect(first.shotFired).toBe(false);
    expect(second.shotFired).toBe(true);
    expect(third.shotFired).toBe(false);
  });

  it("does not emit a shot on open -> pulled when gun pose is inactive", () => {
    const nonGunOpen = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          indexTip: { x: 0.5, y: 0.7, z: 0 },
          thumbTip: { x: 0.34, y: 0.55, z: 0 }
        }
      },
      { width: 1280, height: 720 },
      undefined
    );

    const nonGunPulled = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          indexTip: { x: 0.5, y: 0.7, z: 0 },
          thumbTip: { x: 0.45, y: 0.62, z: 0 }
        }
      },
      { width: 1280, height: 720 },
      nonGunOpen.runtime
    );

    expect(nonGunOpen.shotFired).toBe(false);
    expect(nonGunPulled.shotFired).toBe(false);
  });

  it("clamps the mirrored crosshair to the canvas bounds", () => {
    const result = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          indexTip: { x: 1.2, y: -0.2, z: 0 }
        }
      },
      { width: 1280, height: 720 },
      undefined
    );

    expect(result.crosshair.x).toBe(0);
    expect(result.crosshair.y).toBe(0);
  });

  it("smooths crosshair motion instead of snapping raw coordinates", () => {
    const first = mapHandToGameInput(frame, { width: 1280, height: 720 }, undefined);
    const second = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          indexTip: { x: 0.8, y: 0.2, z: 0 }
        }
      },
      { width: 1280, height: 720 },
      first.runtime
    );

    expect(second.crosshair.x).toBeLessThan(first.crosshair.x);
    expect(second.crosshair.x).toBeGreaterThan(256);
  });
});
