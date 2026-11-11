---
"numinia-engine": minor
---

## 2026-11-10 09:00 · cli · `check` and `replay` commands (M23, first slice) · hecho
- Qué: `npm run check -- <folder>` validates a folder: every .json parses, `numinia-engine/<name>@<n>` manifests name files that exist with the sha256 they state, and every binary asset has an acceptable licence (CC0, CC-BY or propia) from a manifest entry, a LICENCIAS.md or a REUSE.toml annotation; exit 1 and one line per problem. `npm run replay -- <recording.json>` (or `--reference [--ticks N] [--write file]`) replays a recording of inputs and checks the fingerprint (`--expect`, or the file's own), naming the first bad tick. Format `numinia-engine/recording@1`.
- Números: `test/cli-check-replay.test.ts`; `--reference` gives 7e630965, the pinned reference fingerprint; `check activos` passes on the repo.
- Cambio: minor.
- Siguiente: `shot` and `diff-shot` (need a headless browser; M25 uses them).
