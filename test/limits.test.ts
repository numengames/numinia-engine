import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const lim = JSON.parse(readFileSync("limits.json", "utf8"));

test("limits.json: schema, version and every entry well formed", () => {
  assert.equal(lim.schema, "numinia-engine/limits@1");
  assert.equal(typeof lim.version, "number");
  const seen = new Set<string>();
  for (const [i, e] of lim.limits.entries()) {
    const where = `limits[${i}] (${e.axis}/${e.scope}/${e.key})`;
    assert.ok(e.axis in lim.axes, `${where}: axis must be one of ${Object.keys(lim.axes).join(", ")}`);
    assert.ok(lim.axes[e.axis].includes(e.scope), `${where}: scope must be one of ${lim.axes[e.axis].join(", ")}`);
    assert.ok(e.value !== undefined && typeof e.unit === "string", `${where}: needs value and unit`);
    const id = `${e.axis}/${e.scope}/${e.key}`;
    assert.ok(!seen.has(id), `${where}: duplicated`);
    seen.add(id);
    checkState(where, e);
  }
  for (const [i, f] of lim.features.entries()) {
    assert.ok(["base", "mejorado", "frontera"].includes(f.level), `features[${i}]: bad level`);
    checkState(`features[${i}] (${f.id})`, f);
  }
});

test("limits.json: every device tier has the same keys", () => {
  const keys = (tier: string) => lim.limits.filter((e: any) => e.axis === "device" && e.scope === tier).map((e: any) => e.key).sort().join();
  for (const t of Object.keys(lim.devices)) assert.equal(keys(t), keys("A"), `tier ${t} differs from A`);
});

test("limits.json: a setting is not a measurement, and provenance is well formed", () => {
  // B6: tick_rate and snapshot_rate are constants in the code; nothing measures them, so they cannot say «measured».
  for (const key of ["tick_rate", "snapshot_rate"]) {
    const e = lim.limits.find((x: any) => x.key === key);
    assert.equal(e?.state, "config", `${key}: it is a setting of the code, state must be config`);
  }
  for (const [i, e] of lim.limits.entries()) {
    const where = `limits[${i}] (${e.key})`;
    if ("commit" in e) assert.match(e.commit, /^[0-9a-f]{7,40}$/, `${where}: commit must be a git hash`);
    if ("command" in e) assert.ok(typeof e.command === "string" && e.command.length > 0, `${where}: command must say what was run`);
    if ("machine" in e) assert.ok(typeof e.machine === "string" && e.machine.length > 0, `${where}: machine must say where it ran`);
  }
});

function checkState(where: string, e: any) {
  if (e.state === "measured") {
    assert.ok(typeof e.test === "string" && existsSync(e.test), `${where}: measured needs \`test\` pointing at a file that exists (got ${e.test})`);
    if ("date" in e || e.axis) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? "2000-01-01"), `${where}: date must be YYYY-MM-DD`);
  } else if (e.state === "config") {
    // a constant the code sets: `source` starts with the file that sets it, and that file must exist
    const file = typeof e.source === "string" ? e.source.split(" ")[0] : "";
    assert.ok(file && existsSync(file), `${where}: config needs \`source\` starting with the file that sets it (got ${e.source})`);
  } else {
    assert.equal(e.state, "estimated", `${where}: state must be measured, config or estimated`);
    assert.ok(typeof e.source === "string" && e.source.length > 0, `${where}: estimated needs \`source\``);
  }
}
