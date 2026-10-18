// A world's look (ficha@1 `tema`): the server reads it value by value and serves what fits in GET /status; the page
// turns it into the CSS variables tema.css reads. Without a tema nothing changes (the house look, Nocturno).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leerTema, TEMA_COLORES } from "../packages/server/src/aventura.ts";
import { startServer } from "../packages/server/src/server.ts";
import { aplicarTema, tinta, VARIABLES } from "../apps/plaza/tema-mundo.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
const MOTOR = { build: "dev", commit: "0".repeat(40), imagen: "" };
/** The TRG26's look (trgcon.com: #0b0006 dark, #ff8ebe pink, #64f5f0 cyan, #f9ff8e yellow, condensed titles). */
const TRG = {
  fondo: "#0B0006", superficie: "#160a1a", elevado: "#2a1430", texto: "#e8f8ff", texto2: "#c9b8d6", linea: "#3d1f45",
  foco: "#64f5f0", accion: "#ff8ebe", enfasis: "#f9ff8e", etiqueta: "#64f5f0", titulos: "bebas-neue", sombra: "#ff8ebe", mayusculas: true, forma: "pildora",
};

test("leerTema: the TRG26 look is kept whole (colours in lower case); nothing = the house look", () => {
  const r = leerTema(TRG);
  assert.deepEqual(r.problemas, []);
  assert.equal(r.tema?.fondo, "#0b0006");
  assert.equal(r.tema?.titulos, "bebas-neue"); assert.equal(r.tema?.forma, "pildora"); assert.equal(r.tema?.mayusculas, true);
  assert.equal(Object.keys(r.tema!).length, TEMA_COLORES.length + 4);
  assert.deepEqual(leerTema(undefined), { tema: null, problemas: [] });
  assert.deepEqual(leerTema({}), { tema: null, problemas: [] });
});

test("leerTema: a bad value drops only itself and says how to fix it; unknown keys are ignored", () => {
  const r = leerTema({ fondo: "negro", texto: "#fff", accion: "#FF8EBE", titulos: "comic-sans", forma: "redonda", mayusculas: "sí", sombra: "#ff8ebe", brillo: 3 });
  assert.deepEqual(r.tema, { accion: "#ff8ebe", sombra: "#ff8ebe" });
  assert.equal(r.problemas.length, 5);
  assert.ok(r.problemas.some((p) => p.startsWith("tema.fondo:") && p.includes("#rrggbb")));
  assert.ok(r.problemas.some((p) => p.startsWith("tema.titulos:") && p.includes("bebas-neue")));
  assert.ok(!r.problemas.some((p) => p.includes("brillo")), "a newer engine may add keys: ignored, not refused");
  assert.equal(leerTema("rosa").tema, null);
  assert.equal(leerTema(["#fff"]).problemas.length, 1);
});

test("GET /status carries the world's tema next to its name; a bad value is logged and left out", async () => {
  const aventura = tmp("tema-");
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "La Nave de los Ingenios · TRG26", tema: { ...TRG, linea: "morado" } }));
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: (l) => log.push(l), statsMs: 60_000, motor: MOTOR, aventura });
  try {
    const st = await (await fetch(`http://127.0.0.1:${srv.port}/status`)).json();
    assert.equal(st.nombre, "La Nave de los Ingenios · TRG26");
    assert.equal(st.tema.accion, "#ff8ebe"); assert.equal(st.tema.titulos, "bebas-neue"); assert.equal(st.tema.linea, undefined);
    assert.ok(log.some((l) => l.startsWith("[ficha] tema.linea:")), "the bad value is said once, with its fix");
  } finally { await srv.close(); }
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Sin tema" }));
  const srv2 = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, motor: MOTOR, aventura });
  try {
    const st = await (await fetch(`http://127.0.0.1:${srv2.port}/status`)).json();
    assert.equal(st.nombre, "Sin tema"); assert.equal("tema" in st, false, "no tema: /status as before");
  } finally { await srv2.close(); }
});

test("aplicarTema: colours become tema.css variables, the ink on a light action is dark, titles get their face", () => {
  const puestas = new Map<string, string>(), raiz = { style: { setProperty: (k: string, v: string) => { puestas.set(k, v); } }, dataset: {} as Record<string, string | undefined> };
  const n = aplicarTema(leerTema(TRG).tema, raiz);
  assert.equal(n, puestas.size);
  for (const [clave, vars] of Object.entries(VARIABLES)) for (const v of vars) assert.equal(puestas.get(v), (TRG as Record<string, unknown>)[clave] === "#0B0006" ? "#0b0006" : (TRG as Record<string, unknown>)[clave], `${clave} → ${v}`);
  assert.equal(puestas.get("--n-sup"), "rgba(22, 10, 26, .92)");
  assert.equal(puestas.get("--n-accion-tinta"), "#0b0006", "pink buttons with dark ink, like trgcon.com's");
  assert.ok(puestas.get("--n-titulos")?.startsWith("\"Bebas Neue\""));
  assert.equal(puestas.get("--n-titulos-mayus"), "uppercase"); assert.equal(puestas.get("--n-r-control"), "999px");
  assert.ok(puestas.get("--n-titulos-sombra")?.includes("#ff8ebe"));
  assert.equal(raiz.dataset.temaTitulos, "bebas-neue"); assert.equal(raiz.dataset.tema, "mundo");
  // the wire is not trusted: what does not fit is skipped; nothing at all leaves the page as it was
  const vacio = { style: { setProperty: () => { throw new Error("nothing should be set"); } }, dataset: {} as Record<string, string | undefined> };
  assert.equal(aplicarTema({ fondo: "url(x)", titulos: "../../etc", forma: 1 }, vacio), 0);
  assert.equal(aplicarTema(null, vacio), 0); assert.equal(aplicarTema("tema", vacio), 0);
  assert.deepEqual(vacio.dataset, {});
  assert.equal(tinta("#017c8d"), "#ffffff", "the house action colour keeps its white ink");
});
