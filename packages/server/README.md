# server

`startServer()`: HTTP `/health` `/metrics` `/metrics.prom` `/sesiones` + `/a/<sha256>.<ext>` (H1, `activos.ts`: the house library `activos/` indexed by sha256 at start, uploads in ACTIVOS_DIR; a year of cache, any origin) + WebSocket on one port; who may build (`construir`: MOTOR_CONSTRUIR=todos, default nobody), tick/runtime/host metrics, measuring bots, load swarm with reports, CPU bench, session log (T1: how each player entered, `sesiones.ts`; reader `npm run sesiones`), the features' saved data (S4, `datos.ts`: snapshot + journal per feature in DATOS_DIR).

- **Does not:** Game logic; it only wires `instance` to the network.
- **Depends on:** core, schema, ecs, sim, net, instance, feature (rule: `tools/layers.json`); `main.ts` is a composition root and imports `features/servidor.ts`
- **Tested by:** `test/server.test.ts`, `test/measure.test.ts`, `test/sesiones.test.ts`, `test/datos.test.ts`, `test/objetos.test.ts`; load: `tools/swarm.sh 1000 30`; how to read the numbers: `docs/MEDIDAS.md`
- **Uploads (H9, `subidas.ts`):** `PUT /a/<sha256>.<ext>` with `Authorization: Bearer <guest token>` (I1) — only for who
  may build (401 no token, 403 no permission), kinds of `ficheros.ts` (415), caps per kind and in total (413, 507; `limits.json`),
  the server's own sha256 and a check of the bytes (422), stored once in `ACTIVOS_DIR` (default `DATOS_DIR/activos`) with who,
  when and the original name in `subidas.jsonl` (never served). `HEAD /a/…` answers like GET without a body; `OPTIONS` for
  CORS. Tested by `test/subidas.test.ts`, `tools/e2e-piernas/subir.mjs`, `tools/deploy-check.mjs`.
- **Main API:** `startServer`, `buildMetrics`, `toPrometheus`, `wsTransport`, `Hist`, `Runtime`, `PUERTAS`
