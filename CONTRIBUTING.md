# Contributing to numinia-engine

Thank you for helping. This is a public repository under AGPL-3.0-only; outside contributors are welcome to open
issues and pull requests, and the same review applies to everyone, people and AI agents alike.

## Read first

- [`AGENTS.md`](AGENTS.md): the binding rules (layers, determinism, gates, style). If this file and `AGENTS.md`
  disagree, `AGENTS.md` wins.
- [`llms.txt`](llms.txt): the one-page map of the code.
- [`docs/EXTENDER.md`](docs/EXTENDER.md): how to add a feature (a minigame, a gesture, a door).

## Language

- **Commit messages and pull request titles are written in English.** This is a rule, not a preference: the
  history is public.
- Pull request descriptions should be in English too.
- User-facing text and in-world lore (what players read inside a world, adventures, NPC dialogue) may be in Spanish
  or any other language. Much of the internal documentation under `docs/` is in Spanish; that is fine, but new
  top-level documents (README, SECURITY, CONTRIBUTING) stay in English.

## Proposing a change

1. Branch from `main`.
2. Keep the change small and focused: one pull request, one change.
3. Run `npm ci`, then `npm run gates` (tests, layer rules, determinism, bandwidth, 1,000-person tick). If you
   touched browser code, also run `npm run e2e`.
4. Move the version number in `package.json` and `package-lock.json` as described in
   [`docs/VERSIONES.md`](docs/VERSIONES.md): every pull request moves exactly one of major, minor or patch, and says
   in its body which and why.
5. Add an entry to `docs/RUNLOG.md` (format at the top of that file).
6. Open a pull request with an English title that says what changed, and a body that says why, how you checked it
   and what you did not check.
7. A maintainer reviews and merges. Nobody merges their own pull request.

## Ground rules

- Dependencies: permissive licences only (MIT, Apache-2.0, BSD, ISC, CC0), exact versions. World assets CC0, or
  CC-BY with credit. No GPL, BUSL or Mixamo/VRoid-base material.
- Never commit credentials, keys, tokens or private addresses.
- Numbers come from a run: if you change a limit, update `limits.json` and `docs/FICHA-TECNICA.md` together.
- Changing the pinned fingerprint, the wire format or a file format is a format change; see *Autonomy* in
  `AGENTS.md`.

## Reporting problems

- Bugs and ideas: open an issue.
- Security: do **not** open a public issue; follow [`SECURITY.md`](SECURITY.md).
- Conduct: see [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md).
