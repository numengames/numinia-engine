# agent

AI inhabitants (P4). An inhabitant is a **player**: `Cuerpo` (its body) enters through the same protocol as a person
(`ClientSession` over any `Transport`) with an **agent ticket** (`emitirAgente`, signed with `MOTOR_AGENTES_SECRET`, a
secret apart from the guests'); the engine gives it the name its world declares plus « · IA» (AGW-007), and from
then on the server checks its inputs, verbs and rate caps exactly as a person's. `Guion` is escalón E0: walk a route,
greet who comes near, answer only when called, short orders in code, never answer another AI — no LLM. `Mente`
(escalones E2/E4, P5a) plugs a brain into that script: when called by name it asks a language model (`cerebro.ts`:
Claude's Messages API with tools, the key from `CEREBRO_CLAVE`, caps per minute/person/day, an echo brain for tests),
with the rules in the system prompt and what it perceives inside ONE `<material>` block; the model only proposes
tool calls (gesture, walk, follow, and — if the world lets it build — place/move/scale/delete/undo objects) and code
checks each one before the body sends it as a person would. No key, a cap or a failure → the script answers. `main.ts` is
the service `numinia-habitantes`: a process apart from the engine (never in the tick's path) that reads the
adventure's `habitantes/*.json` (`habitante@1`, `formato.ts`) and keeps each inhabitant connected. Design and the
steps after this one (senses and catalog verbs, the brain and its puente, gestures, install): the study's
`DISENO-IAS-MOTOR.md`.

- **Does not:** Run code a model writes, keep the key anywhere but its environment, build when the world says no (api.puede), remember people beyond 5 minutes of conversation in memory.
- **Depends on:** core, schema, ecs, sim, net, feature, client, instance (rule: `tools/layers.json`)
- **Tested by:** `test/agente.test.ts`, `test/cerebro.test.ts`
- **Main API:** `Cuerpo` (`irA`, `seguir`, `parar`, `decir`, `gesto`, `hacer`, `cercanos`, `cosas`, `sentidos`, `alOir`, `paso`), `Guion`, `Mente`, `cerebroClaude`, `cerebroEco`, `Topes`, `validarHabitante`, `leerHabitantes`
