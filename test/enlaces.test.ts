// R1 "Falta de R1": tools/enlaces.ts also writes the QR as SVG (qrcode-svg, MIT, 1.1.0 exact; no network at test time).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SECRET = "0123456789abcdef0123";
const run = (args: string[]) => spawnSync(process.execPath, ["tools/enlaces.ts", ...args], { encoding: "utf8", env: { ...process.env, MOTOR_SECRET: SECRET } });

test("enlaces: without 'qr' it only prints id, nombre and the signed URL", () => {
  const r = run(["https://mi-sitio.ejemplo"]);
  assert.equal(r.status, 0, r.stderr);
  const lineas = r.stdout.trim().split("\n");
  assert.equal(lineas.length, 2); // fuente, arbol
  for (const l of lineas) assert.match(l, /^[a-z0-9_-]+\t.+\thttps:\/\/mi-sitio\.ejemplo\/e\/[a-z0-9_-]+\.[0-9a-f]+$/);
});

test("enlaces: 'qr' writes one valid SVG per point and prints its path", () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "enlaces-qr-"));
  const r = run(["qr", "http://localhost:8790", dir]);
  assert.equal(r.status, 0, r.stderr);
  const archivos = readdirSync(dir).sort();
  assert.deepEqual(archivos, ["arbol.svg", "fuente.svg"]);
  for (const nombre of archivos) {
    const svg = readFileSync(join(dir, nombre), "utf8");
    assert.match(svg, /^<\?xml/);
    assert.match(svg, /<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.ok(svg.includes("<rect") && svg.length > 500, "empty or truncated QR");
  }
  assert.match(r.stdout, new RegExp(`fuente\\t.+\\t${dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/fuente\\.svg`));
});

test("enlaces: without MOTOR_SECRET it refuses and says why, in both modes", () => {
  const sinSecreto = (args: string[]) => spawnSync(process.execPath, ["tools/enlaces.ts", ...args], { encoding: "utf8", env: { ...process.env, MOTOR_SECRET: "" } });
  for (const args of [[], ["qr"]]) {
    const r = sinSecreto(args);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /MOTOR_SECRET/);
  }
});
