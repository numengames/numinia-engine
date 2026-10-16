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
- **Tested by:** `test/agente.test.ts`, `test/cerebro.test.ts`, `test/puerta.test.ts`, `test/mcp-mundo.test.ts`
- **Main API:** `Cuerpo` (`irA`, `seguir`, `parar`, `decir`, `gesto`, `hacer`, `cercanos`, `cosas`, `sentidos`, `alOir`, `paso`), `Guion`, `Mente`, `Obra` (the build verbs, shared), `cerebroClaude`, `cerebroEco`, `Topes`, `validarHabitante`, `leerHabitantes`; outside agents: `llave.ts` (`nuevaPareja`, `firmarBillete`, `clavePublica`), `mcp.ts` (`ServidorMcp`), `mcp-mundo.ts` (`PuenteMundo`)

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

4. **Talk to Hermes** («entra en el mundo y pon una mesa delante de mí»). Its tools: `mirar` (where it is, people and
   things within 40 m with their ids, whether it may build, the models it may place), `decir` {texto, canal cerca|zona},
   `ir_a` {x, z} | {persona}, `colocar` {modelo, x, z, y?, giro?, escala?|escala_x/_y/_z, nombre?}, `mover` {id, …}
   (what it does not say stays), `borrar` {id}, `deshacer`, `oir` {desde} (the last 50 lines heard, by cursor, to follow
   a conversation by polling). People's text comes back only inside `<material fiable="no">`. Limits: 40 m from its
   body, 12 changes per 10 s; the server checks everything again. Logs go to stderr; stdout is only the protocol.

Try it without Hermes: pipe JSON-RPC lines into the bridge, e.g.
`printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"mirar"}}' | MUNDO_URL=… AGENTE_ID=… AGENTE_CLAVE=… node tools/mcp-mundo.ts`
(it leaves when stdin ends: keep stdin open, e.g. `(printf …; sleep 5) | …`).

**Not yet:** the tools served by the world itself (MCP over HTTPS from the engine, M26 next), the «doorbell» that wakes an
on-demand agent (`presencia` is stored but only informative), the installer passing `--dominio` as `MOTOR_DOMINIO`, and
visitors talking to Hermes as a chat channel.
