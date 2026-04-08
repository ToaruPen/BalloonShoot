export interface DebugValues {
  smoothingAlpha: number;
  triggerPullThreshold: number;
  triggerReleaseThreshold: number;
}

export interface DebugInputElement {
  /** `data-debug` attribute from the HTML, exposed as `dataset.debug` by the DOM. */
  dataset: { debug?: string };
  value: string;
  addEventListener(type: "input", listener: () => void): void;
}

export interface DebugPanel {
  readonly values: DebugValues;
  render(): string;
  bind(inputs: Iterable<DebugInputElement>): void;
}

interface DebugControlMeta {
  label: string;
  min: number;
  max: number;
  step: number;
}

const DEBUG_KEYS = [
  "smoothingAlpha",
  "triggerPullThreshold",
  "triggerReleaseThreshold"
] as const satisfies readonly (keyof DebugValues)[];

const DEBUG_KEY_SET: ReadonlySet<string> = new Set(DEBUG_KEYS);

const DEBUG_META: Record<keyof DebugValues, DebugControlMeta> = {
  smoothingAlpha: { label: "Smoothing", min: 0.1, max: 0.6, step: 0.01 },
  triggerPullThreshold: { label: "Pull", min: 0.2, max: 0.8, step: 0.01 },
  triggerReleaseThreshold: { label: "Release", min: 0.1, max: 0.6, step: 0.01 }
};

const isDebugKey = (key: string | undefined): key is keyof DebugValues =>
  key !== undefined && DEBUG_KEY_SET.has(key);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const clampToMeta = (key: keyof DebugValues, value: number): number => {
  const meta = DEBUG_META[key];
  const safeValue = Number.isFinite(value) ? value : meta.min;
  return clamp(safeValue, meta.min, meta.max);
};

export const createDebugPanel = (initial: DebugValues): DebugPanel => {
  const values: DebugValues = {
    smoothingAlpha: clampToMeta("smoothingAlpha", initial.smoothingAlpha),
    triggerPullThreshold: clampToMeta("triggerPullThreshold", initial.triggerPullThreshold),
    triggerReleaseThreshold: clampToMeta("triggerReleaseThreshold", initial.triggerReleaseThreshold)
  };

  const renderRow = (key: keyof DebugValues): string => {
    const meta = DEBUG_META[key];
    return `<label class="debug-panel-row">${meta.label}<input data-debug="${key}" type="range" min="${String(meta.min)}" max="${String(meta.max)}" step="${String(meta.step)}" value="${String(values[key])}" /></label>`;
  };

  const render = (): string => {
    const rows = DEBUG_KEYS.map(renderRow).join("");
    return `<aside class="debug-panel" aria-label="debug controls">${rows}</aside>`;
  };

  const bind = (inputs: Iterable<DebugInputElement>): void => {
    for (const input of inputs) {
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
      });
    }
  };

  return { values, render, bind };
};
