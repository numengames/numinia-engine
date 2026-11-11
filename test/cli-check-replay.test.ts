import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFolder } from "../packages/cli/src/check.ts";
import { replayFile, toFile } from "../packages/cli/src/replay.ts";
import { referenceRecording } from "../packages/sim/src/index.ts";

const tmp = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "cli-check-"));

test("check: the repo's own manifests and assets pass", () => {
  const r = checkFolder("activos/avatares");
  assert.deepEqual(r.issues, []);
  assert.deepEqual(checkFolder("activos").issues, []); // own-work assets are licensed by REUSE.toml
  assert.ok(r.manifests >= 1 && r.assets >= 3);
});

test("check: names bad JSON, missing file, wrong sha256, missing licence and unlicensed assets", () => {
  const d = tmp();
  mkdirSync(join(d, "a"));
  writeFileSync(join(d, "a", "x.glb"), "abc");
  writeFileSync(join(d, "a", "ok.glb"), "ok");
  writeFileSync(join(d, "broken.json"), "{nope");
  writeFileSync(join(d, "m.json"), JSON.stringify({ schema: "numinia-engine/demo@1", items: [
    { fichero: "a/ok.glb", sha256: createHash("sha256").update("ok").digest("hex"), licencia: "CC0" },
    { fichero: "a/x.glb", sha256: "00", licencia: "GPL" },
    { fichero: "a/gone.glb", licencia: "CC0" },
  ] }));
  const msgs = checkFolder(d, "/").issues.map((i) => i.message).join("\n");
  assert.match(msgs, /invalid JSON/);
  assert.match(msgs, /a\/gone\.glb: file not found/);
  assert.match(msgs, /a\/x\.glb: sha256 does not match/);
  assert.match(msgs, /a\/x\.glb: licence "GPL"/);
  assert.doesNotMatch(msgs, /ok\.glb/);
  writeFileSync(join(d, "a", "LICENCIAS.md"), "CC0");
  const after = checkFolder(d, "/").issues.map((i) => i.message).join("\n");
  assert.doesNotMatch(after, /no licence/);
});

test("check: an asset with no licence anywhere is reported; a licence file next to it fixes it", () => {
  const d = tmp();
  writeFileSync(join(d, "s.opus"), "x");
  assert.match(checkFolder(d, d).issues[0].message, /no licence/);
  writeFileSync(join(d, "LICENCIAS.md"), "CC0");
  assert.deepEqual(checkFolder(d, d).issues, []);
});

test("replay: a recording reproduces its own fingerprint, and a changed input names the first bad tick", () => {
  const f = JSON.parse(JSON.stringify(toFile(referenceRecording(5, 30, 4))));
  const ok = replayFile(f);
  assert.equal(ok.ok, true); assert.equal(ok.ticks, 30); assert.equal(ok.firstBadTick, null);
  assert.equal(replayFile({ ...f, fingerprint: undefined, hashes: undefined }, ok.fingerprint).ok, true);
  assert.equal(replayFile({ ...f, fingerprint: undefined, hashes: undefined }, "00000000").ok, false);
  f.ticks[12][1] = f.ticks[12][1] === 100 ? -100 : 100; // tamper
  const bad = replayFile(f);
  assert.equal(bad.ok, false);
  assert.ok(bad.firstBadTick !== null && bad.firstBadTick >= 12);
});

test("replay: rejects a file that is not a recording", () => {
  assert.throws(() => replayFile({ schema: "x" } as never), /schema must be/);
});
