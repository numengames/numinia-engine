# numinia-engine

**The engine of Numinia's 3D worlds: multiplayer, social, and yours to download, run locally or host anywhere.**

A thin web 3D/XR engine in TypeScript. It draws, syncs, simulates and loads data; it knows nothing about any
particular game. One folder is a whole world, one image is the whole engine, and the same build runs on a
laptop, a small VPS or a fleet container.

> **Status:** version **0.6.x** (see `package.json`), early development (anything may change before 1.0.0). The repository is public;
> `main` moves only through reviewed pull requests. Versioning rules: [`docs/VERSIONES.md`](docs/VERSIONES.md).

## Why it is different

- **AI-native.** A one-page map ([`llms.txt`](llms.txt)), a short contract README per package, schemas, error
  messages that say how to fix them, deterministic replays. AI agents join a world as players, perceive it as
  structured text and act with simple verbs.
- **Server-authoritative and deterministic.** A fixed 20 Hz integer simulation; the server applies inputs and never
  trusts a client's transform; area of interest instead of broadcasting to everyone.
- **Phones stay cool.** Frame cap, contained resolution, no work when nothing changes, quality chosen by device
  capability (never by browser name).
- **Published limits.** Every limit lives in [`limits.json`](limits.json) and
  [`docs/FICHA-TECNICA.md`](docs/FICHA-TECNICA.md), marked *measured* (with the test that measures it) or *estimated*
  (with its source).
- **Accessible by construction.** A feature that does not declare how to reach each verb without a gesture, and
  what each event announces, refuses to load.

## Quickstart

Requires Node.js 24 or newer (it runs the `.ts` files directly).

```bash
git clone https://github.com/numengames/numinia-engine.git
cd numinia-engine
npm ci
npm run server   # authoritative instance on ws://127.0.0.1:8790, 20 Hz
npm run dev      # the plaza page on http://127.0.0.1:5173 (add ?webgl2 to force WebGL2)
```

Other commands:

```bash
npm test         # unit tests
npm run gates    # tests + layers + determinism + bandwidth + 1,000-person tick + page size
npm run tamano   # what the page downloads before drawing, gzip, against the D2 cap
npm run dev:lan  # the page over https on your home network, for phones and headsets
npm run bots -- --n 8   # headless players over real WebSockets
npm run e2e      # real browser tabs against the running server
```

To host a world on a server, see [`deploy/README.md`](deploy/README.md): a published release ships one installer
(`instalar-motor.sh`) with a checksum; the world is downloadable as a zip from the running server.

## What is in the box

| Area | What you get |
|---|---|
| Multiplayer | Authoritative server, client prediction, interpolation, area of interest, 1,000 players on one thread in the gates |
| Avatars and social | VRM avatars, names and speech bubbles, nearby text chat and proximity voice, gestures, a *people* list, teleport to someone who is online |
| Building | Place, move, turn, pin and undo objects; holes that fit a picture into a frame; digital goods you can wear |
| Quests | Adventures as plain JSON: quests, NPCs, things, scenes; a game director who sets scenes, narrates and summons |
| Mini-games | Fishing (the server runs the whole cycle), darts (also in AR on your real wall), dice rolled by the server |
| Environment | Sky, light, fog, stylised water in one draw call, fire, smoke, dust, quality tiers per device |
| XR | VR and AR sessions, hands and controllers, snap turning; test on a real headset before calling XR done |
| Roles and AI | Roles from numinia.com's organisation model, outside AI agents by public key (MCP bridge), AI inhabitants with a script or a brain |
| Operations | `/health`, `/status`, `/metrics`, session log, world zip export/import, container image |

Details and recipes for adding your own feature: [`docs/EXTENDER.md`](docs/EXTENDER.md).

## Layout

```
core -> schema -> ecs -> sim -> net -> feature -> {client, instance} -> agent -> server ; instance -> cli
render talks to three.js only; game features live in features/<id>/
```

| Package | Is |
|---|---|
| `core` | fixed point, seeded RNG, state hash, `Result` |
| `schema` | one description per component/message: defaults, validation with paths, bits per field |
| `ecs` | entities and columns (one `Int32Array` per field), ascending-id queries |
| `sim` | deterministic 20 Hz step, snapshot, fingerprint, replay |
| `net` | bit packing, quantised snapshots, area of interest, transports |
| `feature` | the plug for game features, with accessibility built in |
| `client`, `render` | prediction and interpolation; the only package that talks to three.js |
| `instance`, `server`, `cli` | authoritative loop; HTTP, WebSocket and world files; command line |
| `agent` | AI inhabitants that enter as players |

The layer rules are enforced by `npm run layers` (`tools/layers.json`).

## Documentation

- [`llms.txt`](llms.txt): the one-page map (read this first, human or AI)
- [`AGENTS.md`](AGENTS.md): binding rules for anyone changing the repository
- [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- [`docs/FICHA-TECNICA.md`](docs/FICHA-TECNICA.md): what it can carry, measured or estimated
- [`docs/JUGADOR.md`](docs/JUGADOR.md): what a player expects, and where each piece lives
- [`docs/DETERMINISM.md`](docs/DETERMINISM.md), [`docs/MEDIDAS.md`](docs/MEDIDAS.md), [`docs/BACKLOG.md`](docs/BACKLOG.md)

Much of the documentation is written in Spanish, the project's working language for in-repo notes. Commit messages
and pull request titles are in English.

## Licence

[AGPL-3.0-only](LICENSE). Dependencies stay permissive (MIT, Apache-2.0, BSD, ISC); bundled world assets are CC0
or CC-BY with credit.

*"numinia-engine" is a working name.*
