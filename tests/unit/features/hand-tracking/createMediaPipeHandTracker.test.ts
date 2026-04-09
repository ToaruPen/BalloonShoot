import { describe, expect, it, vi } from "vitest";

const BASE_LANDMARKS = [
  { x: 0.1, y: 0.2, z: 0.3 },
  {},
  {},
  { x: 0.2, y: 0.3, z: 0.4 },
  { x: 0.3, y: 0.4, z: 0.5 },
  { x: 0.4, y: 0.5, z: 0.6 },
  {},
  {},
  { x: 0.5, y: 0.6, z: 0.7 },
  {},
  {},
  {},
  { x: 0.6, y: 0.7, z: 0.8 },
  {},
  {},
  {},
  { x: 0.7, y: 0.8, z: 0.9 },
  {},
  {},
  {},
  { x: 0.8, y: 0.9, z: 1.0 }
];

const EXPECTED_HAND_LANDMARKS = {
  wrist: { x: 0.1, y: 0.2, z: 0.3 },
  thumbIp: { x: 0.2, y: 0.3, z: 0.4 },
  thumbTip: { x: 0.3, y: 0.4, z: 0.5 },
  indexMcp: { x: 0.4, y: 0.5, z: 0.6 },
  indexTip: { x: 0.5, y: 0.6, z: 0.7 },
  middleTip: { x: 0.6, y: 0.7, z: 0.8 },
  ringTip: { x: 0.7, y: 0.8, z: 0.9 },
  pinkyTip: { x: 0.8, y: 0.9, z: 1 }
};

const createExpectedFrame = (extra: Record<string, unknown> = {}) => ({
  width: 640,
  height: 480,
  ...extra,
  landmarks: EXPECTED_HAND_LANDMARKS
});

const { createFromOptions, forVisionTasks } = vi.hoisted(() => ({
  createFromOptions: vi.fn(() =>
    Promise.resolve({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS]
      }))
    })
  ),
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
  it("loads the hand landmarker and returns HandFrame results through detect", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS],
        handedness: [
          [
            {
              score: 0.97,
              index: 0,
              categoryName: "Right",
              displayName: "Right"
            }
          ]
        ]
      }))
    });

    const tracker = await createMediaPipeHandTracker();
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await expect(tracker.detect(bitmap, 123)).resolves.toEqual(createExpectedFrame({
      handedness: [
        {
          score: 0.97,
          index: 0,
          categoryName: "Right",
          displayName: "Right"
        }
      ],
    }));

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

  it("omits handedness when the tracker result does not include it", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS]
      }))
    });

    const tracker = await createMediaPipeHandTracker();
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const frame = await tracker.detect(bitmap, 123);

    expect(frame).toStrictEqual(createExpectedFrame());
    expect(frame).not.toHaveProperty("handedness");
  });

  it("omits handedness when the tracker result includes an empty selected-hand array", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS],
        handedness: [[]]
      }))
    });

    const tracker = await createMediaPipeHandTracker();
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const frame = await tracker.detect(bitmap, 123);

    expect(frame).toStrictEqual(createExpectedFrame());
    expect(frame).not.toHaveProperty("handedness");
  });

  it("returns undefined when no hands are detected", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({ landmarks: [] }))
    });

    const tracker = await createMediaPipeHandTracker();
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await expect(tracker.detect(bitmap, 123)).resolves.toBeUndefined();
  });
});
