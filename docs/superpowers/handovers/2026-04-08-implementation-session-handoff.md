# BalloonShoot Implementation Session Handoff

Date: 2026-04-08

## Purpose

This handoff is for the next Codex session that will start implementation work for the `BalloonShoot` PoC.

The current session completed requirements/design alignment, wrote the formal PoC design, wrote the implementation plan, and ran external review passes on the design docs. No application code has been implemented yet.

## Authoritative Documents

Read these first, in this order:

1. `docs/superpowers/specs/2026-04-08-poc-foundation-design.md`
2. `docs/superpowers/plans/2026-04-08-poc-implementation.md`
3. `docs/notes/2026-04-08-project-memo.md`
4. `AGENTS.md`

## Current Project State

- Repository is still pre-implementation.
- The implementation plan has been written but not executed.
- The PoC is Chrome-first.
- Vanilla TypeScript + Canvas 2D is the chosen PoC stack.
- MediaPipe Hand Landmarker is the chosen tracking stack.
- The game core must stay reusable for a later Phaser migration.

## Fixed PoC Decisions

- Browser target: Chrome is required; other browsers are best-effort only.
- Play session: exactly 1 minute.
- Screen flow: camera permission -> start -> countdown -> play -> result -> retry.
- Camera feed stays visible during PoC play.
- Input model: loose gun pose + thumb-trigger state change.
- `pinch` is not the PoC input contract.
- Score model: normal balloon = 1, small balloon = 3, combo multiplier enabled.
- Misses do not subtract score; they only reset combo.
- Audio included: shot, hit, BGM, time-up, result.
- PoC includes debug UI and tuning controls.
- `AGENTS.md` files must be written in English.
- Every `AGENTS.md` should have a sibling `CLAUDE.md` symlink.

## Implementation Constraints

- Follow fail-fast, YAGNI, DRY, and TDD.
- Avoid unnecessary `try-catch`, fallback-heavy code, `null` spread, and `any`.
- Treat `lint`, `typecheck`, and `test` as blocking checks.
- Keep `app`, `features`, and `shared` boundaries explicit.
- Keep browser-specific code thin.
- Keep gameplay, input mapping, and scoring pure and testable.

## Latest Reviewed Status

Design review was run in separate reviewer agents.

- Initial design review requested changes and those issues were fixed.
- Final review result: no substantive findings.
- The design docs are considered aligned and ready for implementation planning/execution.

## Git State

Latest committed history:

- `fb308a6` `docs: align PoC memo and foundation spec`
- `695565f` `docs: add PoC foundation design`
- `51f231f` `Initialize project docs and Codex remote setup`

Current working tree is not clean. At the time of this handoff, these changes are uncommitted:

- modified: `docs/superpowers/specs/2026-04-08-poc-foundation-design.md`
- untracked directory: `docs/superpowers/plans/`

This is expected. The current session added the implementation plan and a final design-note update that `AGENTS.md` files must be written in English.

## Recommended First Actions in the Next Session

1. Review the uncommitted docs changes.
2. Commit the handoff-related docs before starting code changes.
3. Execute `Task 1` from `docs/superpowers/plans/2026-04-08-poc-implementation.md`.
4. Prefer the subagent-driven execution path if available.

## First Execution Target

Start with `Task 1: Bootstrap the Repo and Enforce Quality Gates`.

That task establishes:

- Vite + TypeScript project bootstrap
- strict TS config
- strict ESLint config
- Prettier config
- Vitest and Playwright setup
- initial smoke verification

Do not skip directly to MediaPipe integration before the quality gates exist.

## Notes for the Next Session

- The implementation plan is intentionally detailed and should be followed task-by-task.
- UI polish is not the first priority; proving the interaction loop is.
- The main technical risk is input stability for small hands, not graphics complexity.
- If implementation starts diverging from the plan, update the plan or spec explicitly instead of silently drifting.
