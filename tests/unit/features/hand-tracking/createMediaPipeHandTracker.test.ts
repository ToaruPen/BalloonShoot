import { describe, expect, it, vi } from "vitest";

const { createFromOptions, forVisionTasks } = vi.hoisted(() => ({
  createFromOptions: vi.fn(() => Promise.resolve("tracker")),
  forVisionTasks: vi.fn(() => Promise.resolve("vision"))
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: {
    forVisionTasks
  },
  HandLandmarker: {
    createFromOptions
  }
}));

import { createMediaPipeHandTracker } from "../../../../src/features/hand-tracking/createMediaPipeHandTracker";

describe("createMediaPipeHandTracker", () => {
  it("loads the hand landmarker with the PoC model path and video mode", async () => {
    await expect(createMediaPipeHandTracker()).resolves.toBe("tracker");

    expect(forVisionTasks).toHaveBeenCalledWith(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm"
    );
    expect(createFromOptions).toHaveBeenCalledWith("vision", {
      baseOptions: {
        modelAssetPath: "/models/hand_landmarker.task"
      },
      numHands: 1,
      runningMode: "VIDEO"
    });
  });
});
