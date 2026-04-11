import type { HandEvidence } from "./createHandEvidence";
import type { TriggerState } from "./evaluateThumbTrigger";

export type ShotIntentPhase =
  | "idle"
  | "tracking_lost"
  | "ready"
  | "armed"
  | "fired"
  | "recovering";

export type ShotIntentRejectReason =
  | "waiting_for_stable_open"
  | "waiting_for_fire_entry"
  | "waiting_for_stable_pulled"
  | "waiting_for_release"
  | "tracking_lost";

export interface ShotIntentState {
  phase: ShotIntentPhase;
  rejectReason: ShotIntentRejectReason;
  triggerState: TriggerState;
  rawTriggerState: TriggerState;
  triggerConfidence: number;
  gunPoseConfidence: number;
  pulledFrames: number;
  openFrames: number;
  hasSeenStableOpen: boolean;
  gunPoseActive: boolean;
  nonGunPoseFrames: number;
  trackingPresentFrames: number;
}

export interface ShotIntentResult {
  state: ShotIntentState;
  shotFired: boolean;
}

const FIRE_ENTRY_GUN_POSE_CONFIDENCE = 0.55;
const FIRE_EXIT_GUN_POSE_CONFIDENCE = 0.45;
const GUN_POSE_GRACE_FRAMES = 1;
const TRIGGER_CONFIRMATION_FRAMES = 2;
const TRIGGER_RELEASE_FRAMES = 2;
const TRACKING_RECOVERY_FRAMES = 2;

const createInitialShotIntentState = (): ShotIntentState => ({
  phase: "idle",
  rejectReason: "waiting_for_stable_open",
  triggerState: "open",
  rawTriggerState: "open",
  triggerConfidence: 0,
  gunPoseConfidence: 0,
  pulledFrames: 0,
  openFrames: 0,
  hasSeenStableOpen: false,
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

const resolveTriggerState = (
  evidence: HandEvidence,
  previousState: ShotIntentState
): Pick<
  ShotIntentState,
  "triggerState" | "rawTriggerState" | "triggerConfidence" | "pulledFrames" | "openFrames"
> => {
  const rawTriggerState = evidence.trigger?.rawState ?? previousState.rawTriggerState;
  const triggerConfidence = evidence.trigger?.confidence ?? 0;
  const pulledFrames = rawTriggerState === "pulled" ? previousState.pulledFrames + 1 : 0;
  const openFrames = rawTriggerState === "open" ? previousState.openFrames + 1 : 0;

  let triggerState = previousState.triggerState;

  if (
    previousState.triggerState === "open" &&
    rawTriggerState === "pulled" &&
    pulledFrames >= TRIGGER_CONFIRMATION_FRAMES
  ) {
    triggerState = "pulled";
  } else if (
    previousState.triggerState === "pulled" &&
    rawTriggerState === "open" &&
    openFrames >= TRIGGER_RELEASE_FRAMES
  ) {
    triggerState = "open";
  }

  return {
    triggerState,
    rawTriggerState,
    triggerConfidence,
    pulledFrames,
    openFrames
  };
};

const resolveRejectReason = (phase: ShotIntentPhase): ShotIntentRejectReason => {
  switch (phase) {
    case "idle":
      return "waiting_for_stable_open";
    case "tracking_lost":
      return "tracking_lost";
    case "ready":
      return "waiting_for_fire_entry";
    case "armed":
      return "waiting_for_stable_pulled";
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
  triggerState: "open",
  rawTriggerState: "open",
  triggerConfidence: 0,
  gunPoseConfidence: 0,
  pulledFrames: 0,
  openFrames: 0,
  hasSeenStableOpen: false,
  gunPoseActive: false,
  nonGunPoseFrames: 0,
  trackingPresentFrames: 0
});

const withPoseLossReset = (
  state: ShotIntentState,
  trackingPresentFrames: number,
  nonGunPoseFrames: number,
  triggerConfidence: number,
  gunPoseConfidence: number
): ShotIntentState => ({
  ...state,
  phase: "idle",
  rejectReason: resolveRejectReason("idle"),
  triggerState: "open",
  rawTriggerState: "open",
  triggerConfidence,
  gunPoseConfidence,
  pulledFrames: 0,
  openFrames: 0,
  hasSeenStableOpen: false,
  gunPoseActive: false,
  nonGunPoseFrames,
  trackingPresentFrames
});

type TriggerStateResolution = ReturnType<typeof resolveTriggerState>;
type GunPoseResolution = ReturnType<typeof resolveGunPoseActive>;

const resolveTrackingLostState = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  triggerState: TriggerStateResolution,
  gunPose: GunPoseResolution
): ShotIntentResult => {
  if (trackingPresentFrames < TRACKING_RECOVERY_FRAMES) {
    return {
      state: {
        ...stateBefore,
        phase: "tracking_lost",
        rejectReason: "tracking_lost",
        triggerState: triggerState.triggerState,
        rawTriggerState: triggerState.rawTriggerState,
        triggerConfidence: triggerState.triggerConfidence,
        gunPoseConfidence: gunPose.gunPoseConfidence,
        pulledFrames: triggerState.pulledFrames,
        openFrames: triggerState.openFrames,
        gunPoseActive: gunPose.gunPoseActive,
        nonGunPoseFrames: gunPose.nonGunPoseFrames,
        trackingPresentFrames
      },
      shotFired: false
    };
  }

  return {
    state: {
      ...stateBefore,
      phase: "idle",
      rejectReason: resolveRejectReason("idle"),
      triggerState: triggerState.triggerState,
      rawTriggerState: triggerState.rawTriggerState,
      triggerConfidence: triggerState.triggerConfidence,
      gunPoseConfidence: gunPose.gunPoseConfidence,
      pulledFrames: triggerState.pulledFrames,
      openFrames: triggerState.openFrames,
      hasSeenStableOpen: false,
      gunPoseActive: gunPose.gunPoseActive,
      nonGunPoseFrames: gunPose.nonGunPoseFrames,
      trackingPresentFrames
    },
    shotFired: false
  };
};

const buildTrackedState = (
  stateBefore: ShotIntentState,
  phase: ShotIntentPhase,
  triggerState: TriggerStateResolution,
  gunPose: GunPoseResolution,
  trackingPresentFrames: number
): ShotIntentState => ({
  ...stateBefore,
  phase,
  rejectReason: resolveRejectReason(phase),
  triggerState: triggerState.triggerState,
  rawTriggerState: triggerState.rawTriggerState,
  triggerConfidence: triggerState.triggerConfidence,
  gunPoseConfidence: gunPose.gunPoseConfidence,
  pulledFrames: triggerState.pulledFrames,
  openFrames: triggerState.openFrames,
  hasSeenStableOpen:
    phase === "ready" || phase === "armed" || phase === "recovering" || stateBefore.hasSeenStableOpen,
  gunPoseActive: gunPose.gunPoseActive,
  nonGunPoseFrames: gunPose.nonGunPoseFrames,
  trackingPresentFrames
});

const advanceIdlePhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  triggerState: TriggerStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableOpen = triggerState.triggerState === "open" && triggerState.openFrames >= 2;
  const phase: ShotIntentPhase = trackingAndPoseReady && stableOpen ? "ready" : "idle";
  const nextState = buildTrackedState(stateBefore, phase, triggerState, gunPose, trackingPresentFrames);

  if (phase === "idle") {
    nextState.hasSeenStableOpen = stateBefore.hasSeenStableOpen || (trackingAndPoseReady && stableOpen);
  }

  return {
    state: nextState,
    shotFired: false
  };
};

const advanceReadyPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  triggerState: TriggerStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableOpen = triggerState.triggerState === "open" && triggerState.openFrames >= 2;
  const phase: ShotIntentPhase = trackingAndPoseReady && stableOpen ? "armed" : "ready";

  return {
    state: buildTrackedState(stateBefore, phase, triggerState, gunPose, trackingPresentFrames),
    shotFired: false
  };
};

const advanceArmedPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  triggerState: TriggerStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stablePulled = triggerState.triggerState === "pulled" && triggerState.pulledFrames >= 2;
  const shotFired = trackingAndPoseReady && stablePulled;
  const phase: ShotIntentPhase = shotFired ? "fired" : "armed";

  return {
    state: buildTrackedState(stateBefore, phase, triggerState, gunPose, trackingPresentFrames),
    shotFired
  };
};

const advanceFiredPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  triggerState: TriggerStateResolution,
  gunPose: GunPoseResolution
): ShotIntentResult => ({
  state: buildTrackedState(stateBefore, "recovering", triggerState, gunPose, trackingPresentFrames),
  shotFired: false
});

const advanceRecoveringPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  triggerState: TriggerStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  const trackingAndPoseReady =
    trackingPresentFrames >= TRACKING_RECOVERY_FRAMES && gunPose.gunPoseActive && gunPoseFireReady;
  const stableOpen = triggerState.triggerState === "open" && triggerState.openFrames >= 2;
  const phase: ShotIntentPhase = trackingAndPoseReady && stableOpen ? "ready" : "recovering";

  return {
    state: buildTrackedState(stateBefore, phase, triggerState, gunPose, trackingPresentFrames),
    shotFired: false
  };
};

const advanceTrackedPhase = (
  stateBefore: ShotIntentState,
  trackingPresentFrames: number,
  triggerState: TriggerStateResolution,
  gunPose: GunPoseResolution,
  gunPoseFireReady: boolean
): ShotIntentResult => {
  switch (stateBefore.phase) {
    case "idle":
      return advanceIdlePhase(stateBefore, trackingPresentFrames, triggerState, gunPose, gunPoseFireReady);
    case "ready":
      return advanceReadyPhase(stateBefore, trackingPresentFrames, triggerState, gunPose, gunPoseFireReady);
    case "armed":
      return advanceArmedPhase(stateBefore, trackingPresentFrames, triggerState, gunPose, gunPoseFireReady);
    case "fired":
      return advanceFiredPhase(stateBefore, trackingPresentFrames, triggerState, gunPose);
    case "recovering":
      return advanceRecoveringPhase(
        stateBefore,
        trackingPresentFrames,
        triggerState,
        gunPose,
        gunPoseFireReady
      );
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
      shotFired: false
    };
  }

  const trackingPresentFrames = stateBefore.trackingPresentFrames + 1;
  const triggerState = resolveTriggerState(evidence, stateBefore);
  const gunPose = resolveGunPoseActive(evidence, stateBefore);
  const gunPoseFireReady = (evidence.gunPose?.confidence ?? 0) >= FIRE_ENTRY_GUN_POSE_CONFIDENCE;
  const poseLost = !gunPose.gunPoseActive && gunPose.nonGunPoseFrames > GUN_POSE_GRACE_FRAMES;

  if (poseLost) {
    return {
      state: withPoseLossReset(
        stateBefore,
        trackingPresentFrames,
        gunPose.nonGunPoseFrames,
        triggerState.triggerConfidence,
        gunPose.gunPoseConfidence
      ),
      shotFired: false
    };
  }

  if (stateBefore.phase === "tracking_lost") {
    return resolveTrackingLostState(stateBefore, trackingPresentFrames, triggerState, gunPose);
  }

  return advanceTrackedPhase(stateBefore, trackingPresentFrames, triggerState, gunPose, gunPoseFireReady);
};
