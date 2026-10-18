// H7: a world's settings in its aventura/ficha.json (ficha@1): name, description, cover, everyone's default avatar
// and how many fit (`aforo`). The server reads them with the schema, says why a bad one is left out, publishes
// them in GET /status and closes the door with CIERRE_LLENO + a reason when the world is full.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { AFORO_MAX, AVATARES_CASA, validarFicha } from "../packages/server/src/aventura.ts";
import { CIERRE_LLENO, startServer } from "../packages/server/src/server.ts";
import { modelosDelMundo } from "../apps/plaza/catalogo-avatares.ts";
import catalogo from "../activos/avatares/catalogo.json" with { type: "json" };

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const MOTOR = { build: "dev", commit: "0".repeat(40), imagen: "" };
const lim = JSON.parse((await import("node:fs")).readFileSync("limits.json", "utf8"));

const cerrado = (ws: WebSocket) => new Promise<{ code: number; reason: string }>((ok) => ws.on("close", (code, reason) => ok({ code, reason: reason.toString() })));
const abierto = (ws: WebSocket) => new Promise<void>((ok, ko) => { ws.on("open", () => ok()); ws.on("error", ko); });

test("ficha@1: avatar must be a house avatar and aforo a whole number 1…AFORO_MAX, each refused with its reason", () => {
  assert.ok(AVATARES_CASA.length >= 2, "the house ships several avatars");
  assert.equal(AFORO_MAX, lim.limits.find((e: { key: string }) => e.key === "world_people_cap").value, "the cap is the one limits.json publishes");
  const ok = validarFicha({ formato: "ficha@1", nombre: "Sala", avatar: AVATARES_CASA[0], aforo: 12 });
  assert.ok(ok.ok); if (ok.ok) { assert.equal(ok.value.avatar, AVATARES_CASA[0]); assert.equal(ok.value.aforo, 12); }
  assert.ok(validarFicha({ formato: "ficha@1", nombre: "Sala" }).ok, "both are optional");
  const ko = validarFicha({ formato: "ficha@1", nombre: "Sala", avatar: "darth-vader", aforo: 0 });
  assert.ok(!ko.ok);
  if (!ko.ok) {
    assert.deepEqual(ko.issues.map((i) => i.path).sort(), ["ficha.json.aforo", "ficha.json.avatar"]);
    assert.ok(ko.issues.find((i) => i.path.endsWith("avatar"))!.message.includes(AVATARES_CASA[0]), "the reason lists the house avatars");
    assert.ok(ko.issues.find((i) => i.path.endsWith("aforo"))!.message.includes(String(AFORO_MAX)));
  }
  for (const aforo of [1.5, "12", -1, AFORO_MAX + 1, Number.NaN]) assert.ok(!validarFicha({ formato: "ficha@1", nombre: "Sala", aforo }).ok, `aforo ${String(aforo)} is refused`);
  assert.ok(validarFicha({ formato: "ficha@1", nombre: "Sala", aforo: AFORO_MAX }).ok);
});

test("modelosDelMundo: the world's avatar is the only one offered; an unknown id leaves the house mix", () => {
  const [a, b] = catalogo.modelos;
  assert.deepEqual(modelosDelMundo(catalogo.modelos, b.id).map((m) => m.id), [b.id]);
  assert.equal(modelosDelMundo(catalogo.modelos).length, catalogo.modelos.length);
  assert.equal(modelosDelMundo(catalogo.modelos, "nadie").length, catalogo.modelos.length);
  assert.equal(modelosDelMundo(catalogo.modelos, a.id)[0].id, a.id);
});

test("GET /status publishes avatar and aforo; the door closes with CIERRE_LLENO and «lleno n/aforo» when the world is full", async () => {
  const aventura = tmp("ajustes-mundo-");
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Sala pequeña", avatar: AVATARES_CASA[1], aforo: 2 }));
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: (l) => log.push(l), statsMs: 60_000, motor: MOTOR, aventura });
  const abiertos: WebSocket[] = [];
  try {
    const st = await (await fetch(`http://127.0.0.1:${srv.port}/status`)).json();
    assert.equal(st.nombre, "Sala pequeña"); assert.equal(st.avatar, AVATARES_CASA[1]); assert.equal(st.aforo, 2);
    assert.ok(log.some((l) => l.startsWith("[ficha] aforo 2 personas") && l.includes(AVATARES_CASA[1])), "the log says what the world asked for");
    for (let i = 0; i < 2; i++) { const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`); abiertos.push(ws); await abierto(ws); }
    await new Promise((r) => setTimeout(r, 50));
    const tercero = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    const c = await cerrado(tercero);
    assert.equal(c.code, CIERRE_LLENO); assert.equal(c.reason, "lleno 2/2");
    const m = await (await fetch(`http://127.0.0.1:${srv.port}/metrics`)).json();
    assert.equal(m.conexiones.rechazadasLlenas, 1); assert.equal(m.capacidad, 2);
    // one leaves: the next one gets in
    abiertos[0].close(); await cerrado(abiertos[0]); await new Promise((r) => setTimeout(r, 50));
    const cuarto = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`); abiertos.push(cuarto); await abierto(cuarto);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(srv.metrics().conectados, 2);
  } finally { for (const ws of abiertos) ws.close(); await srv.close(); }
});

test("a ficha with a bad aforo is not loaded (the reason in the log) and the engine's capacity still caps a bigger one", async () => {
  const aventura = tmp("ajustes-mundo-mal-");
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Rota", aforo: AFORO_MAX + 1 }));
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: (l) => log.push(l), statsMs: 60_000, motor: MOTOR, aventura, maxPlayers: 3 });
  try {
    const st = await (await fetch(`http://127.0.0.1:${srv.port}/status`)).json();
    assert.equal(st.nombre, undefined, "a ficha that does not fit is not half-used");
    assert.equal(st.aforo, 3, "without a ficha, aforo = the engine's capacity");
    assert.ok(log.some((l) => l.startsWith("[ficha] no se carga: ficha.json.aforo")));
  } finally { await srv.close(); }
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Grande", aforo: 500 }));
  const srv2 = await startServer({ port: 0, host: "127.0.0.1", log: (l) => log.push(l), statsMs: 60_000, motor: MOTOR, aventura, maxPlayers: 3 });
  try {
    const st = await (await fetch(`http://127.0.0.1:${srv2.port}/status`)).json();
    assert.equal(st.aforo, 3, "a world lowers the cap, never raises it");
    assert.ok(log.some((l) => l.includes("el motor admite 3")));
  } finally { await srv2.close(); }
});
