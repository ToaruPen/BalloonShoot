import { describe, expect, it } from "vitest";
import { createInitialAppState, reduceAppEvent } from "../../../src/app/state/reduceAppEvent";

describe("reduceAppEvent", () => {
  it("moves from camera-ready to countdown to playing", () => {
    let state = createInitialAppState();

    state = reduceAppEvent(state, { type: "CAMERA_READY" });
    state = reduceAppEvent(state, { type: "START_CLICKED" });
    state = reduceAppEvent(state, { type: "COUNTDOWN_TICK", secondsRemaining: 0 });

    expect(state.screen).toBe("playing");
  });

  it("moves to result when time expires", () => {
    const state = reduceAppEvent(
      {
        screen: "playing",
        countdown: 0,
        score: 12,
        combo: 0,
        multiplier: 1
      },
      { type: "TIME_UP" }
    );

    expect(state.screen).toBe("result");
    expect(state.score).toBe(12);
  });

  it("syncs score payloads into the playing state", () => {
    const state = reduceAppEvent(
      {
        screen: "playing",
        countdown: 0,
        score: 0,
        combo: 0,
        multiplier: 1
      },
      { type: "SCORE_SYNC", score: 9, combo: 3, multiplier: 2 }
    );

    expect(state.score).toBe(9);
    expect(state.combo).toBe(3);
    expect(state.multiplier).toBe(2);
  });

  it("resets back to the permission screen on retry", () => {
    const state = reduceAppEvent(
      {
        screen: "result",
        countdown: 0,
        score: 14,
        combo: 0,
        multiplier: 1
      },
      { type: "RETRY_CLICKED" }
    );

    expect(state).toEqual(createInitialAppState());
  });
});
