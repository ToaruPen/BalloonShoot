export type ScreenName = "permission" | "ready" | "countdown" | "playing" | "result";

export interface AppState {
  screen: ScreenName;
  countdown: number;
  score: number;
  combo: number;
  multiplier: number;
}

export type AppEvent =
  | { type: "CAMERA_READY" }
  | { type: "START_CLICKED" }
  | { type: "COUNTDOWN_TICK"; secondsRemaining: number }
  | { type: "TIME_UP" }
  | { type: "SCORE_SYNC"; score: number; combo: number; multiplier: number }
  | { type: "RETRY_CLICKED" };
