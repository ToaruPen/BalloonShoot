# AGENTS.md

## WHY

- `BalloonShoot` is a browser-based game prototype for after-school daycare use.
- The target interaction is finger-aimed balloon shooting using a laptop webcam.
- The current phase is requirements and design. A production-ready implementation does not exist yet.

## WHAT

- `docs/notes/2026-04-08-project-memo.md`: current project memo covering goals, MVP scope, and the proposed technical stack.
- `docs/setup/codex-remote-setup.md`: notes for using this repository with Codex remote/cloud workflows.
- The repository currently contains planning documents only. App source code has not been added yet.

## HOW

- Treat the project memo as the current source of truth until a formal spec is written.
- Prefer lightweight web implementation choices that fit local laptop execution: Web, TypeScript, MediaPipe Hand Landmarker, and Canvas 2D.
- Keep design and implementation aligned with the daycare use case: short play sessions, clear feedback, simple rules, and low setup overhead.
- When adding code later, keep hand tracking, input mapping, game logic, and rendering as separate concerns.

