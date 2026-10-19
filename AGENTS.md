# AGENTS.md — binding rules for any agent (human or AI) working in this repository

This file is the single source of truth. `CLAUDE.md` and similar files only point here.

## What this is
`numinia-engine` (working name; the real name is chosen by Pablo and Christian): a thin web
3D/XR engine in TypeScript, licensed AGPL-3.0-only (Pablo, 2026-10-15). The engine does not know what
Numinia is: it draws, syncs, simulates and loads data. Game/city logic lives elsewhere (AGPL too).

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

## What we already know (read before designing a row)
`docs/SABER.md` distils the whole project (studies, measurements, Pablo's decisions, the lessons of the AI
agent built for Hyperfy) with a pointer to each source in `../mmo-browser-study/`. Five of its rules bind
every task:
1. **Every feature declares its accessible path** (enforced by `defineFeature` since V1: it refuses to load
   otherwise): a `spoken` name for each verb, an `announce` (text + sound) or `"silent"` for each event, and a
   `state.card` for anything put in the world. Every verb is also reachable without a gesture (key, HTML
   button, agent). The same card is what agents read. Recipe: `docs/EXTENDER.md`.
2. **Untrusted text never enters an agent's instructions**: links, place cards, people's and objects' names
   go in one fenced `<material>` block, rebuilt each turn (numinia.org STD-050). Policy lives in code; the
   LLM only phrases. A public agent never runs code and never holds admin keys.
3. **Licences are checked before anything enters**: dependencies MIT/Apache-2.0/BSD/ISC/CC0, world assets
   and animations CC0 (or CC-BY with credit); never Mixamo, VRoid bases, Redis ≥ 8, BUSL or GPL code. The
   trap register is in `docs/SABER.md` §3.3.
4. **Never broadcast to everyone and never trust a client's transform** (Hyperfy's two ceilings): area of
   interest and server-applied inputs, always.
5. **Numbers come from a run, not from memory**: judge the tick by p99 and tick response, load tests open
   loop, server numbers only with steal < 2 %. A new measurement that changes `docs/SABER.md` §2 or
   `limits.json` updates both in the same commit.

## Layers (enforced by `tools/layers.mjs`, rules in `tools/layers.json`)
`core → schema → ecs → sim → net → feature → {client, instance} → {server, cli}`; `render` talks to three.js
only. A package imports only what `layers.json` allows. Adding a package means adding it there first.
Game features live in `features/<id>/` and import only `core`, `schema` and `feature`; packages never
import `features/` except the composition roots listed in `layers.json` (`_composition`). Recipe:
`docs/EXTENDER.md`. A feature never touches the simulation or the fingerprint.

## Determinism contract (see `docs/DETERMINISM.md`)
- `sim` decides with integers / Q16.16 fixed point only (`core`). No `Math.sin/cos/exp`, no
  `Math.random`, no `Date`, no iterating `Map`/`Set` to decide anything.
- Randomness comes from the RNG state stored inside the sim state.
- The reference fingerprint is pinned in a test (`7e630965` since J3, sim/wire format 3; it was `93b192c8`, format 2, J2; before that `fa94375e`). Changing it, the
  wire format or any file format is a FORMAT CHANGE: see Autonomy for when and how it is allowed.

## Gates (run `npm run gates` before committing anything)
| Gate | Budget | Cost |
|---|---|---|
| unit tests | all green | < 1 s |
| layers | 0 violations | < 0.1 s |
| determinism | same seed → same hash | ~1 s |
| bandwidth K=50 @10 Hz | ≤ 70 kbit/s per client | free (reuses the run) |
| plaza of 1,000, one thread, everyone within 80 m | tick p99 ≤ 25 ms (half the 50 ms tick) | ~1.5 s |
| page size before first draw (D2) | ≤ 1 MB gz (Pablo 19-10; was 480 kB; goal 300; `tools/tamano.mjs`) | ~1 s (vite build) |

Load test over real WebSockets (not in the default run, ~35 s, own port): `tools/swarm.sh 1000 30`. Capacity battery for a real server (stairs, soak, join storm, CPU bench, report): `docs/MEDIDAS.md`.
Measured 2026-10-14 on the dev PC: 1,000 connected → tick p99 17–23 ms, 25.5 kbit/s per person; with jump and run
(J2, 2026-10-15): p99 19.3 ms, 27.2 kbit/s per person.
Browser check: `tools/auto.sh e2e` (spare ports 8792/5174, chromium + firefox, ~20 s).
Keep gates light: seconds, one core. Never add a gate that needs a GPU or an LLM to the default run.

## A world is one folder; the engine is one image (motor en la flota, `../motor-flota/SPEC.md` C1–C7)
- Everything a world is lives in its folder (MOTOR_MUNDO: `datos/`, `aventura/`, `entorno/`, `sesiones/`,
  `mundo.json`); the same folder runs in the fleet's container (`/mundo`), a bare install (`/var/lib/numinia-motor`),
  `arrancar.sh` and `tools/plaza.sh` (`.run`). A new kind of world data goes inside it and into the zip (`mundo-zip.ts`
  PARTES + its rules), never beside it.
- Keys come from the environment (MOTOR_SECRET|JWT_SECRET, MOTOR_ADMIN|ADMIN_CODE) or `claves.env`; never into a zip,
  a log line or a test fixture that looks real. The log says WHERE the code is, never what it is.
- The image is built from the installer only (`Dockerfile`, `.dockerignore`): what the bare install runs, the image
  runs. `deploy-check` and `test/flota.test.ts` guard both.

