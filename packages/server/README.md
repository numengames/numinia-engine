# server

`startServer()`: HTTP `/health` `/metrics` + WebSocket on one port, tick metrics, load swarm.

- **Does not:** Game logic; it only wires `instance` to the network.
- **Depends on:** core, schema, ecs, sim, net, instance (rule: `tools/layers.json`)
- **Tested by:** `test/server.test.ts`; load: `tools/swarm.sh 1000 30`
- **Main API:** `startServer`, `buildMetrics`, `wsTransport`
