import { describe, expect, it } from "vitest";
import { smoothCrosshair } from "../../../../src/features/input-mapping/createCrosshairSmoother";
import { evaluateGunPose, measureGunPose } from "../../../../src/features/input-mapping/evaluateGunPose";
import {
  buildHandEvidence,
  mapHandToGameInput,
  type GameInputFrame,
  type InputTuning
} from "../../../../src/features/input-mapping/mapHandToGameInput";
import { gameConfig } from "../../../../src/shared/config/gameConfig";
import type { HandFrame } from "../../../../src/shared/types/hand";
import {
  createThumbTriggerFrame,
  type ThumbTriggerPose,
  withThumbTriggerPose
} from "./thumbTriggerTestHelper";

const frame: HandFrame = createThumbTriggerFrame("open");
const canvasSize = { width: 1280, height: 720 };

const expectDefined = <T>(value: T | null | undefined, message: string): T => {
  if (value === undefined || value === null) {
    throw new Error(message);
  }

  return value;
};

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
  const third = mapHandToGameInput(
    withThumbTriggerPose(frame, "open"),
    canvasSize,
    second.runtime,
    tuning
  );

  expect(third.runtime.phase).toBe("armed");

  return third.runtime;
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

const withGunPoseActive = withGunPose;

const withLowConfidenceGunPose = (inputFrame: HandFrame): HandFrame => ({
  ...inputFrame,
  landmarks: {
    ...inputFrame.landmarks,
    indexTip: { ...inputFrame.landmarks.indexTip, y: inputFrame.landmarks.indexMcp.y - 0.01 },
    middleTip: { ...inputFrame.landmarks.middleTip, y: inputFrame.landmarks.indexMcp.y + 0.04 },
    ringTip: { ...inputFrame.landmarks.ringTip, y: inputFrame.landmarks.indexMcp.y + 0.04 },
    pinkyTip: { ...inputFrame.landmarks.pinkyTip, y: inputFrame.landmarks.indexMcp.y + 0.04 }
  }
});

interface Issue30FrameStep {
  pose: ThumbTriggerPose;
  gunPoseActive?: boolean;
}

const createIssue30Frame = (
  pose: ThumbTriggerPose,
  gunPoseActive = true
): HandFrame => withGunPoseActive(withThumbTriggerPose(frame, pose), gunPoseActive);

const runIssue30Sequence = (
  steps: Issue30FrameStep[],
  initialRuntime: GameInputFrame["runtime"] = createArmedRuntime()
): GameInputFrame[] =>
  runInputSequence(
    steps.map(({ pose, gunPoseActive = true }) => createIssue30Frame(pose, gunPoseActive)),
    initialRuntime
  );

interface Issue30ContractScenario {
  name: string;
  steps: Issue30FrameStep[];
  initialRuntime?: GameInputFrame["runtime"];
  assert: (results: GameInputFrame[]) => void;
}

const issue30ContractScenarios: Issue30ContractScenario[] = [
  {
    name: "one intentional pull emits exactly one shot",
    steps: [
      { pose: "open" },
      { pose: "open" },
      { pose: "pulled" },
      { pose: "pulled" }
    ],
    assert: (results) => {
      expect(results.filter((result) => result.shotFired)).toHaveLength(1);
      expect(results[3]?.shotFired).toBe(true);
    }
  },
  {
    name: "held pull does not auto-repeat",
    steps: [
      { pose: "open" },
      { pose: "open" },
      { pose: "pulled" },
      { pose: "pulled" },
      { pose: "pulled" },
      { pose: "pulled" }
    ],
    assert: (results) => {
      expect(results.filter((result) => result.shotFired)).toHaveLength(1);
      expect(results.at(-1)?.shotFired).toBe(false);
    }
  },
  {
    name: "brief thumb jitter does not emit",
    steps: [
      { pose: "open" },
      { pose: "open" },
      { pose: "pulled" },
      { pose: "pulled" },
      { pose: "open" },
      { pose: "pulled" },
      { pose: "pulled" }
    ],
    assert: (results) => {
      expect(results.filter((result) => result.shotFired)).toHaveLength(1);
      expect(results[4]?.triggerState).toBe("pulled");
      expect(results[6]?.shotFired).toBe(false);
    }
  },
  {
    name: "brief pose drop does not instantly cancel a valid armed state",
    steps: [
      { pose: "open" },
      { pose: "open" },
      { pose: "pulled" },
      { pose: "pulled", gunPoseActive: false },
      { pose: "pulled" }
    ],
    assert: (results) => {
      expect(results[3]?.gunPoseActive).toBe(true);
      expect(results[4]?.gunPoseActive).toBe(true);
      expect(results.filter((result) => result.shotFired)).toHaveLength(1);
    }
  },
  {
    name: "tracking reacquisition alone does not emit",
    steps: [
      { pose: "open" },
      { pose: "open", gunPoseActive: false },
      { pose: "pulled", gunPoseActive: false },
      { pose: "pulled", gunPoseActive: false },
      { pose: "pulled" }
    ],
    assert: (results) => {
      expect(results[4]?.gunPoseActive).toBe(true);
      expect(results[4]?.triggerState).toBe("pulled");
      expect(results.filter((result) => result.shotFired)).toHaveLength(0);
    }
  }
];

