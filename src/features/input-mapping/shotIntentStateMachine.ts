import type { HandEvidence } from "./createHandEvidence";
import type { IndexCurlState } from "./evaluateIndexCurl";

export type ShotIntentPhase =
  | "idle"
  | "tracking_lost"
  | "ready"
  | "armed"
  | "fired"
  | "recovering";

export type ShotIntentRejectReason =
  | "waiting_for_stable_extended"
  | "waiting_for_fire_entry"
  | "waiting_for_stable_curled"
  | "waiting_for_release"
  | "tracking_lost";

export type CrosshairLockAction = "none" | "freeze" | "release";

export interface ShotIntentState {
  phase: ShotIntentPhase;
  rejectReason: ShotIntentRejectReason;
  curlState: IndexCurlState;
  rawCurlState: IndexCurlState;
  curlConfidence: number;
  gunPoseConfidence: number;
  curledFrames: number;
  extendedFrames: number;
  gunPoseActive: boolean;
  nonGunPoseFrames: number;
  trackingPresentFrames: number;
}

export interface ShotIntentResult {
  state: ShotIntentState;
  shotFired: boolean;
  crosshairLockAction: CrosshairLockAction;
}

const FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55;
const FIRE_EXIT_GUN_POSE_CONFIDENCE = 0.45;
const GUN_POSE_GRACE_FRAMES = 1;
const TRIGGER_CONFIRMATION_FRAMES = 2;
const TRIGGER_RELEASE_FRAMES = 2;
const TRACKING_RECOVERY_FRAMES = 2;

const createInitialShotIntentState = (): ShotIntentState => ({
  phase: "idle",
  rejectReason: "waiting_for_stable_extended",
  curlState: "partial",
  rawCurlState: "partial",
  curlConfidence: 0,
  gunPoseConfidence: 0,
  curledFrames: 0,
  extendedFrames: 0,
  gunPoseActive: false,
  nonGunPoseFrames: 0,
  trackingPresentFrames: 0
});

const resolveGunPoseActive = (
  evidence: HandEvidence,
  previousState: ShotIntentState
): { gunPoseActive: boolean; nonGunPoseFrames: number; gunPoseConfidence: number } => {
  const gunPoseConfidence = evidence.gunPose?.confidence ?? 0;

  if (!evidence.trackingPresent) {
    return {
      gunPoseActive: false,
      nonGunPoseFrames: 0,
      gunPoseConfidence
    };
  }

  if (gunPoseConfidence >= FIRE_ENTRY_GUN_POSE_CONFIDENCE) {
    return {
      gunPoseActive: true,
      nonGunPoseFrames: 0,
      gunPoseConfidence
    };
  }

  if (previousState.gunPoseActive && gunPoseConfidence >= FIRE_EXIT_GUN_POSE_CONFIDENCE) {
    return {
      gunPoseActive: true,
      nonGunPoseFrames: 0,
      gunPoseConfidence
    };
  }

  const nonGunPoseFrames = previousState.gunPoseActive
    ? previousState.nonGunPoseFrames + 1
    : 1;

  return {
    gunPoseActive: previousState.gunPoseActive && nonGunPoseFrames <= GUN_POSE_GRACE_FRAMES,
    nonGunPoseFrames,
    gunPoseConfidence
  };
};

const resolveCurlState = (
  evidence: HandEvidence,
  previousState: ShotIntentState
): Pick<
  ShotIntentState,
  "curlState" | "rawCurlState" | "curlConfidence" | "curledFrames" | "extendedFrames"
> => {
  const rawCurlState = evidence.curl?.rawCurlState ?? previousState.rawCurlState;
  const curlConfidence = evidence.curl?.confidence ?? 0;
  const curledFrames = rawCurlState === "curled" ? previousState.curledFrames + 1 : 0;
  const extendedFrames = rawCurlState === "extended" ? previousState.extendedFrames + 1 : 0;

  let curlState = previousState.curlState;

  if (previousState.curlState === "extended" && rawCurlState === "partial") {
    curlState = "partial";
  } else if (
    previousState.curlState === "partial" &&
    rawCurlState === "curled" &&
    curledFrames >= TRIGGER_CONFIRMATION_FRAMES
  ) {
    curlState = "curled";
  } else if (
    previousState.curlState !== "extended" &&
    rawCurlState === "extended" &&
    extendedFrames >= TRIGGER_RELEASE_FRAMES
  ) {
    curlState = "extended";
  }

  return {
    curlState,
    rawCurlState,
    curlConfidence,
    curledFrames,
    extendedFrames
  };
};

