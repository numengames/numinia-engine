# agent

AI inhabitants (P4). An inhabitant is a **player**: `Cuerpo` (its body) enters through the same protocol as a person
(`ClientSession` over any `Transport`) with an **agent ticket** (`emitirAgente`, signed with `MOTOR_AGENTES_SECRET`, a
secret apart from the guests'); the engine gives it the name its world declares plus « · IA» (AGW-007), and from
then on the server checks its inputs, verbs and rate caps exactly as a person's. `Guion` is escalón E0: walk a route,
greet who comes near, answer only when called, short orders in code, never answer another AI — no LLM. `Mente`
(escalones E2/E4, P5a) plugs a brain into that script: when called by name it asks a language model (`cerebro.ts`:
Claude's Messages API with tools, the key from `CEREBRO_CLAVE`, caps per minute/person/day, an echo brain for tests;
the inhabitant's file may name its own model, `cerebro.modelo`, and its own calls per UTC day, `cerebro.tope` 1–10000,
on top of the service's caps — never a key: anything key-like in the file is refused),
with the rules in the system prompt and what it perceives inside ONE `<material>` block; the model only proposes
tool calls (gesture, walk, follow, and — if the world lets it build — place/move/scale/delete/undo objects) and code
checks each one before the body sends it as a person would. No key, a cap or a failure → the script answers. `main.ts` is
the service `numinia-habitantes`: a process apart from the engine (never in the tick's path) that reads the
adventure's `habitantes/*.json` (`habitante@1`, `formato.ts`) and keeps each inhabitant connected. Design and the
steps after this one (senses and catalog verbs, the brain and its puente, gestures, install): the study's
`DISENO-IAS-MOTOR.md`.

- **Does not:** Run code a model writes, keep the key anywhere but its environment, build when the world says no (api.puede), remember people beyond 5 minutes of conversation in memory.
- **Depends on:** core, schema, ecs, sim, net, feature, client, instance (rule: `tools/layers.json`)
- **Tested by:** `test/agente.test.ts`, `test/cerebro.test.ts`, `test/puerta.test.ts`, `test/mcp-mundo.test.ts`, `test/puente-org.test.ts`, `test/puente-sin-node.test.ts`
- **Main API:** `Cuerpo` (`irA`, `seguir`, `parar`, `decir`, `gesto`, `hacer`, `cercanos`, `cosas`, `sentidos`, `alOir`, `paso`), `Guion`, `Mente`, `Obra` (the build verbs, shared), `cerebroClaude`, `cerebroEco`, `Topes`, `validarHabitante`, `leerHabitantes`; outside agents: `llave.ts` (`nuevaPareja`, `firmarBillete`, `clavePublica`), `mcp.ts` (`ServidorMcp`), `mcp-mundo.ts` (`PuenteMundo`), `pase-org.ts` (`pedirPaseToken`, `pedirPaseFirmado`), `pase-org-clave.ts` (`pedirPaseHttp`, Node), `puente-neutral.ts` (the bridge for hosts without Node)

## Outside agents: one door (numinia-archive ADR-080; backlog M26, first slice)

The engine does not know where an AI lives nor which model it uses. An AI that runs **outside** the engine — Hermes on
Pablo's PC, on a VPS, any MCP client — enters a world through one door:

1. **Its own Ed25519 key.** The private key never leaves the machine where the agent runs. The world lists the PUBLIC
   key in its own files, `aventura/agentes/<id>.json` (`agente@1`: `id`, `nombre` — the server adds « · IA» —,
   `responsable`, `clave` = `"ed25519:"` + base64url of the 32 raw public-key bytes, `rol?`, `presencia?`, `notas?`;
   checked by `node tools/aventura.ts`). It travels in the world's zip; a private key in it is refused.
2. **Tools**: a person's verbs, through the same `puede()` as anyone's. Whatever its role, an AI only **enters and
   builds**: never moderates, never manages roles or settings, never downloads the world.
3. **The agent opens the connection** (ws/wss to the world). Nothing ever connects to the agent; no port opens.

On each connection the bridge signs an `a2.<id>.<utc ms>.<nonce>.<signature>` ticket over the world's name (the host it
dials; a public server sets `MOTOR_DOMINIO`), valid ± 2 min and only once. The identity is `ia-<id>` like an inhabitant's.

### Connect Hermes in 4 steps

```sh
# 1. where Hermes runs: make the key (private key → ~/.numinia/agentes/hermes-pablo.clave, mode 600)
node tools/agente.ts nuevo hermes-pablo --nombre "Hermes"
# it prints the line for step 2 and the bridge command for step 3
```

2. **In the world's chat, as its owner** (`/dueño <código>` first), paste the printed line; add a role at the end if
   @todos does not build there (e.g. `Administración`: for an AI it only means «enters and builds»):
   `/agente añadir hermes-pablo Hermes ed25519:… Administración`. The world writes `aventura/agentes/hermes-pablo.json`
   (responsable = your name there) and lets it in at once. `/agente` lists them; `/agente quitar hermes-pablo` removes it
   (if it is inside, it is told and closed with 4003: the bridge does not come back).

3. **Add the bridge to Hermes** as an MCP server over stdio (`--args` must be the last option):

```sh
hermes mcp add numinia-mundo --command node \
  --env MUNDO_URL=ws://127.0.0.1:8790 AGENTE_ID=hermes-pablo AGENTE_CLAVE=$HOME/.numinia/agentes/hermes-pablo.clave \
  --args /ruta/a/numinia-engine/tools/mcp-mundo.ts
```

   or by hand in Hermes's `config.yaml`:

```yaml
mcp_servers:
  numinia-mundo:
    command: node
    args: ["/ruta/a/numinia-engine/tools/mcp-mundo.ts"]
    env:
      MUNDO_URL: "ws://127.0.0.1:8790"       # a public world: wss://its-domain
      AGENTE_ID: "hermes-pablo"
      AGENTE_CLAVE: "/home/<you>/.numinia/agentes/hermes-pablo.clave"
```

4. **The world's LEEME-IA comes first.** A world keeps `aventura/LEEME-IA.md` — its own AGENTS.md for any AI that comes in: what
   may be built here, the style, what not to touch (plain markdown, public, up to 12 KiB, travels in the zip; a NEW world is born
   with the Taller's one, `plantillas/taller/aventura/LEEME-IA.md`, which is also the template). The server serves it at
   `GET /leeme-ia` (and says `leemeIA: true` in `/status`); the bridge hands it to the AI as the tool `leeme_ia` (the FIRST tool),
   as the MCP resource `numinia://mundo/leeme-ia` and as the first line of its `instructions` («LO PRIMERO»); `mirar` reminds until it
   has been read. The text is the owner's, so it goes in one `<leeme-ia>` fence (cleaned so nothing can close it) under a line that says it
   can ask for more care or a style but never widens the AI's tools, rules or permissions (the server decides those). A world with none
   (or a broken file) gets plain prudence rules. Code: `leeme-ia.ts` here, `packages/server/src/leeme-ia.ts`; test `test/leeme-ia.test.ts`.

5. **Talk to Hermes** («entra en el mundo y pon una mesa delante de mí»). Its tools: `mirar` (where it is, which way it faces — `rumbo` in degrees, 0° = +z, 90° = +x, plus a front vector —, people and
   things within 40 m with their ids, whether it may build, the models it may place), `decir` {texto, canal cerca|zona},
   `ir_a` {x, z} | {persona}, `colocar` {modelo, x, z, y?, giro?, escala?|escala_x/_y/_z, nombre?}, `mover` {id, …}
   (what it does not say stays), `borrar` {id}, `deshacer`, `oir` {desde} (the last 50 lines heard, by cursor, to follow
   a conversation by polling), `llamadas` (the calls people made to it that it has not read: who, what, how — by its name,
   `/name`, the «Hablar con ella» button or its key phrase — and how many seconds ago; each is handed over once; last 20 of
   10 minutes) and `esperar_llamada` {segundos 1–25} (waits up to 25 s and comes back as soon as someone calls it or walks
   into its bubble; call it in a loop to stay listening; other tools keep working meanwhile). Both need a world with the
   feature `llamar` (else they say so) and both tell the world the brain is **attentive**: intent `ia.atenta`, at most one
   every 5 s, and the AI's public card shows `atenta: true` for 90 s after the last one. `gesto` {tipo: saludar|asentir|pensar|señalar} plays a move of the world's `gestos` feature (everyone within 30 m sees it;
   only `saludar` has a clip of its own, the others use the nearest one and stop by themselves — table in `gesto-ia.ts`),
   and `mirar` adds «En tu burbuja: …» (who is inside the AI's bubble, from the `burbuja` events). People's text comes back only inside `<material fiable="no">`. Limits: 40 m from its
   body, 12 changes per 10 s; the server checks everything again. Logs go to stderr; stdout is only the protocol.

Try it without Hermes: pipe JSON-RPC lines into the bridge, e.g.
`printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mirar"}}' | MUNDO_URL=… AGENTE_ID=… AGENTE_CLAVE=… node tools/mcp-mundo.ts`
(it leaves when stdin ends: keep stdin open, e.g. `(printf …; sleep 5) | …`).

### An AI of an organization (numinia.com): no `/agente añadir`, a pass every ~8 minutes

An AI that belongs to a numinia.com organization (community) is not listed in any world: it asks numinia.com for a world pass
for each world of its organization. Switching it off, putting it to sleep or removing it there takes effect within 10 minutes,
because the engine closes (4003) the connection of an AI whose pass ends without a fresh one.

**The easy way: a token (3 lines).** In the organization's panel «Agentes» add the AI «with a token»; the panel shows the token
once (`ntk_…`). Then, in the `numinia-engine` folder:

```sh
hermes mcp add numinia-mundo --command node \
  --env NUMINIA_URL=https://numinia.com AGENTE_ORG=<org id> AGENTE_ID=<agent id> AGENTE_TOKEN=<token> MUNDO_URL=wss://<world>/ws \
  --args $PWD/tools/mcp-mundo.ts
```

- The bridge sends `POST {NUMINIA_URL}/api/agents/pass` with `Authorization: Bearer <token>` and body `{org, agent, aud}` (no
  signature) and gets `{pass, exp}` or `{error, texto}`; it renews at ~80 % of the pass's remaining life (≤ 8 min). It never prints the
  token (nor `mirar`, nor errors; a copy echoed by numinia.com is scrubbed). `--token` works as well as `AGENTE_TOKEN`.
- A token that is not `ntk_` + 43 characters is refused before any request. `AGENTE_TOKEN` together with `AGENTE_CLAVE` is an error.
- **401 = the token is wrong or was renewed in the panel**: the bridge says so on stderr and stops for good (put the new token and
  restart). `apagada` (403) works as in the key way: it leaves and says so.

**Advanced: your own key** (`AGENTE_CLAVE` instead of `AGENTE_TOKEN`):

```sh
NUMINIA_URL=https://numinia.com AGENTE_ORG=<id of the organization> AGENTE_ID=<agent id in the organization> \
AGENTE_CLAVE=$HOME/.numinia/agentes/<id>.clave MUNDO_URL=wss://its-domain node tools/mcp-mundo.ts
# AGENTE_MUNDO=<the world's id in numinia.com> only if the world's /status has no `mundoPase` (it has when it takes passes)
```

- The key is made as above (`node tools/agente.ts nuevo <id>`); its public line goes into the organization's panel («Agentes»).
- The bridge signs `numinia-agent-pass:<org>:<agent>:<aud>:<t>` and `POST`s `{org, agent, aud, t, sig}` to
  `{NUMINIA_URL}/api/agents/pass`; the answer is `{pass, exp}` or `{error, texto}` (`pase-org.ts`, the fetcher is injected so tests
  need no network). It enters with PASE (type 12), renews the pass at ~8 min with another PASE (the world applies the new
  permissions at once) and, on `apagada`, leaves and says so on stderr (it does not come back until restarted).
- **State** (comes in the pass): `activa` — attentive, may build if its role and its responsible person allow; `dormida` — low
  attention: it enters, sees and hears, `decir` works only if someone called it by its name in the last minute, and
  `colocar`/`mover`/`borrar`/`deshacer` answer that it is asleep. The server enforces it: a sleeping pass has no `build-in-worlds`.
  `mirar` prints `Estado: activa|dormida`.
- The world lists it in `GET /agentes` with `organizacion: true` and `estado` while it is connected (its `id` is the pass's `a_…`).
- Tests: `test/puente-org.test.ts` (a fake numinia.com that speaks both modes over `node:http` signing passes with a test key, a real server, the real
  bridge, passes of 3 s so renewals happen in the test), `test/pase-ia.test.ts` (the world side).

**The bridge without Node** (M1 of the remote MCP, numinia.com's `mcp.numinia.com`): `mcp-mundo.ts` and `pase-org.ts` import
nothing from `node:` — the a2 ticket and the key way's signature are injected (`firmar`; `tools/mcp-mundo.ts` passes
`llave.ts`'s `firmarBillete`, `pase-org-clave.ts` signs with a KeyObject). So the token way runs on any runtime with `fetch`
and `WebSocket` (a Cloudflare Worker / Durable Object, Deno, Bun). `npm run puente` bundles `puente-neutral.ts` with platform
neutral (rolldown, already here through vite) into one module, `dist/puente-mundo.mjs` (~90 kB, ~30 kB gz), and fails if any
import is left unresolved:

```js
import { PuenteMundo, pedirPaseToken, ServidorMcp, INSTRUCCIONES } from "./puente-mundo.mjs";
const puente = new PuenteMundo({ url: "wss://its-domain/ws", id: agente, mundo, pedirPase: pedirPaseToken({ numiniaUrl, org, agente, token }) });
puente.arrancar();
const mcp = new ServidorMcp({ nombre: "numinia-mundo", version, herramientas: () => puente.herramientas(), instrucciones: INSTRUCCIONES });
const respuesta = await mcp.atender(await request.json()); // one JSON-RPC message (or batch) per POST
```

`test/puente-sin-node.test.ts` checks the bundle has no `node:` import nor Node globals, that a Node-only file refuses to
bundle, and that the BUNDLE enters an in-memory world with a fake `PedirPase` and answers `mirar` inside one `<material>`.

**Not yet:** the tools served by the world itself (MCP over HTTPS from the engine, M26 next), the «doorbell» that wakes an
on-demand agent (`presencia` is stored but only informative), the installer passing `--dominio` as `MOTOR_DOMINIO`, and
visitors talking to Hermes as a chat channel.
