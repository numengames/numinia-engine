// MIS-222 t_1b395abe · J18b first story (MENU-MUNECA-Y-PINTURA-VR.md §3.7 #1): `trazo@1` — a brush stroke painted in VR is a file
// the server validates like any upload, and an `objetos` kind. Pure: the schema (comprobarTrazo), the caps in limits.json, the kind in
// objetos (TIPOS/EXTENSIONES), and over the real HTTP server: a good stroke goes up, a broken one is refused in Spanish.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { comprobarTrazo, comprobarFichero, TRAZO, TRAZO_SCHEMA, TIPOS, TOPES_MB, topeBytes } from "../packages/net/src/ficheros.ts";
import { TIPOS as TIPOS_OBJ, EXTENSIONES } from "../features/objetos/feature.ts";
import type { ClientPart, PlacedObject } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { startServer } from "../packages/server/src/server.ts";
import { signer } from "../packages/server/src/secret.ts";
import { emitir, today } from "../packages/instance/src/identidad.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearCliente, tipoDe } from "../features/objetos/client.ts";

const bytes = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
const bueno = (extra: Record<string, unknown> = {}) => ({ schema: TRAZO_SCHEMA, pincel: "tubo", color: 3, grosor: 0.015, puntos: [[0, 0, 0, 0.5], [0.01, 0.02, -0.005, 0.8], [0.034, 0.04, -0.01, 1]], ...extra });
const motivo = (b: Uint8Array) => { const r = comprobarTrazo(b); return r.ok ? "" : r.issues.map((i) => i.path + ": " + i.message).join(" | "); };

