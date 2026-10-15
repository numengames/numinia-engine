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

function checkState(where: string, e: any) {
  if (e.state === "measured") {
    assert.ok(typeof e.test === "string" && existsSync(e.test), `${where}: measured needs \`test\` pointing at a file that exists (got ${e.test})`);
    if ("date" in e || e.axis) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? "2000-01-01"), `${where}: date must be YYYY-MM-DD`);
  } else {
    assert.equal(e.state, "estimated", `${where}: state must be measured or estimated`);
    assert.ok(typeof e.source === "string" && e.source.length > 0, `${where}: estimated needs \`source\``);
  }
}
