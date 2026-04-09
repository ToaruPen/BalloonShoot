import { describe, expect, it } from "vitest";
import {
  evaluateThumbTrigger,
  type TriggerTuning
} from "../../../../src/features/input-mapping/evaluateThumbTrigger";
import {
  createThumbTriggerFrame,
  createThumbTriggerFrameFromProjection,
  mirrorThumbTriggerFrame
} from "./thumbTriggerTestHelper";
import type { HandFrame } from "../../../../src/shared/types/hand";

const tuning: TriggerTuning = {
  triggerPullThreshold: 0.18,
  triggerReleaseThreshold: 0.1
};

const DIRECT_LANDMARKS: HandFrame["landmarks"] = {
  wrist: { x: 0.4, y: 0.7, z: 0 },
  indexTip: { x: 0.5, y: 0.3, z: 0 },
  indexMcp: { x: 0.47, y: 0.48, z: 0 },
  thumbIp: { x: 0.37, y: 0.57, z: 0 },
  thumbTip: { x: 0.305, y: 0.605, z: 0 },
  middleTip: { x: 0.45, y: 0.64, z: 0 },
  ringTip: { x: 0.42, y: 0.66, z: 0 },
  pinkyTip: { x: 0.39, y: 0.67, z: 0 }
};

const DIRECT_PULLED_LANDMARKS: HandFrame["landmarks"] = {
  ...DIRECT_LANDMARKS,
  thumbTip: { x: 0.425, y: 0.53, z: 0 }
};

const mirrorLandmarks = (landmarks: HandFrame["landmarks"]): HandFrame["landmarks"] =>
  Object.fromEntries(
    Object.entries(landmarks).map(([key, point]) => [key, { ...point, x: 1 - point.x }])
  ) as HandFrame["landmarks"];

describe("evaluateThumbTrigger", () => {
  it("keeps the same decision across hand scales for the same normalized projection", () => {
    const openSmall = createThumbTriggerFrame("open", { scale: 0.85 });
    const openLarge = createThumbTriggerFrame("open", { scale: 1.2 });
    const pulledSmall = createThumbTriggerFrame("pulled", { scale: 0.85 });
    const pulledLarge = createThumbTriggerFrame("pulled", { scale: 1.2 });

    expect(evaluateThumbTrigger(openSmall, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(openLarge, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(pulledSmall, "open", tuning)).toBe("pulled");
    expect(evaluateThumbTrigger(pulledLarge, "open", tuning)).toBe("pulled");
  });

  it("pulls for the mirrored left-hand geometry too", () => {
    const open = mirrorThumbTriggerFrame(createThumbTriggerFrame("open"));
    const pulled = mirrorThumbTriggerFrame(createThumbTriggerFrame("pulled"));

    expect(evaluateThumbTrigger(open, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(pulled, "open", tuning)).toBe("pulled");
  });

  it("classifies explicit hand coordinates and their mirror without the helper formula", () => {
    const open: HandFrame = {
      width: 640,
      height: 480,
      landmarks: DIRECT_LANDMARKS
    };
    const pulled: HandFrame = {
      width: 640,
      height: 480,
      landmarks: DIRECT_PULLED_LANDMARKS
    };
    const mirroredOpen: HandFrame = {
      ...open,
      landmarks: mirrorLandmarks(open.landmarks)
    };
    const mirroredPulled: HandFrame = {
      ...pulled,
      landmarks: mirrorLandmarks(pulled.landmarks)
    };

    expect(evaluateThumbTrigger(open, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(pulled, "open", tuning)).toBe("pulled");
    expect(evaluateThumbTrigger(mirroredOpen, "open", tuning)).toBe("open");
    expect(evaluateThumbTrigger(mirroredPulled, "open", tuning)).toBe("pulled");
  });

  it("keeps the trigger latched until the release threshold is crossed", () => {
    const latched = createThumbTriggerFrame("latched");
    const released = createThumbTriggerFrame("open");

    expect(evaluateThumbTrigger(latched, "pulled", tuning)).toBe("pulled");
    expect(evaluateThumbTrigger(released, "pulled", tuning)).toBe("open");
  });

  it("stays open exactly at the pull threshold boundary", () => {
    const boundary = createThumbTriggerFrameFromProjection(tuning.triggerPullThreshold);

    expect(evaluateThumbTrigger(boundary, "open", tuning)).toBe("open");
  });

  it("releases exactly at the release threshold boundary", () => {
    const boundary = createThumbTriggerFrameFromProjection(tuning.triggerReleaseThreshold);

    expect(evaluateThumbTrigger(boundary, "pulled", tuning)).toBe("open");
  });

  it("clamps invalid hysteresis ordering when tuning is passed directly", () => {
    const invalidTuning: TriggerTuning = {
      triggerPullThreshold: 0.18,
      triggerReleaseThreshold: 0.4
    };

    expect(evaluateThumbTrigger(createThumbTriggerFrame("pulled"), "open", invalidTuning)).toBe(
      "pulled"
    );
    expect(
      evaluateThumbTrigger(createThumbTriggerFrame("pulled"), "pulled", invalidTuning)
    ).toBe("pulled");
  });
});