## Language of the public record
Commit messages and pull request titles (and descriptions) are written in **English**, always; the history of this
public repository is read by outsiders. The diary `docs/RUNLOG.md`, the internal docs and user-facing in-world text
(adventures, dialogue, lore) may stay in Spanish. Never put Spanish in a commit subject or a PR title, not even in
unattended night shifts.

## Style
Boring code over clever code. Node ≥ 24 runs the `.ts` files directly (type stripping): use only
erasable TypeScript (no `enum`, no `namespace`, no constructor parameter properties) and import
with the `.ts` extension. Validation returns `Result` with error paths; it never throws.

## Autonomy
The repository is public: `origin` = github.com/numengames/numinia-engine (Pablo, 2026-10-15). `main` there
only moves through a pull request Pablo approves. Only Pablo's interactive sessions push, and only with his
explicit ok; the unattended shift never pushes, never opens a PR and never touches `origin`.
Local work may land on `main` only through `tools/auto.sh finish` (gates green, fast-forward only).
Additive format changes (a new message type, a new optional field at the end, a new file kind) are
allowed and must be written in the diary. Non-additive ones (changing an existing layout, the pinned
fingerprint) are ALSO allowed while the engine has no external users (Pablo, 2026-10-14: "que no
pare el desarrollo"): bump the format version, pin the new fingerprint in the test, and explain the
change in the diary. The day the engine has outside users, this paragraph goes back to approval.

## Token budget (Pablo, 2026-10-14: "que no te pulas todos los tokens")
The shift shares Pablo's account. A pre-run governor
(`/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/scripts/motor_presupuesto.py`, ceilings in
`motor_presupuesto.json` next to it) only starts a shift under the weekly and 5-hour ceilings, and tells you
your allowance (default ≤ 2.5 points of the week per shift). Run `hermes usage` at the start, before
each big step and at the end; when the allowance is reached, close the slice you are on and finish.
Spend tokens only on the task: read the files the task needs, not the whole repo; no screenshots
unless the task needs one. Every diary entry carries `Consumo: semana a % → b %` and the model.

## When a task is too hard
Shifts run on Sonnet 5.5 to stretch the budget. If the diary already shows a failed attempt at this
task and you fail again (gates red, or no coherent slice to commit), do not spend a third shift on
it: mark it `bloqueada: para Opus` in docs/BACKLOG.md, write in its detail what you tried and what
is missing, and take the next row. Pablo's daytime session (Opus) picks those up.
Rows in state `para Opus` are heavy-reasoning tasks Pablo reserved for his Opus session (15-10): never
take them, not even when nothing else is left. Rows `espera a <ID>` wait until that row is `hecho`.

## Unattended shift (cron) — the procedure
Work happens in the worktree `../numinia-engine-auto` (branch `auto`), never in the main checkout.
1. `tools/auto.sh start` — takes the lock (prints `BUSY` → stop at once), syncs with `main`, shows
   the last diary entry and the next task. If it prints `SUCIO`, a previous shift was interrupted:
   finish that work if the gates pass, otherwise `git stash push -u -m "turno: <ID> sin terminar"`.
2. Read `docs/BACKLOG.md` (the queue order IS the priority) and take the first row `pendiente | sí`.
   Mark it `en curso` in the same commit as the first real change.
3. Work in small verified steps (`npm test` after each). Budget ~45 minutes per shift. If the task is
   bigger, finish a coherent slice, write what is left in the task's detail, keep it `pendiente`.
   The state cell must say exactly `pendiente` (`tools/auto.sh` greps it): «trozo 1 hecho» goes in the task
   text or its detail, never in the state cell — otherwise no shift ever picks the row again.
4. Commit only with `npm run gates` green; if browser code changed, `tools/auto.sh e2e` too.
5. Update `docs/BACKLOG.md` (state + the numbers you measured). When a row becomes `hecho`, flip to
   `pendiente` every row `espera a …` whose awaited rows are now all `hecho` — nobody else does it, and a
   row left waiting is never picked. Append a diary entry to
   `docs/RUNLOG.md` (Spanish, for people: Qué, Números, Commit, Siguiente). Commit. The heading time
   comes from `date -u '+%Y-%m-%d %H:%M'` (UTC, Pablo's rule for every written time), never estimated.
6. `tools/auto.sh finish` — re-runs the gates, fast-forwards `main` if nobody is editing it, restarts
   the plaza if server code changed, releases the lock. Always run it, even after a failed attempt.
If something fails honestly: do not fake a result; stash the attempt, mark the task `bloqueada` with
the reason, write it in the diary, finish.

Shift hygiene: prefix heavy commands with `nice -n 19` (and `taskset -c 2-5` for long ones); no local
LLMs; load tests ≤ 30 s; never touch the user's plaza (ports 8790/5173) except through
`tools/auto.sh finish`; no inline scripts (`node -e`, `python -c`, heredocs) — they wait for a manual
approval nobody can give at night: write a file under `$TMPDIR` and run it; `rm -rf` asks for approval too: extract or build into a new folder instead of deleting one; no `sudo`, no system
packages, no destructive git (`reset --hard`, `clean -fdx`, `branch -D`, force anything); new npm
dependencies only with exact versions and a free licence (MIT, Apache-2.0, BSD, ISC, CC0), listed in
the diary. Interactive sessions: `tools/auto.sh lock` before editing `main`, `unlock` after.