describe("mapHandToGameInput", () => {
  it("builds hand evidence without conflating tracking presence with trigger state", () => {
    const evidence = buildHandEvidence(frame, canvasSize, undefined, 1234, gameConfig.input);

    expect(evidence.trackingPresent).toBe(true);
    expect(evidence.frameAtMs).toBe(1234);
    const trigger = expectDefined(evidence.trigger, "Expected trigger evidence");
    const gunPose = expectDefined(evidence.gunPose, "Expected gun pose evidence");
    const smoothedCrosshairCandidate = expectDefined(
      evidence.smoothedCrosshairCandidate,
      "Expected smoothed crosshair"
    );

    expect(trigger.rawState).toBe("open");
    expect(trigger.confidence).toBeGreaterThanOrEqual(0);
    expect(trigger.confidence).toBeLessThanOrEqual(1);
    expect(trigger.details.projection).toEqual(expect.any(Number));
    expect(gunPose.detected).toBe(true);
    expect(gunPose.confidence).toBeGreaterThanOrEqual(0);
    expect(gunPose.confidence).toBeLessThanOrEqual(1);
    expect(gunPose.details.indexExtended).toBe(true);
    expect(smoothedCrosshairCandidate.x).toBeTypeOf("number");
    expect(smoothedCrosshairCandidate.y).toBeTypeOf("number");
  });

  it("represents missing tracking explicitly instead of inventing trigger state", () => {
    const evidence = buildHandEvidence(undefined, canvasSize, undefined, 5678, gameConfig.input);

    expect(evidence.trackingPresent).toBe(false);
    expect(evidence.frameAtMs).toBe(5678);
    expect(evidence.smoothedCrosshairCandidate).toBeNull();
    expect(evidence.trigger).toBeNull();
    expect(evidence.gunPose).toBeNull();
  });

  it("turns missing tracking into tracking_lost and clears the crosshair", () => {
    const result = mapHandToGameInput(
      undefined,
      canvasSize,
      createArmedRuntime()
    );

    expect(result.runtime.phase).toBe("tracking_lost");
    expect(result.runtime.rejectReason).toBe("tracking_lost");
    expect(result.shotFired).toBe(false);
    expect(result.crosshair).toBeUndefined();
    expect(result.runtime.crosshair).toBeUndefined();
  });

  it("detects a gun pose using hand-size-normalized curl distance", () => {
    expect(
      evaluateGunPose({
        width: 640,
        height: 480,
        landmarks: {
          wrist: { x: 0.4, y: 0.7, z: 0 },
          indexTip: { x: 0.5, y: 0.3, z: 0 },
          indexDip: { x: 0, y: 0, z: 0 },
          indexPip: { x: 0, y: 0, z: 0 },
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

  it("pose-drop tolerance: one-frame weak gun pose should not emit shot", () => {
    const weakPoseFrame = {
      ...frame,
      landmarks: {
        ...frame.landmarks,
        indexTip: { ...frame.landmarks.indexTip, y: frame.landmarks.indexMcp.y - 0.01 },
        middleTip: { ...frame.landmarks.middleTip, y: frame.landmarks.indexMcp.y + 0.04 },
        ringTip: { ...frame.landmarks.ringTip, y: frame.landmarks.indexMcp.y + 0.04 },
        pinkyTip: { ...frame.landmarks.pinkyTip, y: frame.landmarks.indexMcp.y + 0.04 }
      }
    } as const;

    const results = runInputSequence(
      [
        withThumbTriggerPose(frame, "open"),
        withThumbTriggerPose(weakPoseFrame, "pulled"),
        withThumbTriggerPose(weakPoseFrame, "pulled")
      ],
      createArmedRuntime()
    );

    expect(results.some((result) => result.shotFired)).toBe(false);
    expect(evaluateGunPose(weakPoseFrame)).toBe(false);
    expect(results[1]?.gunPoseActive).toBe(true);
    expect(results[2]?.gunPoseActive).toBe(true);
    expect(results[2]?.shotFired).toBe(false);
  });

  it("blocks fire on a low-confidence pull frame but keeps the pose visible", () => {
    const lowConfidencePullFrame = withThumbTriggerPose(withLowConfidenceGunPose(frame), "pulled");
    const lowConfidenceMeasurement = measureGunPose(lowConfidencePullFrame);
    const results = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      lowConfidencePullFrame,
      withThumbTriggerPose(frame, "pulled")
    ]);

    expect(lowConfidenceMeasurement.detected).toBe(false);
    expect(results[4]?.gunPoseActive).toBe(true);
    expect(results[4]?.shotFired).toBe(false);
    expect(results[5]?.shotFired).toBe(true);
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
    const crosshair = expectDefined(result.crosshair, "Expected crosshair");

    expect(crosshair.x).toBeCloseTo(640, 0);
    expect(crosshair.y).toBeCloseTo(168, 0);
  });

  describe("issue-30 interaction contract", () => {
    it.each(issue30ContractScenarios)("$name", ({ steps, initialRuntime, assert }) => {
      const results = runIssue30Sequence(steps, initialRuntime);

      assert(results);
    });
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

    const crosshair = expectDefined(result.crosshair, "Expected clamped crosshair");

    expect(crosshair).toEqual({ x: 0, y: 0 });
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
    const firstCrosshair = first.crosshair;
    const secondCrosshair = second.crosshair;

    expect(firstCrosshair).toBeDefined();
    expect(secondCrosshair).toBeDefined();
    const definedFirstCrosshair = expectDefined(firstCrosshair, "Expected first crosshair");
    const definedSecondCrosshair = expectDefined(secondCrosshair, "Expected second crosshair");

    expect(definedSecondCrosshair.x).toBeLessThan(definedFirstCrosshair.x);
    expect(definedSecondCrosshair.x).toBeGreaterThan(256);
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
    const secondCrosshair = second.crosshair;

    expect(secondCrosshair).toBeDefined();
    expect(expectDefined(secondCrosshair, "Expected crosshair").x).toBeCloseTo(448, 0);
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

  it("requires a full open cycle before firing again after release", () => {
    const results = runInputSequence(
      [
        withThumbTriggerPose(frame, "open"),
        withThumbTriggerPose(frame, "open"),
        withThumbTriggerPose(frame, "open"),
        withThumbTriggerPose(frame, "pulled"),
        withThumbTriggerPose(frame, "pulled"),
        withThumbTriggerPose(frame, "open"),
        withThumbTriggerPose(frame, "open"),
        withThumbTriggerPose(frame, "open"),
        withThumbTriggerPose(frame, "pulled"),
        withThumbTriggerPose(frame, "pulled")
      ],
      createArmedRuntime()
    );

    expect(results.filter((result) => result.shotFired)).toHaveLength(2);
    expect(results[9]?.shotFired).toBe(true);
  });

  it("cold-start open-open-pulled-pulled does not fire", () => {
    const coldStart = runInputSequence([
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "open"),
      withThumbTriggerPose(frame, "pulled"),
      withThumbTriggerPose(frame, "pulled")
    ]);
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
    expect(coldStart.some((result) => result.shotFired)).toBe(false);
    expect(heldAtStart.some((result) => result.shotFired)).toBe(false);
    expect(noisyRelease.some((result) => result.shotFired)).toBe(false);
  });
});
