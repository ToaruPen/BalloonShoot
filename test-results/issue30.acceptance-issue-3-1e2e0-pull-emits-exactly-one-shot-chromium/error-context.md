# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: issue30.acceptance.spec.ts >> issue-30 acceptance >> intentional pull emits exactly one shot
- Location: tests/e2e/issue30.acceptance.spec.ts:223:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Array [
    "idle",
    "ready",
    "armed",
    "armed",
-   "fired",
+   "armed",
    "tracking_lost",
  ]

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic:
    - generic:
      - generic "score hud" [ref=e7]:
        - generic [ref=e8]: "Score: 0"
        - generic [ref=e9]: "Combo: 0"
        - generic [ref=e10]: x1
      - generic [ref=e11]:
        - paragraph [ref=e12]: プレイ中
        - paragraph [ref=e13]: 手で銃の形を作って風船を撃とう！
  - complementary "debug controls" [ref=e15]:
    - generic [ref=e16]:
      - text: Smoothing
      - slider "Smoothing" [ref=e17]: "0.28"
    - generic [ref=e18]:
      - text: Extended
      - slider "Extended" [ref=e19]: "1.15"
    - generic [ref=e20]:
      - text: Curled
      - slider "Curled" [ref=e21]: "0.65"
    - generic [ref=e22]:
      - text: zAssist (display only)
      - slider "zAssist (display only)" [ref=e23]: "0"
    - generic [ref=e24]:
      - generic [ref=e25]: Phase
      - status [ref=e26]: tracking_lost
    - generic [ref=e27]:
      - generic [ref=e28]: Reject
      - status [ref=e29]: tracking_lost
    - generic [ref=e30]:
      - generic [ref=e31]: Curl
      - status [ref=e32]: "partial (raw: partial)"
    - generic [ref=e33]:
      - generic [ref=e34]: Ratio
      - status [ref=e35]: "0.45"
    - generic [ref=e36]:
      - generic [ref=e37]: Ratio (min/med/max)
      - status [ref=e38]: min=0.45 med=0.45 max=0.45
    - generic [ref=e39]:
      - generic [ref=e40]: zDelta
      - status [ref=e41]: "0.00"
    - generic [ref=e42]:
      - generic [ref=e43]: Pose
      - status [ref=e44]: "0.00"
    - generic [ref=e45]:
      - generic [ref=e46]: Counts
      - status [ref=e47]: extended=0 curled=0 track=0 pose=0
