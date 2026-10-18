// M6 h13: trigger zones (entra/sale) and api.overlapSphere, exposed in the plug for every feature (M20 will use
// both). Pure ServerRuntime, headless: no instance/mesh needed, just a fake host with movable positions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ServerRuntime, serverPart, defineFeature } from "../packages/feature/src/index.ts";
import type { ServerApi } from "../packages/feature/src/index.ts";

const sonda = defineFeature({ id: "sonda-zonas", version: 1, describe: "only for this test: captures the zone/overlap api" });

test("zonas: declared cleanly", () => assert.deepEqual(sonda.issues, []));

/** A fake host whose player positions the test moves by hand; `tick()` drives one ServerRuntime.tick(). */
function hostConRuntime() {
  const pos = new Map<number, { x: number; y: number; z: number }>();
  let t = 0;
  let api!: ServerApi;
  const part = serverPart(sonda, (a) => { api = a; });
  const rt = new ServerRuntime([part], {
    players: () => [...pos.keys()],
    position: (e) => pos.get(e) ?? null,
    send: () => {},
    tick: () => t,
    log: () => {},
  });
  return { rt, api: () => api, pos, tick: () => { t++; rt.tick(); } };
}

test("api.overlapSphere: every player within radio (3D), nobody outside it", () => {
  const h = hostConRuntime();
  h.pos.set(0, { x: 0, y: 0, z: 0 });
  h.pos.set(1, { x: 3, y: 0, z: 0 }); // just inside a radius-5 sphere
  h.pos.set(2, { x: 10, y: 0, z: 0 }); // outside
  h.pos.set(3, { x: 0, y: 4, z: 0 }); // vertically close enough (3D distance 4 < 5)
  assert.deepEqual(new Set(h.api().overlapSphere(0, 0, 0, 5)), new Set([0, 1, 3]));
  assert.deepEqual(h.api().overlapSphere(100, 0, 0, 1), [], "nobody there");
});

test("api.zona + onZona: entra when a player steps in, sale when they step out or disconnect", () => {
  const h = hostConRuntime();
  const seen: [number, string, string][] = [];
  h.api().onZona((e, zona, tipo) => seen.push([e, zona, tipo]));
  const zid = h.api().zona({ x: 0, y: 0, z: 0, radio: 5 });
  h.pos.set(0, { x: 100, y: 0, z: 0 }); // far away at first
  h.tick();
  assert.deepEqual(seen, [], "far away: nothing yet");
  h.pos.set(0, { x: 2, y: 0, z: 0 }); // walks in
  h.tick();
  assert.deepEqual(seen, [[0, zid, "entra"]]);
  h.tick(); // stays inside: no repeat
  assert.deepEqual(seen, [[0, zid, "entra"]]);
  h.pos.set(0, { x: 50, y: 0, z: 0 }); // walks out
  h.tick();
  assert.deepEqual(seen, [[0, zid, "entra"], [0, zid, "sale"]]);
  // a second player enters, then disconnects (drops out of players()): that also fires "sale"
  h.pos.set(1, { x: 1, y: 0, z: 0 });
  h.tick();
  assert.deepEqual(seen.at(-1), [1, zid, "entra"]);
  h.pos.delete(1);
  h.tick();
  assert.deepEqual(seen.at(-1), [1, zid, "sale"], "gone from players(): treated as having left the zone");
});

test("api.zonaQuitar: a removed zone stops firing and overlapSphere ignores its own bookkeeping", () => {
  const h = hostConRuntime();
  const seen: string[] = [];
  h.api().onZona((_e, _z, tipo) => seen.push(tipo));
  const zid = h.api().zona({ x: 0, y: 0, z: 0, radio: 5 });
  h.pos.set(0, { x: 0, y: 0, z: 0 });
  h.tick();
  assert.deepEqual(seen, ["entra"]);
  h.api().zonaQuitar(zid);
  h.pos.set(0, { x: 50, y: 0, z: 0 }); // would have fired "sale" had the zone stayed
  h.tick();
  assert.deepEqual(seen, ["entra"], "removed zone: no more events");
});
