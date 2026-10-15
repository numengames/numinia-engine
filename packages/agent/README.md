# agent

AI inhabitants (P4). An inhabitant is a **player**: `Cuerpo` (its body) enters through the same protocol as a person
(`ClientSession` over any `Transport`) with an **agent ticket** (`emitirAgente`, signed with `MOTOR_AGENTES_SECRET`, a
secret apart from the guests'); the engine gives it the name its world declares plus « · IA» (AGW-007), and from
then on the server checks its inputs, verbs and rate caps exactly as a person's. `Guion` is escalón E0: walk a route,
greet who comes near, answer only when called, short orders in code, never answer another AI — no LLM. `main.ts` is
the service `numinia-habitantes`: a process apart from the engine (never in the tick's path) that reads the
adventure's `habitantes/*.json` (`habitante@1`, `formato.ts`) and keeps each inhabitant connected. Design and the
steps after this one (senses and catalog verbs, the brain and its puente, gestures, install): the study's
`DISENO-IAS-MOTOR.md`.

- **Does not:** Call any language model (P5), hold any provider key, build (H3 roles first), remember people.
- **Depends on:** core, schema, ecs, sim, net, feature, client, instance (rule: `tools/layers.json`)
- **Tested by:** `test/agente.test.ts`
- **Main API:** `Cuerpo` (`irA`, `seguir`, `parar`, `decir`, `gesto`, `hacer`, `cercanos`, `cosas`, `sentidos`, `alOir`, `paso`), `Guion`, `validarHabitante`, `leerHabitantes`