const resolveRejectReason = (phase: ShotIntentPhase): ShotIntentRejectReason => {
  switch (phase) {
    case "idle":
      return "waiting_for_stable_extended";
    case "tracking_lost":
      return "tracking_lost";
    case "ready":
      return "waiting_for_fire_entry";
    case "armed":
      return "waiting_for_stable_curled";
    case "fired":
      return "waiting_for_release";
    case "recovering":
      return "waiting_for_release";
  }
};

const withTrackingLossReset = (state: ShotIntentState): ShotIntentState => ({
  ...state,
  phase: "tracking_lost",
  rejectReason: "tracking_lost",
  curlState: "partial",
  rawCurlState: "partial",
  curlConfidence: 0,
  gunPoseConfidence: 0,
  curledFrames: 0,
  extendedFrames: 0,
  gunPoseActive: false,
  nonGunPoseFrames: 0,
  trackingPresentFrames: 0
});

const withPoseLossReset = (
  state: ShotIntentState,
  trackingPresentFrames: number,
  nonGunPoseFrames: number,
  curlConfidence: number,
  gunPoseConfidence: number
): ShotIntentState => ({
  ...state,
  phase: "idle",
  rejectReason: resolveRejectReason("idle"),
  curlState: "partial",
  rawCurlState: "partial",
  curlConfidence,
  gunPoseConfidence,
  curledFrames: 0,
  extendedFrames: 0,
  gunPoseActive: false,
  nonGunPoseFrames,
  trackingPresentFrames
});

type CurlStateResolution = ReturnType<typeof resolveCurlState>;
type GunPoseResolution = ReturnType<typeof resolveGunPoseActive>;

const resolveTrackingLostState = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution
): ShotIntentResult => {
  if (trackingPresentFrames < TRACKING_RECOVERY_FRAMES) {
    return {
      state: {
        ...stateBefore,
        phase: "tracking_lost",
        rejectReason: "tracking_lost",
        curlState: curl.curlState,
        rawCurlState: curl.rawCurlState,
        curlConfidence: curl.curlConfidence,
        gunPoseConfidence: gunPose.gunPoseConfidence,
        curledFrames: curl.curledFrames,
        extendedFrames: curl.extendedFrames,
        gunPoseActive: gunPose.gunPoseActive,
        nonGunPoseFrames: gunPose.nonGunPoseFrames,
        trackingPresentFrames
      },
      shotFired: false,
      crosshairLockAction: "release"
    };
  }

  return {
    state: {
      ...stateBefore,
      phase: "idle",
      rejectReason: resolveRejectReason("idle"),
      curlState: curl.curlState,
      rawCurlState: curl.rawCurlState,
      curlConfidence: curl.curlConfidence,
      gunPoseConfidence: gunPose.gunPoseConfidence,
      curledFrames: curl.curledFrames,
      extendedFrames: curl.extendedFrames,
      gunPoseActive: gunPose.gunPoseActive,
      nonGunPoseFrames: gunPose.nonGunPoseFrames,
      trackingPresentFrames
    },
    shotFired: false,
    crosshairLockAction: "none"
  };
};

const buildTrackedState = (
  stateBefore: ShotIntentState,
  phase: ShotIntentPhase,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  trackingPresentFrames: number
): ShotIntentState => ({
  ...stateBefore,
  phase,
  rejectReason: resolveRejectReason(phase),
  curlState: curl.curlState,
  rawCurlState: curl.rawCurlState,
  curlConfidence: curl.curlConfidence,
  gunPoseConfidence: gunPose.gunPoseConfidence,
  curledFrames: curl.curledFrames,
  extendedFrames: curl.extendedFrames,
  gunPoseActive: gunPose.gunPoseActive,
  nonGunPoseFrames: gunPose.nonGunPoseFrames,
  trackingPresentFrames
});

const advanceIdlePhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableExtended = curl.curlState === "extended" && curl.extendedFrames >= TRIGGER_RELEASE_FRAMES;
  const phase: ShotIntentPhase = trackingAndPoseReady && stableExtended ? "ready" : "idle";

  return {
    state: buildTrackedState(stateBefore, phase, curl, gunPose, trackingPresentFrames),
    shotFired: false,
    crosshairLockAction: "none"
  };
};

const advanceReadyPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableExtended = curl.curlState === "extended" && curl.extendedFrames >= TRIGGER_RELEASE_FRAMES;
  const phase: ShotIntentPhase = trackingAndPoseReady && stableExtended ? "armed" : "ready";

  return {
    state: buildTrackedState(stateBefore, phase, curl, gunPose, trackingPresentFrames),
    shotFired: false,
    crosshairLockAction: "none"
  };
};

const advanceArmedPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableCurled = curl.curlState === "curled" && curl.curledFrames >= TRIGGER_CONFIRMATION_FRAMES;
  const shotFired = trackingAndPoseReady && stableCurled;
  const phase: ShotIntentPhase = shotFired ? "fired" : "armed";
  const enteringPartial = stateBefore.curlState === "extended" && curl.rawCurlState === "partial";
  const crosshairLockAction: CrosshairLockAction = enteringPartial ? "freeze" : "none";

  return {
    state: buildTrackedState(stateBefore, phase, curl, gunPose, trackingPresentFrames),
    shotFired,
    crosshairLockAction
  };
};

const advanceFiredPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution
): ShotIntentResult => ({
  state: buildTrackedState(stateBefore, "recovering", curl, gunPose, trackingPresentFrames),
  shotFired: false,
  crosshairLockAction: "none"
});

const advanceRecoveringPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableExtended = curl.curlState === "extended" && curl.extendedFrames >= TRIGGER_RELEASE_FRAMES;
  const phase: ShotIntentPhase = trackingAndPoseReady && stableExtended ? "ready" : "recovering";
  const crosshairLockAction: CrosshairLockAction = phase === "ready" ? "release" : "none";

  return {
    state: buildTrackedState(stateBefore, phase, curl, gunPose, trackingPresentFrames),
    shotFired: false,
    crosshairLockAction
  };
};

const advanceTrackedPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  curl: CurlStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  switch (stateBefore.phase) {
    case "idle":
      return advanceIdlePhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
    case "ready":
      return advanceReadyPhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
    case "armed":
      return advanceArmedPhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
    case "fired":
      return advanceFiredPhase(stateBefore, trackingPresentFrames, curl, gunPose);
    case "recovering":
      return advanceRecoveringPhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
  }

  throw new Error(`Unhandled shot intent phase: ${stateBefore.phase}`);
};

export const advanceShotIntentState = (
  previousState: ShotIntentState | undefined,
  evidence: HandEvidence
): ShotIntentResult => {
  const stateBefore = previousState ?? createInitialShotIntentState();

  if (!evidence.trackingPresent) {
    return {
      state: withTrackingLossReset(stateBefore),
      shotFired: false,
      crosshairLockAction: "release"
    };
  }

  const trackingPresentFrames = stateBefore.trackingPresentFrames + 1;
  const curl = resolveCurlState(evidence, stateBefore);
  const gunPose = resolveGunPoseActive(evidence, stateBefore);
  const gunPoseFireReady = (evidence.gunPose?.confidence ?? 0) >= FIRE_ENTRY_GUN_POSE_CONFIDENCE;
  const poseLost = !gunPose.gunPoseActive && gunPose.nonGunPoseFrames > GUN_POSE_GRACE_FRAMES;

  if (poseLost) {
    return {
      state: withPoseLossReset(
        stateBefore,
        trackingPresentFrames,
        gunPose.nonGunPoseFrames,
        curl.curlConfidence,
        gunPose.gunPoseConfidence
      ),
      shotFired: false,
      crosshairLockAction: "release"
    };
  }

  if (stateBefore.phase === "tracking_lost") {
    return resolveTrackingLostState(stateBefore, trackingPresentFrames, curl, gunPose);
  }

  return advanceTrackedPhase(stateBefore, trackingPresentFrames, curl, gunPose, gunPoseFireReady);
};
