// A world may take the social buttons («Saludar», «Bailar», «Movimientos») off the screen: ficha@1 `interfaz.ocultar: ["gestos"]`.
// The server reads it value by value and serves what fits in GET /status; the page turns it into «hide these buttons».
// Without the field nothing changes (the same /status as before, no button hidden).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INTERFAZ_OCULTABLES, leerInterfaz } from "../packages/server/src/aventura.ts";
import { startServer } from "../packages/server/src/server.ts";
import { OCULTABLES, accionesVisibles, ocultosDe, rotuloMas } from "../apps/plaza/interfaz-mundo.ts";
import { entradasDelMenu } from "../packages/client/src/movil.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const MOTOR = { build: "dev", commit: "0".repeat(40), imagen: "" };
const ACCIONES = [
  { feature: "gestos", id: "saludar", label: "Saludar" }, { feature: "gestos", id: "bailar", label: "Bailar" },
  { feature: "pesca", id: "recoger", label: "Recoger" }, { feature: "cogibles", id: "soltar", label: "Soltar" },
  { feature: "baculo", id: "soltar", label: "Soltar el báculo" }, { feature: "dados", id: "tirar", label: "Tirar dados" },
];
const NADA = new Set<(typeof OCULTABLES)[number]>(), GESTOS = new Set<(typeof OCULTABLES)[number]>(["gestos"]);
const MANO = new Set<(typeof OCULTABLES)[number]>(["recoger-soltar"]), AMBOS = new Set<(typeof OCULTABLES)[number]>(["gestos", "recoger-soltar"]);

test("leerInterfaz: «gestos» is kept; nothing or an empty list = the page as ever", () => {
  assert.deepEqual(leerInterfaz({ ocultar: ["gestos"] }), { interfaz: { ocultar: ["gestos"] }, problemas: [] });
  assert.deepEqual(leerInterfaz({ ocultar: ["gestos", "gestos"] }).interfaz, { ocultar: ["gestos"] }, "twice is once");
  assert.deepEqual(leerInterfaz(undefined), { interfaz: null, problemas: [] });
  assert.deepEqual(leerInterfaz({}), { interfaz: null, problemas: [] });
  assert.deepEqual(leerInterfaz({ ocultar: [] }), { interfaz: null, problemas: [] });
});

test("leerInterfaz: a name that does not exist drops only itself and says which exist; unknown keys are ignored", () => {
  const r = leerInterfaz({ ocultar: ["gestos", "chat", 7, "x".repeat(200)], brillo: 3 });
  assert.deepEqual(r.interfaz, { ocultar: ["gestos"] });
  assert.equal(r.problemas.length, 3);
  assert.ok(r.problemas[0].startsWith("interfaz.ocultar:") && r.problemas[0].includes("«chat»") && r.problemas[0].includes("gestos"));
  assert.ok(r.problemas[2].length < 160, "a long name is cut in the message");
  assert.equal(leerInterfaz("gestos").interfaz, null); assert.equal(leerInterfaz("gestos").problemas.length, 1);
  assert.equal(leerInterfaz(["gestos"]).problemas.length, 1);
  assert.equal(leerInterfaz({ ocultar: "gestos" }).problemas.length, 1);
  assert.equal(leerInterfaz(null).interfaz, null);
});

test("the server's list and the page's list are the same one", () => { assert.deepEqual([...OCULTABLES], [...INTERFAZ_OCULTABLES]); });

test("GET /status carries the world's interfaz; a bad name is logged and left out; no field = no key", async () => {
  const aventura = tmp("interfaz-");
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Simulador", interfaz: { ocultar: ["gestos", "chat"] } }));
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: (l) => log.push(l), statsMs: 60_000, motor: MOTOR, aventura });
  try {
    const st = await (await fetch(`http://127.0.0.1:${srv.port}/status`)).json();
    assert.deepEqual(st.interfaz, { ocultar: ["gestos"] });
    assert.ok(log.some((l) => l.startsWith("[ficha] interfaz.ocultar:") && l.includes("«chat»")), "the bad name is said once");
  } finally { await srv.close(); }
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Sin campo" }));
  const srv2 = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, motor: MOTOR, aventura });
  try {
    const st = await (await fetch(`http://127.0.0.1:${srv2.port}/status`)).json();
    assert.equal("interfaz" in st, false, "without the field /status is as before");
  } finally { await srv2.close(); }
});

