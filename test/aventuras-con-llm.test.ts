// J16: the recipe docs/extender/aventuras-con-llm.md cannot rot. The worked example is read FROM THE PAGE (each
// `file: <path>` line followed by a json fence), written to a folder, passed through `node tools/aventura.ts`, and the quest
// is played to the end through the real server plug. A change to the formats that breaks the page breaks this test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { lectorAventura } from "../packages/server/src/aventura.ts";
import { crearMisiones, LLEGADA_CADA } from "../features/misiones/server.ts";
import { crearCliente } from "../features/misiones/client.ts";

const DOC = new URL("../docs/extender/aventuras-con-llm.md", import.meta.url).pathname;
const archivos = [...readFileSync(DOC, "utf8").matchAll(/^file: (\S+)\n```json\n([\s\S]*?)\n```/gm)].map((m) => ({ ruta: m[1], texto: m[2] }));

/** Writes the page's files into a fresh folder, skipping the paths in `sin`. */
function escribir(sin: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), "aventura-llm-"));
  for (const f of archivos) {
    if (sin.includes(f.ruta)) continue;
    mkdirSync(dirname(join(dir, f.ruta)), { recursive: true });
    writeFileSync(join(dir, f.ruta), f.texto);
  }
  return dir;
}
const correr = (dir: string) => spawnSync(process.execPath, ["tools/aventura.ts", dir], { encoding: "utf8" });

test("the page carries the four files of the example, each valid JSON with its own id", () => {
  assert.deepEqual(archivos.map((f) => f.ruta), ["ficha.json", "misiones/relight-the-lamp.json", "pnj/marta.json", "cosas/brass-lamp.json"]);
  for (const f of archivos) {
    const j = JSON.parse(f.texto);
    if (j.id) assert.equal(f.ruta.replace(/^.*\//, ""), `${j.id}.json`);
  }
});

test("the example written by the recipe passes tools/aventura.ts with no problem", () => {
  const dir = escribir();
  try {
    const r = correr(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /1 misiones \(relight-the-lamp\), 1 personas \(marta\), 1 cosas \(brass-lamp\)/);
    assert.match(r.stdout, /Todo en orden\./);
    assert.doesNotMatch(r.stdout, /✗/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the page's «typical mistake»: a step naming a person with no file fails with the file and the path", () => {
  const dir = escribir(["pnj/marta.json"]);
  try {
    const r = correr(dir);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /✗ [^\n]*relight-the-lamp[^\n]*pasos\[2\]\.pnj/);
    assert.match(r.stdout, /problema\(s\): lo que los tiene no se carga\./);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("the example completes end to end over the real plug: talk, accept, take, arrive, report", () => {
  const dir = escribir();
  try {
    const leer = lectorAventura(dir);
    const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: crearMisiones({ aventura: { misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas") } }), log: () => {}, now: () => Date.parse("2026-11-07T12:00:00Z") });
    const t = inst.join(0), cli = crearCliente();
    const s = new ClientSession(t, { features: cli.parts, view: { label() {}, bounce() {}, place() {}, tag() {} } });
    const m = cli.misiones;
    const pump = (n = 2) => { for (let i = 0; i < n; i++) { t.flush(); inst.tick(); t.flush(); } };
    const place = (x: number, z: number, n = 12) => { inst.sim.tf.cols.x[s.entity] = fx(x); inst.sim.tf.cols.z[s.entity] = fx(z); pump(n); };
    pump(3);
    place(2, -2);
    s.features.use("pnj", "marta"); pump();
    assert.equal(m.dialogo()?.nombre, "Marta, the keeper");
    m.elegir(1); pump();                              // "I will find it." accepts the quest
    assert.deepEqual(m.libro().map((q) => [q.id, q.estado, q.paso]), [["relight-the-lamp", "activa", 0]]);
    m.elegir(1); pump();                              // "On my way." closes the conversation
    place(10, 8);                                     // the lamp
    s.features.use("misiones", "brass-lamp"); pump();
    assert.equal(m.libro()[0].paso, 1);
    place(19, 1, 1); pump(LLEGADA_CADA + 1);          // the lighthouse (checked by the server's clock)
    assert.equal(m.libro()[0].paso, 2);
    place(2, -2);
    s.features.use("pnj", "marta"); pump();
    assert.match(m.dialogo()?.texto ?? "", /Is the lamp in its place/);
    m.elegir(1); pump();                              // "It is lit again."
    assert.deepEqual(m.libro().map((q) => [q.id, q.estado]), [["relight-the-lamp", "hecha"]]);
    assert.deepEqual(m.resumen().insignias, ["Insignia «Keeper of the light»"]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
