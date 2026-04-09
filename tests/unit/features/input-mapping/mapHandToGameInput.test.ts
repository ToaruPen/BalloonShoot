import { describe, expect, it } from "vitest";
import { smoothCrosshair } from "../../../../src/features/input-mapping/createCrosshairSmoother";
import { evaluateGunPose } from "../../../../src/features/input-mapping/evaluateGunPose";
import { mapHandToGameInput } from "../../../../src/features/input-mapping/mapHandToGameInput";
import { gameConfig } from "../../../../src/shared/config/gameConfig";
import type { HandFrame } from "../../../../src/shared/types/hand";
import {
  createThumbTriggerFrame,
  withThumbTriggerPose
} from "./thumbTriggerTestHelper";

const frame: HandFrame = createThumbTriggerFrame("open");

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
      { x: 256, y: 0 },
      0.28
    );

    expect(result.x).toBeLessThan(640);
    expect(result.x).toBeGreaterThan(256);
  });

  it("clamps out-of-range smoothing alpha and falls back for NaN", () => {
    expect(smoothCrosshair({ x: 100, y: 50 }, { x: 300, y: 250 }, 2)).toEqual({
      x: 300,
      y: 250
    });
    expect(smoothCrosshair({ x: 100, y: 50 }, { x: 300, y: 250 }, -1)).toEqual({
      x: 100,
      y: 50
    });
    expect(smoothCrosshair({ x: 100, y: 50 }, { x: 300, y: 250 }, Number.NaN)).toEqual({
      x: 100 + (300 - 100) * gameConfig.input.smoothingAlpha,
      y: 50 + (250 - 50) * gameConfig.input.smoothingAlpha
    });
  });

  it("maps the index finger to mirrored canvas coordinates", () => {
    const result = mapHandToGameInput(frame, { width: 1280, height: 720 }, undefined);
    expect(result.crosshair.x).toBeCloseTo(640, 0);
    expect(result.crosshair.y).toBeCloseTo(216, 0);
  });

  it("only emits a shot when a loose gun pose and trigger pull occur", () => {
    const openFrame = frame;
    const pulledFrame = withThumbTriggerPose(frame, "pulled");

    const first = mapHandToGameInput(
      openFrame,
      { width: 1280, height: 720 },
      undefined
    );
    const second = mapHandToGameInput(
      pulledFrame,
      { width: 1280, height: 720 },
      first.runtime
    );
    const third = mapHandToGameInput(
      pulledFrame,
      { width: 1280, height: 720 },
      second.runtime
    );

    expect(first.shotFired).toBe(false);
    expect(second.shotFired).toBe(true);
    expect(third.shotFired).toBe(false);
  });

  it("does not emit a shot on open -> pulled when gun pose is inactive", () => {
    const openThumbFrame = withThumbTriggerPose(frame, "open");
    const pulledThumbFrame = withThumbTriggerPose(frame, "pulled");

    const nonGunOpen = mapHandToGameInput(
      {
        ...openThumbFrame,
        landmarks: {
          ...openThumbFrame.landmarks,
          indexTip: { x: 0.5, y: 0.7, z: 0 },
        }
      },
      { width: 1280, height: 720 },
      undefined
    );

    const nonGunPulled = mapHandToGameInput(
      {
        ...pulledThumbFrame,
        landmarks: {
          ...pulledThumbFrame.landmarks,
          indexTip: { x: 0.5, y: 0.7, z: 0 },
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

  it("accepts runtime tuning values for smoothing and trigger hysteresis", () => {
    const pulledFrame = withThumbTriggerPose(frame, "pulled");
    const latchedFrame = withThumbTriggerPose(frame, "latched");

    const tuning = {
      smoothingAlpha: 0.5,
      triggerPullThreshold: 0.18,
      triggerReleaseThreshold: 0.1
    };
    const first = mapHandToGameInput(frame, { width: 1280, height: 720 }, undefined, tuning);
    const second = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          indexTip: { x: 0.8, y: 0.2, z: 0 },
          thumbTip: pulledFrame.landmarks.thumbTip
        }
      },
      { width: 1280, height: 720 },
      first.runtime,
      tuning
    );
    const third = mapHandToGameInput(
      {
        ...latchedFrame,
        landmarks: {
          ...latchedFrame.landmarks
        }
      },
      { width: 1280, height: 720 },
      second.runtime,
      tuning
    );

    expect(second.crosshair.x).toBeCloseTo(448, 0);
    expect(second.shotFired).toBe(true);
    expect(third.triggerState).toBe("pulled");
  });
});
