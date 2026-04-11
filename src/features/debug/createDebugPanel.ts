export interface DebugValues {
  smoothingAlpha: number;
  extendedThreshold: number;
  curledThreshold: number;
  zAssistWeight: number;
  // Passthrough — not user-tunable via slider. Stored on the panel values so
  // the object can be handed directly to `mapHandToGameInput` as `InputTuning`
  // without a per-frame merge.
  curlHysteresisGap: number;
}

type DebugSliderKey =
  | "smoothingAlpha"
  | "extendedThreshold"
  | "curledThreshold"
  | "zAssistWeight";

export interface DebugInputElement {
  /** `data-debug` attribute from the HTML, exposed as `dataset.debug` by the DOM. */
  dataset: { debug?: string };
  value: string;
  addEventListener(type: "input", listener: () => void): void;
}

export interface DebugOutputElement {
  dataset: { debugOutput?: string };
  textContent: string | null;
}

export interface DebugTelemetry {
  phase: string;
  rejectReason: string;
  curlState: string;
  rawCurlState: string;
  curlConfidence: number;
  gunPoseConfidence: number;
  ratio: number;
  zDelta: number;
  extendedFrames: number;
  curledFrames: number;
  trackingPresentFrames: number;
  nonGunPoseFrames: number;
}

interface DebugPanel {
  readonly values: DebugValues;
  render(): string;
  bind(
    inputs: Iterable<DebugInputElement>,
    outputs?: Iterable<DebugOutputElement>
  ): void;
  setTelemetry(telemetry: DebugTelemetry | undefined): void;
}

interface DebugControlMeta {
  label: string;
  min: number;
  max: number;
  step: number;
}

const HYSTERESIS_GAP = 0.05;
const RATIO_HISTORY_LENGTH = 30;

const DEBUG_KEYS = [
  "smoothingAlpha",
  "extendedThreshold",
  "curledThreshold",
  "zAssistWeight"
] as const satisfies readonly DebugSliderKey[];

const DEBUG_KEY_SET: ReadonlySet<string> = new Set(DEBUG_KEYS);

const DEBUG_META: Record<DebugSliderKey, DebugControlMeta> = {
  smoothingAlpha: { label: "Smoothing", min: 0.1, max: 0.6, step: 0.01 },
  extendedThreshold: { label: "Extended", min: 0.9, max: 1.6, step: 0.01 },
  curledThreshold: { label: "Curled", min: 0.4, max: 0.9, step: 0.01 },
  zAssistWeight: {
    label: "zAssist (display only)",
    min: 0,
    max: 0.1,
    step: 0.005
  }
};

type DebugOutputKey =
  | "phase"
  | "rejectReason"
  | "curlState"
  | "ratio"
  | "ratioStats"
  | "zDelta"
  | "gunPose"
  | "counters";

const DEBUG_OUTPUT_META: Record<DebugOutputKey, string> = {
  phase: "Phase",
  rejectReason: "Reject",
  curlState: "Curl",
  ratio: "Ratio",
  ratioStats: "Ratio (min/med/max)",
  zDelta: "zDelta",
  gunPose: "Pose",
  counters: "Counts"
};

const DEBUG_OUTPUT_KEYS = Object.keys(DEBUG_OUTPUT_META) as DebugOutputKey[];

interface RatioStats {
  min: number | undefined;
  median: number | undefined;
  max: number | undefined;
}

const isDebugKey = (key: string | undefined): key is DebugSliderKey =>
  key !== undefined && DEBUG_KEY_SET.has(key);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampToMeta = (key: DebugSliderKey, value: number): number => {
  const meta = DEBUG_META[key];
  const safeValue = Number.isFinite(value) ? value : meta.min;
  return clamp(safeValue, meta.min, meta.max);
};

const countDecimals = (value: number): number => {
  const [, decimals = ""] = String(value).split(".");
  return decimals.length;
};

const formatForInput = (key: DebugSliderKey, value: number): string =>
  String(Number(value.toFixed(countDecimals(DEBUG_META[key].step))));

const formatRatio = (value: number | undefined): string =>
  Number.isFinite(value) ? Number(value).toFixed(2) : "--";

const computeRatioStats = (history: number[]): RatioStats => {
  if (history.length === 0) {
    return { min: undefined, median: undefined, max: undefined };
  }

  const sorted = [...history].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: sorted[Math.floor(sorted.length / 2)]
  };
};

const formatTelemetryOutput = (
  key: DebugOutputKey,
  telemetry: DebugTelemetry | undefined,
  stats: RatioStats
): string => {
  if (!telemetry) {
    if (key === "counters") {
      return "extended=0 curled=0 track=0 pose=0";
    }
    if (key === "ratioStats") {
      return "min=-- med=-- max=--";
    }
    return "--";
  }

  switch (key) {
    case "phase":
      return telemetry.phase;
    case "rejectReason":
      return telemetry.rejectReason;
    case "curlState":
      return `${telemetry.curlState} (raw: ${telemetry.rawCurlState})`;
    case "ratio":
      return formatRatio(telemetry.ratio);
    case "ratioStats":
      return `min=${formatRatio(stats.min)} med=${formatRatio(stats.median)} max=${formatRatio(stats.max)}`;
    case "zDelta":
      return formatRatio(telemetry.zDelta);
    case "gunPose":
      return formatRatio(telemetry.gunPoseConfidence);
    case "counters":
      return `extended=${String(telemetry.extendedFrames)} curled=${String(telemetry.curledFrames)} track=${String(telemetry.trackingPresentFrames)} pose=${String(telemetry.nonGunPoseFrames)}`;
  }
};

