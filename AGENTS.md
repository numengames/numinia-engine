# AGENTS.md — binding rules for any agent (human or AI) working in this repository

This file is the single source of truth. `CLAUDE.md` and similar files only point here.

## What this is
`numinia-engine` (working name; the real name is chosen by Pablo and Christian): a thin MIT web
3D/XR engine in TypeScript. The engine does not know what Numinia is: it draws, syncs, simulates and
loads data. Game/city logic lives elsewhere (AGPL).

## Principles that outrank any task
1. **AI-native.** This must be the easiest engine in the world for an LLM to understand, navigate and
   use. In the code: a one-page map (`llms.txt`), a short contract README per package, schemas,
   errors that say how to fix them, deterministic replays, small files. In the world: agents join as
   players, perceive the world as structured text and act with simple verbs.
2. **Phones must stay cool.** On mobile, draw only what is needed: frame cap, contained resolution,
   no work when nothing changes, lower quality before the device heats up. Decide by capability,
   never by browser name.
3. **Published limits.** Every limit (per server size, device tier, browser engine, graphics
   backend) lives in `limits.json` + `docs/FICHA-TECNICA.md`, marked `measured` (with the test that
   measures it) or `estimated` (with its source).

## Layers (enforced by `tools/layers.mjs`, rules in `tools/layers.json`)
`core → schema → ecs → sim → net → {client, instance} → {server, cli}`; `render` talks to three.js
only. A package imports only what `layers.json` allows. Adding a package means adding it there first.

## Determinism contract (see `docs/DETERMINISM.md`)
- `sim` decides with integers / Q16.16 fixed point only (`core`). No `Math.sin/cos/exp`, no
  `Math.random`, no `Date`, no iterating `Map`/`Set` to decide anything.
- Randomness comes from the RNG state stored inside the sim state.
- The reference fingerprint `fa94375e` is pinned in a test. Changing it, the wire format or any file
  format is a FORMAT CHANGE: never done unattended (see below).

## Gates (run `npm run gates` before committing anything)
| Gate | Budget | Cost |
|---|---|---|
| unit tests | all green | < 1 s |
| layers | 0 violations | < 0.1 s |
| determinism | same seed → same hash | ~1 s |
| bandwidth K=50 @10 Hz | ≤ 70 kbit/s per client | free (reuses the run) |
| plaza of 1,000, one thread, everyone within 80 m | tick p99 ≤ 25 ms (half the 50 ms tick) | ~1.5 s |

Load test over real WebSockets (not in the default run, ~35 s, own port): `tools/swarm.sh 1000 30`.
Measured 2026-10-14 on the dev PC: 1,000 connected → tick p99 17–23 ms, 25.5 kbit/s per person.
Browser check: `tools/auto.sh e2e` (spare ports 8792/5174, chromium + firefox, ~20 s).
Keep gates light: seconds, one core. Never add a gate that needs a GPU or an LLM to the default run.

## Style
Boring code over clever code. Node ≥ 24 runs the `.ts` files directly (type stripping): use only
erasable TypeScript (no `enum`, no `namespace`, no constructor parameter properties) and import
with the `.ts` extension. Validation returns `Result` with error paths; it never throws.

## Autonomy
Nothing ever leaves this machine without Pablo: never push, never add a remote, never open a PR.
Local work may land on `main` only through `tools/auto.sh finish` (gates green, fast-forward only).
Additive format changes (a new message type, a new optional field at the end, a new file kind) are
allowed and must be written in the diary. Non-additive ones (changing an existing layout, the pinned
fingerprint) go to a branch `propuesta/<ID>` and the task is marked `necesita aprobación`.

## Token budget (Pablo, 2026-10-14: "que no te pulas todos los tokens")
The shift shares Pablo's account. A pre-run governor
(`/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/scripts/motor_presupuesto.py`, ceilings in
`motor_presupuesto.json` next to it) only starts a shift under the weekly and 5-hour ceilings, and tells you
your allowance (default ≤ 2.5 points of the week per shift). Run `hermes usage` at the start, before
each big step and at the end; when the allowance is reached, close the slice you are on and finish.
Spend tokens only on the task: read the files the task needs, not the whole repo; no screenshots
unless the task needs one. Every diary entry carries `Consumo: semana a % → b %`.

## Unattended shift (cron) — the procedure
Work happens in the worktree `../numinia-engine-auto` (branch `auto`), never in the main checkout.
1. `tools/auto.sh start` — takes the lock (prints `BUSY` → stop at once), syncs with `main`, shows
   the last diary entry and the next task. If it prints `SUCIO`, a previous shift was interrupted:
   finish that work if the gates pass, otherwise `git stash push -u -m "turno: <ID> sin terminar"`.
2. Read `docs/BACKLOG.md` (the queue order IS the priority) and take the first row `pendiente | sí`.
   Mark it `en curso` in the same commit as the first real change.
3. Work in small verified steps (`npm test` after each). Budget ~45 minutes per shift. If the task is
   bigger, finish a coherent slice, write what is left in the task's detail, keep it `pendiente`.
4. Commit only with `npm run gates` green; if browser code changed, `tools/auto.sh e2e` too.
5. Update `docs/BACKLOG.md` (state + the numbers you measured) and append a diary entry to
   `docs/RUNLOG.md` (Spanish, for people: Qué, Números, Commit, Siguiente). Commit.
6. `tools/auto.sh finish` — re-runs the gates, fast-forwards `main` if nobody is editing it, restarts
   the plaza if server code changed, releases the lock. Always run it, even after a failed attempt.
If something fails honestly: do not fake a result; stash the attempt, mark the task `bloqueada` with
the reason, write it in the diary, finish.

Shift hygiene: prefix heavy commands with `nice -n 19` (and `taskset -c 2-5` for long ones); no local
LLMs; load tests ≤ 30 s; never touch the user's plaza (ports 8790/5173) except through
`tools/auto.sh finish`; no inline scripts (`node -e`, `python -c`, heredocs) — they wait for a manual
approval nobody can give at night: write a file under `$TMPDIR` and run it; no `sudo`, no system
packages, no destructive git (`reset --hard`, `clean -fdx`, `branch -D`, force anything); new npm
dependencies only with exact versions and a free licence (MIT, Apache-2.0, BSD, ISC, CC0), listed in
the diary. Interactive sessions: `tools/auto.sh lock` before editing `main`, `unlock` after.
