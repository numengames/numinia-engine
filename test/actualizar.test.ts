// deploy/actualizar.sh: the server updates itself from GitHub's latest release (--auto-actualizar). Run against a fake
// GitHub (a local HTTP server) and a fake installer, in a temporary prefix: never root, never the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = new URL("../deploy/actualizar.sh", import.meta.url).pathname;
const instalador = (build: string, falla = false) => `#!/usr/bin/env bash
if [ "\${1:-}" = --version ]; then echo "numinia-engine ${build} 2026-10-16 · Node 24.22.0"; exit 0; fi
${falla ? "exit 3" : `echo "${build} 2026-10-16" > "$NUMINIA_PREFIX/VERSION"; echo "${build}" >> "$NUMINIA_PREFIX/instalaciones"`}
`;

type Gh = { tag?: string; inst?: string; sumas?: string; digest?: string | null; conectados?: number; publicada?: string; latest?: number };
async function escenario(gh: Gh, args: string[] = [], antes: (prefix: string) => void = () => {}) {
  const prefix = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "actualizar-"));
  writeFileSync(join(prefix, "VERSION"), "aaaaaaa 2026-10-15\n");
  writeFileSync(join(prefix, "instalador.sh"), instalador("aaaaaaa"));
  antes(prefix);
  const inst = gh.inst ?? instalador("bbbbbbb");
  const suma = createHash("sha256").update(inst).digest("hex");
  const srv = createServer((req, res) => {
    const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    if (req.url === "/repos/numengames/numinia-engine/releases/latest") {
      if (gh.latest) { res.writeHead(gh.latest); return res.end("{}"); }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ tag_name: gh.tag ?? "motor-bbbbbbb", published_at: gh.publicada ?? new Date().toISOString(), assets: [
        { name: "instalar-motor.sh", browser_download_url: `${base}/dl/instalar-motor.sh`, digest: gh.digest === null ? null : `sha256:${gh.digest ?? suma}` },
        { name: "SHA256SUMS", browser_download_url: `${base}/dl/SHA256SUMS` },
      ] }));
    }
    if (req.url === "/dl/instalar-motor.sh") return res.end(inst);
    if (req.url === "/dl/SHA256SUMS") return res.end(gh.sumas ?? `${suma}  instalar-motor.sh\n`);
    if (req.url === "/health") return res.end(JSON.stringify({ ok: true, conectados: gh.conectados ?? 0 }));
    res.writeHead(404); res.end();
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  const port = (srv.address() as { port: number }).port;
  try {
    const r = await new Promise<{ code: number; out: string }>((ok) => execFile("bash", [SCRIPT, ...args], {
      env: { ...process.env, NUMINIA_PREFIX: prefix, NUMINIA_API: `http://127.0.0.1:${port}`, NUMINIA_SALUD: `http://127.0.0.1:${port}/health`, NUMINIA_NODE: process.execPath },
    }, (err, stdout, stderr) => ok({ code: err ? Number((err as { code?: number }).code ?? 1) : 0, out: stdout + stderr })));
    const version = readFileSync(join(prefix, "VERSION"), "utf8").trim();
    const instalaciones = existsSync(join(prefix, "instalaciones")) ? readFileSync(join(prefix, "instalaciones"), "utf8").trim().split("\n") : [];
    return { ...r, version, instalaciones, prefix };
  } finally { srv.close(); }
}

test("actualizar: a new release is checked and installed; then it is up to date", async () => {
  const r = await escenario({}, ["--ahora"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /hay versión nueva: motor-bbbbbbb/);
  assert.match(r.out, /comprobado: sha256 [0-9a-f]{64}, numinia-engine bbbbbbb/);
  assert.equal(r.version, "bbbbbbb 2026-10-16");
  assert.equal(readFileSync(join(r.prefix, "instalador-anterior.sh"), "utf8"), instalador("aaaaaaa"), "the installer to go back to is kept");
  const otra = await escenario({ tag: "motor-aaaaaaa" });
  assert.equal(otra.code, 0); assert.match(otra.out, /al día: aaaaaaa/); assert.deepEqual(otra.instalaciones, []);
});

test("actualizar: waits while people are inside, unless the release is old or --ahora", async () => {
  const espera = await escenario({ conectados: 3 });
  assert.equal(espera.code, 0); assert.match(espera.out, /hay 3 persona\(s\) dentro: espero/); assert.equal(espera.version, "aaaaaaa 2026-10-15");
  const vieja = await escenario({ conectados: 3, publicada: new Date(Date.now() - 7 * 3600_000).toISOString() });
  assert.equal(vieja.version, "bbbbbbb 2026-10-16", vieja.out);
  const comprobar = await escenario({}, ["--comprobar"]);
  assert.match(comprobar.out, /instalaría motor-bbbbbbb/); assert.equal(comprobar.version, "aaaaaaa 2026-10-15");
});

test("actualizar: a file that is not the published one is never run", async () => {
  const sumas = await escenario({ sumas: `${"0".repeat(64)}  instalar-motor.sh\n` }, ["--ahora"]);
  assert.notEqual(sumas.code, 0); assert.match(sumas.out, /no coincide con su SHA256SUMS/); assert.deepEqual(sumas.instalaciones, []);
  const digest = await escenario({ digest: "1".repeat(64) }, ["--ahora"]);
  assert.notEqual(digest.code, 0); assert.match(digest.out, /el sha256 que da GitHub/); assert.deepEqual(digest.instalaciones, []);
  const otra = await escenario({ inst: instalador("ccccccc") }, ["--ahora"]);
  assert.notEqual(otra.code, 0); assert.match(otra.out, /dice otra versión/); assert.deepEqual(otra.instalaciones, []);
  const sinDigest = await escenario({ digest: null }, ["--ahora"]); // older releases have no digest: SHA256SUMS alone
  assert.equal(sinDigest.code, 0, sinDigest.out); assert.equal(sinDigest.version, "bbbbbbb 2026-10-16");
});

test("actualizar: pause, nothing published, not an engine tag, GitHub down: nothing changes", async () => {
  const pausa = await escenario({}, ["--ahora"], (p) => writeFileSync(join(p, "PAUSA"), ""));
  assert.match(pausa.out, /en pausa/); assert.equal(pausa.version, "aaaaaaa 2026-10-15");
  const nada = await escenario({ latest: 404 });
  assert.equal(nada.code, 0); assert.match(nada.out, /no tiene ninguna versión publicada/);
  const caida = await escenario({ latest: 502 });
  assert.equal(caida.code, 0); assert.match(caida.out, /GitHub no responde \(502\)/);
  const qa = await escenario({ tag: "v0.1.0-qa.1" });
  assert.equal(qa.code, 0); assert.match(qa.out, /no es un motor-<build>/);
});

test("actualizar: an installer that fails puts the previous one back and is not retried alone", async () => {
  const r = await escenario({ inst: instalador("bbbbbbb", true) }, ["--ahora"]);
  assert.notEqual(r.code, 0);
  assert.match(r.out, /vuelvo a la versión anterior \(aaaaaaa\)/);
  assert.deepEqual(r.instalaciones, ["aaaaaaa"], "the previous installer ran again");
  assert.equal(readFileSync(join(r.prefix, "FALLO"), "utf8").trim(), "motor-bbbbbbb");
  const otra = await escenario({ inst: instalador("bbbbbbb", true) }, [], (p) => writeFileSync(join(p, "FALLO"), "motor-bbbbbbb\n"));
  assert.equal(otra.code, 0); assert.match(otra.out, /ya falló al instalarse aquí/); assert.deepEqual(otra.instalaciones, []);
});
