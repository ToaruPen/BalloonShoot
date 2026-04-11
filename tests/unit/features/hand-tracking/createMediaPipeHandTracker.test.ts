import { describe, expect, it, vi } from "vitest";

type TestLandmark = { x: number; y: number; z: number } | Record<string, never>;

const BASE_LANDMARKS_FRAME_1: TestLandmark[] = [
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

const BASE_LANDMARKS_FRAME_2 = BASE_LANDMARKS_FRAME_1.map((landmark) => {
  if ("x" in landmark) {
    return {
      x: landmark.x + 0.1,
      y: landmark.y + 0.1,
      z: landmark.z + 0.1
    };
  }
  return landmark;
});

const EXPECTED_RAW_LANDMARKS = {
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
  landmarks: EXPECTED_RAW_LANDMARKS
});

const { createFromOptions, forVisionTasks } = vi.hoisted(() => ({
  createFromOptions: vi.fn(() =>
    Promise.resolve({
      detectForVideo: vi.fn(() => ({ landmarks: [BASE_LANDMARKS_FRAME_1] }))
    })
  ),
  forVisionTasks: vi.fn(() => Promise.resolve("vision"))
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks },
  HandLandmarker: { createFromOptions }
}));

import { createMediaPipeHandTracker } from "../../../../src/features/hand-tracking/createMediaPipeHandTracker";

const PASS_THROUGH_CONFIG = () => ({
  minCutoff: 1_000_000,
  beta: 0,
  dCutoff: 1_000_000
});

describe("createMediaPipeHandTracker", () => {
  it("loads the hand landmarker and returns a HandDetection with matching raw and filtered frames", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS_FRAME_1],
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

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const expectedFrame = createExpectedFrame({
      handedness: [
        {
          score: 0.97,
          index: 0,
          categoryName: "Right",
          displayName: "Right"
        }
      ]
    });

    await expect(tracker.detect(bitmap, 0)).resolves.toEqual({
      rawFrame: expectedFrame,
      filteredFrame: expectedFrame
    });

    expect(forVisionTasks).toHaveBeenCalledWith(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm"
    );
    expect(createFromOptions).toHaveBeenCalledWith("vision", {
      baseOptions: { modelAssetPath: "/models/hand_landmarker.task" },
      numHands: 1,
      runningMode: "VIDEO"
    });
  });

  it("omits handedness when the tracker result does not include it", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({ landmarks: [BASE_LANDMARKS_FRAME_1] }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const detection = await tracker.detect(bitmap, 0);

    expect(detection?.rawFrame).toStrictEqual(createExpectedFrame());
    expect(detection?.rawFrame).not.toHaveProperty("handedness");
    expect(detection?.filteredFrame).not.toHaveProperty("handedness");
  });

  it("omits handedness when the tracker result includes an empty selected-hand array", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({
        landmarks: [BASE_LANDMARKS_FRAME_1],
        handedness: [[]]
      }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const detection = await tracker.detect(bitmap, 0);

    expect(detection?.rawFrame).toStrictEqual(createExpectedFrame());
    expect(detection?.rawFrame).not.toHaveProperty("handedness");
  });

  it("returns undefined when no hands are detected", async () => {
    createFromOptions.mockResolvedValueOnce({
      detectForVideo: vi.fn(() => ({ landmarks: [] }))
    });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: PASS_THROUGH_CONFIG
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await expect(tracker.detect(bitmap, 0)).resolves.toBeUndefined();
  });

  it("smooths per-landmark x/y/z values on the filtered frame while keeping raw untouched", async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_1] })
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_2] });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });

    // Aggressive smoothing: very low minCutoff, beta zero. Math:
    //   alpha = 1/(1 + (1/(2*pi*0.01))/0.033) ~= 0.00207
    // so frame 2 output ~= prev + 0.00207 * (raw - prev).
    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: () => ({ minCutoff: 0.01, beta: 0, dCutoff: 1.0 })
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    const first = await tracker.detect(bitmap, 0);
    const second = await tracker.detect(bitmap, 33);

    expect(first?.filteredFrame.landmarks.indexTip.x).toBeCloseTo(0.5);
    expect(second?.rawFrame.landmarks.indexTip.x).toBeCloseTo(0.6);
    expect(second?.filteredFrame.landmarks.indexTip.x).toBeGreaterThan(0.5);
    expect(second?.filteredFrame.landmarks.indexTip.x).toBeLessThan(0.51);
    expect(second?.filteredFrame.landmarks.indexTip.y).toBeGreaterThan(0.6);
    expect(second?.filteredFrame.landmarks.indexTip.y).toBeLessThan(0.61);
    expect(second?.filteredFrame.landmarks.indexTip.z).toBeGreaterThan(0.7);
    expect(second?.filteredFrame.landmarks.indexTip.z).toBeLessThan(0.71);
  });

  it("resets filter state when the hand leaves the frame so re-acquisition seeds fresh", async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_1] })
      .mockReturnValueOnce({ landmarks: [] })
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_2] });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });

    const tracker = await createMediaPipeHandTracker({
      getFilterConfig: () => ({ minCutoff: 0.01, beta: 0, dCutoff: 1.0 })
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await tracker.detect(bitmap, 0);
    await tracker.detect(bitmap, 33);
    const reacquired = await tracker.detect(bitmap, 66);

    expect(reacquired?.filteredFrame.landmarks.wrist.x).toBeCloseTo(0.2);
    expect(reacquired?.filteredFrame.landmarks.wrist.y).toBeCloseTo(0.3);
    expect(reacquired?.filteredFrame.landmarks.wrist.z).toBeCloseTo(0.4);
  });

  it("re-reads getFilterConfig on every detect call so slider moves apply live", async () => {
    const detectForVideo = vi
      .fn()
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_1] })
      .mockReturnValueOnce({ landmarks: [BASE_LANDMARKS_FRAME_2] });
    createFromOptions.mockResolvedValueOnce({ detectForVideo });

    const config = { minCutoff: 0.01, beta: 0, dCutoff: 1.0 };
    const getFilterConfig = vi.fn(() => config);
    const tracker = await createMediaPipeHandTracker({
      getFilterConfig
    });
    const bitmap = { width: 640, height: 480 } as ImageBitmap;

    await tracker.detect(bitmap, 0);
    config.minCutoff = 1_000_000;
    const relaxed = await tracker.detect(bitmap, 33);

    expect(relaxed?.filteredFrame.landmarks.indexTip.x).toBeCloseTo(0.6);
    expect(getFilterConfig.mock.calls.length).toBeGreaterThan(1);
  });
});
