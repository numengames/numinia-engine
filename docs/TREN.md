# The unattended train («el tren»)

How Numinia's engine backlog moves forward without a human launching each task. Operated by the Hermes profile `ursa`; humans only review and merge.

## Flow

1. **Promoter** (cron, no LLM): moves ready cards of the `motor-vr` kanban board and assigns them to `ursa`. Other boards are promoted but left unassigned.
2. **Assigner** (`scripts/tren/tren_asigna.py`, cron every 10 min, no LLM): picks the next card, rewrites its body with the work contract and assigns it. One card at a time (`kanban.max_in_progress: 1`).
3. **Worker** (kanban dispatcher): builds the card on `lote-wip/N` in a fixed worktree, runs `npm test` and `npm run gates`, makes one commit that starts with `MIS-<n> `, pushes, and closes the card with a summary. It never opens PRs and never touches `main`.
4. **Verifier** (inside the assigner, outside the worker): re-runs `npm run gates` on the branch tip. Red gates stop the train and raise an alert; the stop lifts itself when the tip changes and the gates go green.
5. **Lot close**: with enough finished cards the assigner publishes `lote/N`. Attended mode (`work/tren/presencia` = `on`) uses 2 cards per lot and at most 1 lot waiting for a PR; unattended mode uses 5 and 2.
6. **Belt** (`scripts/tren/tren_lotes.py`, cron every 20 min, no LLM): turns `lote/N` into a pull request with reviewers. Only one engine PR is open at a time.
7. **Human**: reviews and merges. Nobody else merges.

## Invariants

- Only a human merges to `main`. The train never force-pushes and never publishes anything outside the repo.
- Decisions about money, personal data, security or house rules become a comment plus `kanban block`, never a guess.
- Own consumption limit: weekly usage below 90 %. The 5-hour window belongs to the provider and is not rationed.
- A card is not done without verifiable evidence (commit hash, gates output).

## Utilities

- `tren_watchdog.py`: silent unless something is stuck (ready cards with nothing running, a lot older than 24 h without a PR, `cron doctor` or `kanban diagnostics` findings).
- `tren_conciliar.py`: read-only; compares ready cards with commits on `main` and the lots, to find cards already done.
- `tren_progreso.py`: counts cards and missions done per board.
- `tren_regulador.py`: pre-run guard (weekly usage) and candidate list.

## Running them

The scripts expect the Hermes profile directory in `TREN_HOME` (default: the parent of the folder they are run from, which is right when they live in the profile's `scripts/`) and the `hermes` CLI with profile `ursa`. They are operations tooling, not engine code: they are not bundled and not covered by `npm test`.

Longer notes: `docs/tren/GUIA-HERMES.md`, `docs/tren/CONFIGURACION-Y-MEJORAS.md`.