const isDebugOutputKey = (key: string | undefined): key is DebugOutputKey =>
  key !== undefined && DEBUG_OUTPUT_KEYS.includes(key as DebugOutputKey);

const normalizeCurlThresholds = (
  extendedThreshold: number,
  curledThreshold: number
): Pick<DebugValues, "extendedThreshold" | "curledThreshold"> => {
  const normalizedExtended = clampToMeta("extendedThreshold", extendedThreshold);
  const normalizedCurled = clampToMeta("curledThreshold", curledThreshold);

  return {
    extendedThreshold: Math.max(
      normalizedExtended,
      normalizedCurled + HYSTERESIS_GAP
    ),
    curledThreshold: normalizedCurled
  };
};

const normalizeInitialCurlThresholds = (
  extendedThreshold: number,
  curledThreshold: number
): Pick<DebugValues, "extendedThreshold" | "curledThreshold"> => {
  const normalized = normalizeCurlThresholds(extendedThreshold, curledThreshold);

  if (
    Number.isFinite(extendedThreshold) &&
    Number.isFinite(curledThreshold) &&
    extendedThreshold <= curledThreshold + HYSTERESIS_GAP
  ) {
    return {
      ...normalized,
      extendedThreshold: Math.max(
        normalized.extendedThreshold,
        clampToMeta("extendedThreshold", curledThreshold + HYSTERESIS_GAP)
      )
    };
  }

  return normalized;
};

export const createDebugPanel = (initial: DebugValues): DebugPanel => {
  const values: DebugValues = {
    smoothingAlpha: clampToMeta("smoothingAlpha", initial.smoothingAlpha),
    zAssistWeight: clampToMeta("zAssistWeight", initial.zAssistWeight),
    curlHysteresisGap: initial.curlHysteresisGap,
    ...normalizeInitialCurlThresholds(
      initial.extendedThreshold,
      initial.curledThreshold
    )
  };
  const boundInputs: Partial<Record<DebugSliderKey, DebugInputElement>> = {};
  const boundOutputs: Partial<Record<DebugOutputKey, DebugOutputElement>> = {};
  const ratioHistory: number[] = [];
  let telemetry: DebugTelemetry | undefined;
  let stats = computeRatioStats(ratioHistory);

  const renderRow = (key: DebugSliderKey): string => {
    const meta = DEBUG_META[key];
    return `<label class="debug-panel-row">${meta.label}<input data-debug="${key}" type="range" min="${String(meta.min)}" max="${String(meta.max)}" step="${String(meta.step)}" value="${formatForInput(key, values[key])}" /></label>`;
  };

  const render = (): string => {
    const rows = DEBUG_KEYS.map(renderRow).join("");
    const telemetryRows = DEBUG_OUTPUT_KEYS.map(
      (key) =>
        `<div class="debug-panel-row"><span>${DEBUG_OUTPUT_META[key]}</span><output data-debug-output="${key}">${formatTelemetryOutput(key, telemetry, stats)}</output></div>`
    ).join("");
    return `<aside class="debug-panel" aria-label="debug controls">${rows}${telemetryRows}</aside>`;
  };

  const syncInputValue = (key: DebugSliderKey): void => {
    const input = boundInputs[key];

    if (!input) {
      return;
    }

    input.value = formatForInput(key, values[key]);
  };

  const normalizeAndSyncThresholds = (): void => {
    const normalized = normalizeCurlThresholds(
      values.extendedThreshold,
      values.curledThreshold
    );
    values.extendedThreshold = normalized.extendedThreshold;
    values.curledThreshold = normalized.curledThreshold;
    syncInputValue("extendedThreshold");
    syncInputValue("curledThreshold");
  };

  const syncTelemetryOutput = (key: DebugOutputKey): void => {
    const output = boundOutputs[key];

    if (!output) {
      return;
    }

    const nextText = formatTelemetryOutput(key, telemetry, stats);
    if (output.textContent !== nextText) {
      output.textContent = nextText;
    }
  };

  const setTelemetry = (nextTelemetry: DebugTelemetry | undefined): void => {
    telemetry = nextTelemetry;

    if (nextTelemetry && Number.isFinite(nextTelemetry.ratio)) {
      ratioHistory.push(nextTelemetry.ratio);
      if (ratioHistory.length > RATIO_HISTORY_LENGTH) {
        ratioHistory.shift();
      }
      stats = computeRatioStats(ratioHistory);
    }

    for (const key of DEBUG_OUTPUT_KEYS) {
      syncTelemetryOutput(key);
    }
  };

  const bind = (
    inputs: Iterable<DebugInputElement>,
    outputs: Iterable<DebugOutputElement> = []
  ): void => {
    for (const input of inputs) {
      const boundKey = input.dataset.debug;

      if (isDebugKey(boundKey)) {
        boundInputs[boundKey] = input;
      }

      input.addEventListener("input", () => {
        const key = input.dataset.debug;

        if (!isDebugKey(key)) {
          return;
        }

        const parsed = Number(input.value);

        if (!Number.isFinite(parsed)) {
          return;
        }

        values[key] = clampToMeta(key, parsed);
        syncInputValue(key);

        if (key === "extendedThreshold" || key === "curledThreshold") {
          normalizeAndSyncThresholds();
        }
      });
    }

    for (const output of outputs) {
      const key = output.dataset.debugOutput;

      if (!isDebugOutputKey(key)) {
        continue;
      }

      boundOutputs[key] = output;
      syncTelemetryOutput(key);
    }
  };

  return { values, render, bind, setTelemetry };
};
