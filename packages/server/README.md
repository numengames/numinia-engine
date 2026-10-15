# server

`startServer()`: HTTP `/health` `/metrics` `/metrics.prom` `/sesiones` + WebSocket on one port, tick/runtime/host metrics, measuring bots, load swarm with reports, CPU bench, session log (T1: how each player entered, `sesiones.ts`; reader `npm run sesiones`).

- **Does not:** Game logic; it only wires `instance` to the network.
- **Depends on:** core, schema, ecs, sim, net, instance, feature (rule: `tools/layers.json`); `main.ts` is a composition root and imports `features/servidor.ts`
- **Tested by:** `test/server.test.ts`, `test/measure.test.ts`, `test/sesiones.test.ts`; load: `tools/swarm.sh 1000 30`; how to read the numbers: `docs/MEDIDAS.md`
- **Main API:** `startServer`, `buildMetrics`, `toPrometheus`, `wsTransport`, `Hist`, `Runtime`, `PUERTAS`