test("ocultosDe: the page does not trust the wire", () => {
  assert.deepEqual([...ocultosDe({ ocultar: ["gestos"] })], ["gestos"]);
  for (const mal of [undefined, null, "gestos", ["gestos"], 3, {}, { ocultar: "gestos" }, { ocultar: [] }, { ocultar: ["chat", 1, null] }]) assert.equal(ocultosDe(mal).size, 0, JSON.stringify(mal));
  assert.deepEqual([...ocultosDe({ ocultar: ["chat", "gestos"] })], ["gestos"]);
});

test("accionesVisibles: hiding «gestos» takes Saludar and Bailar only; without it every action stays, in order", () => {
  assert.deepEqual(accionesVisibles(ACCIONES, NADA), ACCIONES);
  assert.deepEqual(accionesVisibles(ACCIONES, GESTOS).map((a) => a.id), ["recoger", "soltar", "soltar", "tirar"]);
  assert.deepEqual(accionesVisibles([], GESTOS), []);
});

test("P15 b: «recoger-soltar» takes the player's Recoger (pesca) and Soltar (cogibles) buttons, nothing else", () => {
  assert.deepEqual(accionesVisibles(ACCIONES, MANO).map((a) => `${a.feature}:${a.id}`), ["gestos:saludar", "gestos:bailar", "baculo:soltar", "dados:tirar"]);
  assert.deepEqual(accionesVisibles(ACCIONES, AMBOS).map((a) => `${a.feature}:${a.id}`), ["baculo:soltar", "dados:tirar"]);
});

test("P15 b: the name is known to the server and the page, read from the ficha, and a world without it hides no hand button", () => {
  assert.ok(INTERFAZ_OCULTABLES.includes("recoger-soltar" as never));
  assert.deepEqual(leerInterfaz({ ocultar: ["recoger-soltar"] }), { interfaz: { ocultar: ["recoger-soltar"] }, problemas: [] });
  assert.deepEqual(leerInterfaz({ ocultar: ["gestos", "recoger-soltar", "gestos"] }).interfaz, { ocultar: ["gestos", "recoger-soltar"] });
  assert.deepEqual([...ocultosDe({ ocultar: ["recoger-soltar", "chat"] })], ["recoger-soltar"]);
  assert.deepEqual(accionesVisibles(ACCIONES, ocultosDe(undefined)), ACCIONES, "no field = every button as before");
});

test("the phone's «…» menu: with the gestures hidden it offers Saltar and the other actions, no Saludar / Bailar", () => {
  const con = entradasDelMenu(accionesVisibles(ACCIONES, NADA), []).map((e) => e.id);
  const sin = entradasDelMenu(accionesVisibles(ACCIONES, GESTOS), []).map((e) => e.id);
  assert.ok(con.includes("saludar") && con.includes("bailar"));
  assert.ok(!sin.includes("saludar") && !sin.includes("bailar") && sin.includes("saltar") && sin.includes("tirar"));
  const sinMano = entradasDelMenu(accionesVisibles(ACCIONES, MANO), []).map((e) => e.id);
  assert.ok(sinMano.includes("saludar") && sinMano.includes("tirar"));
  assert.equal(sinMano.filter((i) => i === "soltar").length, 1, "only the staff's Soltar is left");
});

test("P15 c: «Más acciones» names only what the menu offers (screen reader label follows the hidden groups)", () => {
  assert.equal(rotuloMas(NADA), "Más acciones: saltar, saludar, bailar…", "the label a world without the field has always had");
  assert.equal(rotuloMas(GESTOS), "Más acciones: saltar…");
  assert.equal(rotuloMas(MANO), "Más acciones: saltar, saludar, bailar…", "the hand buttons were never named");
  assert.ok(!/saludar|bailar/.test(rotuloMas(AMBOS)));
});