test("a good stroke passes and comes back parsed", () => {
  const r = comprobarTrazo(bytes(bueno()));
  assert.ok(r.ok); assert.equal(r.ok && r.value.puntos.length, 3); assert.equal(r.ok && r.value.color, 3);
  assert.ok(comprobarFichero("trazo", bytes(bueno())).ok, "through the same door as every upload");
});
test("the cap values are the design's: 32 kB, 600 points, colour 0–7, width 0.003–0.06", () => {
  assert.equal(TRAZO.bytesMax, 32768); assert.equal(topeBytes("trazo"), 32768);
  assert.deepEqual([TRAZO.puntosMax, TRAZO.colores, TRAZO.grosorMin, TRAZO.grosorMax], [600, 8, 0.003, 0.06]);
});
test("each kind of broken stroke is refused with its own reason", () => {
  assert.match(motivo(bytes("  {}")), /empezar por «\{»/);
  assert.match(motivo(bytes("{no json")), /JSON legible/);
  assert.match(motivo(new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])), /JSON legible/, "not UTF-8");
  assert.match(motivo(bytes(bueno({ schema: "numinia-engine/trazo@2" }))), /trazo\.schema/);
  assert.match(motivo(bytes(bueno({ pincel: "spray" }))), /trazo\.pincel/);
  for (const c of [-1, 8, 1.5, "3"]) assert.match(motivo(bytes(bueno({ color: c }))), /trazo\.color/, `colour ${c}`);
  for (const g of [0.002, 0.07, "x", null]) assert.match(motivo(bytes(bueno({ grosor: g }))), /trazo\.grosor/, `width ${g}`);
  assert.match(motivo(bytes(bueno({ puntos: "no" }))), /faltan los puntos/);
  assert.match(motivo(bytes(bueno({ puntos: [[0, 0, 0, 1]] }))), /de 2 a 600 puntos/);
  assert.match(motivo(bytes(bueno({ puntos: [[0, 0, 0, 1], [0, 0, 1]] }))), /puntos\[1\].*cuatro números/);
  assert.match(motivo(bytes(bueno({ puntos: [[0, 0, 0, 1], [0, 0, "1", 1]] }))), /cuatro números/);
  assert.match(motivo(bytes(bueno({ puntos: [[0, 0, 0, 1], [101, 0, 0, 1]] }))), /100 m/);
  assert.match(motivo(bytes(bueno({ puntos: [[0, 0, 0, 1], [0.0123, 0, 0, 1]] }))), /milímetro/);
  assert.match(motivo(bytes(bueno({ puntos: [[0, 0, 0, 1], [0, 0, 0, 1.2]] }))), /presión/);
  assert.match(motivo(bytes(bueno({ puntos: [[0, 0, 0, 1], [0, 0, 0, 0.123]] }))), /presión/);
});
test("600 points fit under 32 kB; 601 are refused", () => {
  const pts = (n: number) => Array.from({ length: n }, (_, i) => [Math.round(i * 0.5) / 1000, 0.001, -0.001, 0.5]);
  const seiscientos = bytes(bueno({ puntos: pts(600) }));
  assert.ok(comprobarFichero("trazo", seiscientos).ok); assert.ok(seiscientos.length < TRAZO.bytesMax, `${seiscientos.length} bytes`);
  assert.match(motivo(bytes(bueno({ puntos: pts(601) }))), /de 2 a 600/);
  assert.match(JSON.stringify(comprobarFichero("trazo", new Uint8Array(TRAZO.bytesMax + 1).fill(0x20))), /pasa de/);
});
test("never throws on nonsense", () => {
  for (const b of [new Uint8Array(), bytes("null"), bytes("[]"), bytes("{\"puntos\":null}"), bytes("{\"schema\":1}")]) assert.doesNotThrow(() => comprobarFichero("trazo", b));
  assert.equal(comprobarFichero("trazo", new Uint8Array()).ok, false);
});
test("objetos knows the kind: trazo takes .trazo files and nothing else", () => {
  assert.ok((TIPOS_OBJ as readonly string[]).includes("trazo")); assert.deepEqual(EXTENSIONES.trazo, ["trazo"]);
  for (const t of ["modelo", "imagen", "video", "sonido"] as const) assert.ok(!EXTENSIONES[t].includes("trazo"));
  assert.equal((TIPOS as Record<string, string>).trazo, "application/json");
});
test("limits.json publishes the stroke caps the code enforces", () => {
  const lim = (JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8")) as { limits?: { key: string; value: number }[] }).limits
    ?? (JSON.parse(readFileSync(new URL("../limits.json", import.meta.url), "utf8")) as { key: string; value: number }[]);
  const v = (k: string) => lim.find((x) => x.key === k)?.value;
  assert.equal(v("stroke_file_bytes_max"), TRAZO.bytesMax); assert.equal(v("upload_max_trazo"), TOPES_MB.trazo, "(test/subidas.test.ts checks every upload_max_<kind>)");
  assert.equal(v("stroke_points_max"), TRAZO.puntosMax); assert.equal(v("stroke_colors"), TRAZO.colores); assert.equal(v("stroke_width_max"), TRAZO.grosorMax);
});

// ---- the kind inside a world: placed from an uploaded file, never solid, drawn as nothing yet ----
const SHA = "c".repeat(64);
function mundo() {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearObjetos()], log: () => {}, puede: (_w, a) => a === "construir", activo: (h, e) => `${h}.${e}` === `${SHA}.trazo` });
  const t = inst.join(0), cli = crearCliente(), drawn = new Map<string, PlacedObject>();
  const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, place: (k, o) => { if (o) drawn.set(k, o); else drawn.delete(k); }, here: () => ({ x: 0, y: 0, z: 0 }) } });
  const pump = (n = 2) => { for (let k = 0; k < n; k++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  return { s, b: cli.constructor, drawn, pump };
}
test("a stroke is placed from its uploaded file as kind «trazo», by its extension", () => {
  assert.equal(tipoDe("trazo"), "trazo");
  const { b, drawn, pump, s } = mundo();
  // the way the brush will place it (design §3.3): decorado, no name — the page's «colocarFichero» asks for a name, so raw
  s.features.send("objetos", "colocar", { modelo: SHA, x: 1, y: 1.2, z: 2, ry: 0, nombre: "", decorado: true, tipo: "trazo", ext: "trazo" }); pump();
  const [o] = [...drawn.values()]; assert.ok(o, `drawn nothing; rechazo: ${b.estado.ultimoRechazo}`);
  assert.equal(o?.kind, "trazo"); assert.equal(o?.ext, "trazo");
  s.features.send("objetos", "colocar", { modelo: SHA, x: 0, y: 0, z: 0, ry: 0, nombre: "", decorado: true, tipo: "trazo", ext: "png" }); pump();
  assert.match(b.estado.ultimoRechazo, /\.png no vale/, "a stroke is only a .trazo");
  s.features.send("objetos", "colocar", { modelo: "d".repeat(64), x: 0, y: 0, z: 0, ry: 0, nombre: "", decorado: true, tipo: "trazo", ext: "trazo" }); pump();
  assert.match(b.estado.ultimoRechazo, /no se ha subido/, "the file has to be on the server");
});
test("a stroke cannot be solid (it does not collide); undo takes it away", () => {
  const { b, drawn, pump, s } = mundo();
  s.features.send("objetos", "colocar", { modelo: SHA, x: 1, y: 1.2, z: 2, ry: 0, nombre: "", decorado: true, tipo: "trazo", ext: "trazo" }); pump();
  assert.equal(drawn.size, 1);
  b.ajustar({ solido: true, caja: [-1, -1, -1, 1, 1, 1] }); pump();
  assert.match(b.estado.ultimoRechazo, /Un trazo no puede ser sólido/);
  b.deshacer(); pump();
  assert.equal(drawn.size, 0, "undoing the placement removes the stroke: the server's own undo stack, no new code");
});

// ---- over the real HTTP server ----
test("PUT /a/<sha>.trazo: a good stroke is stored and served, a broken one is 422, a too-big one is 413", async () => {
  const BILLETE = emitir(signer("una-clave-de-prueba-larga"), "abcdefgh2345", today());
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "trazos-"));
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, secret: "una-clave-de-prueba-larga", construir: "todos", subidas: dir, features: [crearObjetos()], log: () => {} });
  const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
  const subir = (b: Uint8Array) => fetch(`http://127.0.0.1:${srv.port}/a/${sha(b)}.trazo`, { method: "PUT", body: b, headers: { authorization: `Bearer ${BILLETE}`, "x-nombre-fichero": "trazo.trazo" } });
  try {
    const ok = bytes(bueno());
    const r = await subir(ok);
    assert.equal(r.status, 201, JSON.stringify(await r.clone().json().catch(() => null)));
    assert.equal((await r.json()).tipo, "trazo");
    const g = await fetch(`http://127.0.0.1:${srv.port}/a/${sha(ok)}.trazo`);
    assert.equal(g.status, 200); assert.equal(g.headers.get("content-type"), "application/json");
    assert.deepEqual(JSON.parse(await g.text()), bueno());
    const malo = await subir(bytes(bueno({ color: 9 })));
    assert.equal(malo.status, 422); assert.match(JSON.stringify(await malo.json()), /color/);
    const grande = await subir(new Uint8Array(TRAZO.bytesMax + 1).fill(0x20));
    assert.equal(grande.status, 413);
  } finally { await srv.close(); }
});