```

# Test source

```ts
  113 |       });
  114 | 
  115 |       const pushTelemetrySnapshot = () => {
  116 |         snapshotScheduled = false;
  117 |         const snapshot = readTelemetrySnapshot();
  118 |         const previous = telemetryTimeline.at(-1);
  119 | 
  120 |         if (!previous || JSON.stringify(previous) !== JSON.stringify(snapshot)) {
  121 |           telemetryTimeline.push(snapshot);
  122 |         }
  123 |       };
  124 | 
  125 |       const scheduleTelemetrySnapshot = () => {
  126 |         if (snapshotScheduled) {
  127 |           return;
  128 |         }
  129 | 
  130 |         snapshotScheduled = true;
  131 |         queueMicrotask(pushTelemetrySnapshot);
  132 |       };
  133 | 
  134 |       window.__balloonShootTestHooks = {
  135 |         createHandTracker: () =>
  136 |           Promise.resolve({
  137 |             detect: () => {
  138 |               if (detectCount >= frames.length) {
  139 |                 return Promise.resolve(undefined);
  140 |               }
  141 | 
  142 |               const nextFrame = frames[detectCount];
  143 |               detectCount += 1;
  144 |               return Promise.resolve(nextFrame ?? undefined);
  145 |             }
  146 |           }),
  147 |         getDetectCount: () => detectCount,
  148 |         advanceCountdown: (ticks: number) => {
  149 |           for (let index = 0; index < ticks; index += 1) {
  150 |             for (const callback of Array.from(intervalCallbacks.values())) {
  151 |               callback();
  152 |             }
  153 |           }
  154 |         },
  155 |         attachTelemetryObserver: () => {
  156 |           if (telemetryObserver) {
  157 |             return;
  158 |           }
  159 | 
  160 |           scheduleTelemetrySnapshot();
  161 |           telemetryObserver = new MutationObserver(scheduleTelemetrySnapshot);
  162 |           telemetryObserver.observe(document.body, {
  163 |             childList: true,
  164 |             subtree: true,
  165 |             characterData: true
  166 |           });
  167 |         },
  168 |         getTelemetryTimeline: () => telemetryTimeline.map((entry) => ({ ...entry }))
  169 |       };
  170 |     },
  171 |     { scriptedFrames: createFrameSequence(frames) }
  172 |   );
  173 | 
  174 |   await page.goto("/");
  175 |   await expect(page.locator('[data-debug-output="phase"]')).toHaveText("--");
  176 |   await expect(page.locator('[data-debug-output="rejectReason"]')).toHaveText("--");
  177 |   await expect(page.locator('[data-debug-output="gunPose"]')).toHaveText("--");
  178 |   await expect(page.locator('[data-debug-output="counters"]')).toHaveText(
  179 |     "extended=0 curled=0 track=0 pose=0"
  180 |   );
  181 | 
  182 |   await page.evaluate(() => {
  183 |     window.__balloonShootTestHooks?.attachTelemetryObserver();
  184 |   });
  185 | 
  186 |   await page.getByRole("button", { name: "カメラを準備" }).click();
  187 |   await expect(page.getByRole("button", { name: "スタート" })).toBeVisible();
  188 |   await page.getByRole("button", { name: "スタート" }).click();
  189 | 
  190 |   await page.evaluate(() => {
  191 |     window.__balloonShootTestHooks?.advanceCountdown(3);
  192 |   });
  193 | }
  194 | 
  195 | const readFrameSnapshots = async (
  196 |   page: Page,
  197 |   expectedPhases: readonly string[]
  198 | ): Promise<TelemetrySnapshot[]> => {
  199 |   const timeline = await page.evaluate<TelemetrySnapshot[]>(() =>
  200 |     window.__balloonShootTestHooks?.getTelemetryTimeline() ?? []
  201 |   );
  202 |   const meaningfulTimeline = timeline.filter((snapshot) => snapshot.phase !== "--");
  203 | 
  204 |   return meaningfulTimeline.slice(0, expectedPhases.length);
  205 | };
  206 | 
  207 | const waitForFrameSequence = async (
  208 |   page: Page,
  209 |   expectedPhases: readonly string[]
  210 | ): Promise<TelemetrySnapshot[]> => {
  211 |   let snapshots: TelemetrySnapshot[] = [];
  212 | 
> 213 |   await expect.poll(async () => {
      |   ^ Error: expect(received).toEqual(expected) // deep equality
  214 |     snapshots = await readFrameSnapshots(page, expectedPhases);
  215 | 
  216 |     return snapshots.map((snapshot) => snapshot.phase);
  217 |   }).toEqual(expectedPhases);
  218 | 
  219 |   return snapshots;
  220 | };
  221 | 
  222 | test.describe("issue-30 acceptance", () => {
  223 |   test("intentional pull emits exactly one shot", async ({ page }) => {
  224 |     const base = createBaseFrame();
  225 |     const frames = [
  226 |       withIndexCurlState(base, "extended"),
  227 |       withIndexCurlState(base, "extended"),
  228 |       withIndexCurlState(base, "extended"),
  229 |       withIndexCurlState(base, "curled"),
  230 |       withIndexCurlState(base, "curled")
  231 |     ];
  232 |     const expectedPhases = ["idle", "ready", "armed", "armed", "fired", "tracking_lost"];
  233 | 
  234 |     await bootHarness(page, frames);
  235 |     const snapshots = await waitForFrameSequence(page, expectedPhases);
  236 | 
  237 |     expect(snapshots.map((snapshot) => snapshot.phase)).toEqual(expectedPhases);
  238 |     expect(snapshots).toContainEqual(
  239 |       expect.objectContaining({
  240 |         phase: "fired",
  241 |         rejectReason: "waiting_for_release"
  242 |       })
  243 |     );
  244 |     expect(snapshots.filter((snapshot) => snapshot.phase === "fired")).toHaveLength(1);
  245 |   });
  246 | 
  247 |   test("held pull does not auto-repeat", async ({ page }) => {
  248 |     const base = createBaseFrame();
  249 |     const frames = [
  250 |       withIndexCurlState(base, "extended"),
  251 |       withIndexCurlState(base, "extended"),
  252 |       withIndexCurlState(base, "extended"),
  253 |       withIndexCurlState(base, "curled"),
  254 |       withIndexCurlState(base, "curled"),
  255 |       withIndexCurlState(base, "curled"),
  256 |       withIndexCurlState(base, "curled")
  257 |     ];
  258 |     const expectedPhases = [
  259 |       "idle",
  260 |       "ready",
  261 |       "armed",
  262 |       "armed",
  263 |       "fired",
  264 |       "recovering",
  265 |       "recovering",
  266 |       "tracking_lost"
  267 |     ];
  268 | 
  269 |     await bootHarness(page, frames);
  270 |     const snapshots = await waitForFrameSequence(page, expectedPhases);
  271 | 
  272 |     expect(snapshots.map((snapshot) => snapshot.phase)).toEqual(expectedPhases);
  273 |     expect(snapshots.filter((snapshot) => snapshot.phase === "fired")).toHaveLength(1);
  274 |     expect(snapshots.at(-1)?.rejectReason).toBe("tracking_lost");
  275 |   });
  276 | 
  277 |   test("brief thumb jitter does not fire", async ({ page }) => {
  278 |     const base = createBaseFrame();
  279 |     const frames = [
  280 |       withIndexCurlState(base, "extended"),
  281 |       withIndexCurlState(base, "extended"),
  282 |       withIndexCurlState(base, "extended"),
  283 |       withIndexCurlState(base, "curled"),
  284 |       withIndexCurlState(base, "extended"),
  285 |       withIndexCurlState(base, "extended")
  286 |     ];
  287 |     const expectedPhases = ["idle", "ready", "armed", "armed", "armed", "armed"];
  288 | 
  289 |     await bootHarness(page, frames);
  290 |     const meaningfulSnapshots = await waitForFrameSequence(page, expectedPhases);
  291 | 
  292 |     expect(meaningfulSnapshots.map((snapshot) => snapshot.phase)).toEqual([
  293 |       "idle",
  294 |       "ready",
  295 |       "armed",
  296 |       "armed",
  297 |       "armed",
  298 |       "armed"
  299 |     ]);
  300 |     expect(meaningfulSnapshots.filter((snapshot) => snapshot.phase === "fired")).toHaveLength(0);
  301 |     expect(meaningfulSnapshots.at(-1)?.rejectReason).toBe("waiting_for_stable_curled");
  302 |   });
  303 | 
  304 |   test("tracking loss plus reacquisition does not ghost-fire", async ({ page }) => {
  305 |     const base = createBaseFrame();
  306 |     const frames = [
  307 |       withIndexCurlState(base, "extended"),
  308 |       withIndexCurlState(base, "extended"),
  309 |       undefined,
  310 |       undefined,
  311 |       withIndexCurlState(base, "extended"),
  312 |       withIndexCurlState(base, "extended")
  313 |     ];
```