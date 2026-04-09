import { describe, expect, it } from "vitest";
import { smoothCrosshair } from "../../../../src/features/input-mapping/createCrosshairSmoother";
import { evaluateGunPose } from "../../../../src/features/input-mapping/evaluateGunPose";
import {
  mapHandToGameInput,
  type GameInputFrame,
  type InputTuning
} from "../../../../src/features/input-mapping/mapHandToGameInput";
import { gameConfig } from "../../../../src/shared/config/gameConfig";
import type { HandFrame } from "../../../../src/shared/types/hand";
import {
  createThumbTriggerFrame,
  withThumbTriggerPose
} from "./thumbTriggerTestHelper";

const frame: HandFrame = createThumbTriggerFrame("open");
const canvasSize = { width: 1280, height: 720 };

const runInputSequence = (
  frames: HandFrame[],
  initialRuntime?: GameInputFrame["runtime"]
): GameInputFrame[] => {
  const results: GameInputFrame[] = [];
  let runtime = initialRuntime;

  for (const nextFrame of frames) {
    const result = mapHandToGameInput(nextFrame, canvasSize, runtime);
    results.push(result);
    runtime = result.runtime;
  }

  return results;
};

const createArmedRuntime = (
  tuning: InputTuning = gameConfig.input
): GameInputFrame["runtime"] => {
  const first = mapHandToGameInput(
    withThumbTriggerPose(frame, "open"),
    canvasSize,
    undefined,
    tuning
  );
  const second = mapHandToGameInput(
    withThumbTriggerPose(frame, "open"),
    canvasSize,
    first.runtime,
    tuning
  );

  return second.runtime;
};

const withGunPose = (inputFrame: HandFrame, active: boolean): HandFrame =>
  active
    ? inputFrame
    : {
        ...inputFrame,
        landmarks: {
          ...inputFrame.landmarks,
          indexTip: { ...inputFrame.landmarks.indexTip, y: 0.7 }
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

  it("maps the index finger to mirrored viewport coordinates", () => {
    const result = mapHandToGameInput(frame, { width: 1280, height: 720 }, undefined);
    expect(result.crosshair.x).toBeCloseTo(640, 0);
    expect(result.crosshair.y).toBeCloseTo(168, 0);
  });

  it("only emits a shot when a loose gun pose and trigger pull occur", () => {
    const openFrame = frame;
    const pulledFrame = withThumbTriggerPose(frame, "pulled");
    const armedRuntime = createArmedRuntime();

    const first = mapHandToGameInput(
      openFrame,
      canvasSize,
      armedRuntime
    );
    const second = mapHandToGameInput(
      pulledFrame,
      canvasSize,
      first.runtime
    );
    const third = mapHandToGameInput(
      pulledFrame,
      canvasSize,
      second.runtime
    );
    const fourth = mapHandToGameInput(
      pulledFrame,
      canvasSize,
      third.runtime
    );

    expect(first.shotFired).toBe(false);
    expect(second.shotFired).toBe(false);
    expect(third.shotFired).toBe(true);
    expect(fourth.shotFired).toBe(false);
  });

  it("does not emit a shot on open -> pulled when gun pose is inactive", () => {
    const openThumbFrame = withThumbTriggerPose(frame, "open");
    const pulledThumbFrame = withThumbTriggerPose(frame, "pulled");
    const armedRuntime = createArmedRuntime();

    const nonGunOpen = mapHandToGameInput(
      withGunPose(openThumbFrame, false),
      canvasSize,
      armedRuntime
    );

    const nonGunPulled = mapHandToGameInput(
      withGunPose(pulledThumbFrame, false),
      canvasSize,
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
      canvasSize,
      undefined
    );

    expect(result.crosshair.x).toBe(0);
    expect(result.crosshair.y).toBe(0);
  });

  it("smooths crosshair motion instead of snapping raw coordinates", () => {
    const first = mapHandToGameInput(frame, canvasSize, undefined);
    const second = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          indexTip: { x: 0.8, y: 0.2, z: 0 }
        }
      },
      canvasSize,
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
    const first = mapHandToGameInput(frame, canvasSize, createArmedRuntime(tuning), tuning);
    const second = mapHandToGameInput(
      {
        ...frame,
        landmarks: {
          ...frame.landmarks,
          indexTip: { x: 0.8, y: 0.2, z: 0 },
          thumbTip: pulledFrame.landmarks.thumbTip
        }
      },
      canvasSize,
      first.runtime,
      tuning
    );
    const third = mapHandToGameInput(
      latchedFrame,
      canvasSize,
      second.runtime,
      tuning
    );
    const fourth = mapHandToGameInput(
      latchedFrame,
      canvasSize,
      third.runtime,
      tuning
    );

    expect(second.crosshair.x).toBeCloseTo(448, 0);
    expect(second.shotFired).toBe(false);
    expect(third.shotFired).toBe(true);
    expect(fourth.triggerState).toBe("pulled");
  });

  it("ignores a single pulled frame caused by trigger noise", () => {
    const results = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "open")
    ]);

    expect(results.some((result) => result.shotFired)).toBe(false);
    expect(results.at(-1)?.triggerState).toBe("open");
  });

  it("fires once after the pull stays stable for two frames", () => {
    const results = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled")
    ], createArmedRuntime());

    expect(results[1]?.shotFired).toBe(false);
    expect(results[2]?.shotFired).toBe(false);
    expect(results[3]?.shotFired).toBe(true);
  });

  it("keeps a valid shot when gun pose drops for one frame during the pull", () => {
    const results = runInputSequence([
      withGunPose(withThumbTriggerPose(frame, "open"), true),
      withGunPose(withThumbTriggerPose(frame, "open"), true),
      withGunPose(withThumbTriggerPose(frame, "pulled"), false),
      withGunPose(withThumbTriggerPose(frame, "pulled"), true)
    ], createArmedRuntime());

    expect(results[3]?.shotFired).toBe(true);
    expect(results[3]?.gunPoseActive).toBe(true);
  });

  it("does not auto-repeat while the trigger stays held", () => {
    const results = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled")
    ], createArmedRuntime());

    expect(results.filter((result) => result.shotFired)).toHaveLength(1);
  });

  it("keeps the trigger latched through a single open-frame jitter", () => {
    const results = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled")
    ]);

    expect(results[3]?.triggerState).toBe("pulled");
    expect(results[4]?.shotFired).toBe(false);
  });

  it("requires a real release before firing again", () => {
    const results = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled")
    ], createArmedRuntime());

    expect(results.filter((result) => result.shotFired)).toHaveLength(2);
    expect(results[5]?.triggerState).toBe("open");
    expect(results[7]?.shotFired).toBe(true);
  });

  it("does not fire after reset until a released trigger has been observed", () => {
    const heldAtStart = runInputSequence([
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled")
    ]);
    const noisyRelease = runInputSequence([
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled")
    ]);
    const armedSequence = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled")
    ]);

    expect(heldAtStart.some((result) => result.shotFired)).toBe(false);
    expect(noisyRelease.some((result) => result.shotFired)).toBe(false);
    expect(armedSequence.filter((result) => result.shotFired)).toHaveLength(1);
    expect(armedSequence[3]?.shotFired).toBe(true);
  });
});
