import type { AppEvent, AppState } from "./appState";

export const createInitialAppState = (): AppState => ({
  screen: "permission",
  countdown: 3,
  score: 0,
  combo: 0,
  multiplier: 1
});

export const reduceAppEvent = (state: AppState, event: AppEvent): AppState => {
  switch (event.type) {
    case "CAMERA_READY":
      return state.screen === "permission" ? { ...state, screen: "ready" } : state;
    case "START_CLICKED":
      return state.screen === "ready" ? { ...state, screen: "countdown", countdown: 3 } : state;
    case "COUNTDOWN_TICK":
      if (state.screen !== "countdown") {
        return state;
      }

      return event.secondsRemaining <= 0
        ? { ...state, screen: "playing", countdown: 0 }
        : { ...state, countdown: event.secondsRemaining };
    case "TIME_UP":
      return state.screen === "playing" ? { ...state, screen: "result" } : state;
    case "SCORE_SYNC":
      return {
        ...state,
        score: event.score,
        combo: event.combo,
        multiplier: event.multiplier
      };
    case "RETRY_CLICKED":
      return createInitialAppState();
  }
};
