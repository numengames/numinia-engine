// t_45ef2f70: the first load (bytes until the player can move) went from 0.47 to 0.72 MB on slow 4G because every panel, font and table
// was fetched before the first frame. This test keeps it down: the cap is `first_load_br_bytes` in limits.json (what `npm run tamano`
// also checks), the fonts and the builder's drawers are not in the start bundle, and `alPrimerCuadro` really waits for the frame.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-ignore plain .mjs tool
import { construir, medirArranque, topeBr, TOPE_GZ } from "../tools/tamano.mjs";
import { alPrimerCuadro, primerCuadroDado, primerCuadroYaDado } from "../apps/plaza/primer-cuadro.ts";
import { CSS_FUENTES } from "../apps/plaza/fuentes.ts";

const lim = JSON.parse(readFileSync("limits.json", "utf8")).limits as { key: string; value: number; state: string; test?: string }[];

test("limits.json publishes the first-load cap, and the built start bundle is under it", () => {
  const e = lim.find((x) => x.key === "first_load_br_bytes");
  assert.ok(e, "first_load_br_bytes is in limits.json");
  assert.equal(e.state, "measured");
  assert.equal(e.test, "test/tamano-primera-carga.test.ts");
  assert.ok(topeBr() <= 600_000, "the cap is not raised past 600 kB brotli without saying why (it was 480 kB gz on 18-10)");
  const out = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "primera-carga-"));
  try {
    construir(out); // its own folder: other tests read dist/plaza
    const m = medirArranque(out);
    assert.ok(m.totalBr <= topeBr(), `start bundle ${m.totalBr} B brotli is over the cap ${topeBr()} B (limits.json first_load_br_bytes): lazy-load what the first frame does not need`);
    assert.ok(m.totalGz <= TOPE_GZ, `start bundle ${m.totalGz} B gz is over TOPE_GZ`);
    for (const f of m.ficheros as { nombre: string }[]) assert.ok(!/^(entorno|director|dados|burbuja|ficha-mundo)-[\w-]{8}\.js$/.test(f.nombre), `${f.nombre} must be a lazy chunk, not part of the start bundle`);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("the house fonts are added after the first frame, not declared in the stylesheet", () => {
  const css = readFileSync("apps/plaza/tema.css", "utf8");
  assert.ok(!/@font-face\s*{[^}]*Geist/.test(css), "tema.css must not declare Geist: the browser would fetch 115 kB before the first frame");
  assert.match(CSS_FUENTES, /Geist-Variable\.woff2/);
  assert.match(CSS_FUENTES, /GeistMono-Variable\.woff2/);
  const main = readFileSync("apps/plaza/main.ts", "utf8");
  assert.match(main, /alPrimerCuadro\(\(\) => ponerFuentes\(\)\)/);
  assert.match(main, /primerCuadroDado\(\);/);
});

test("main.ts mounts the builder's drawers, dice, bubbles and director with a dynamic import, after the first frame", () => {
  const main = readFileSync("apps/plaza/main.ts", "utf8");
  for (const f of ["entorno", "ficha-mundo", "director", "dados", "burbuja"]) {
    assert.ok(!new RegExp(`^import .* from "\\./${f}\\.ts"`, "m").test(main), `${f}.ts must not be imported statically by main.ts`);
    assert.ok(main.includes(`import("./${f}.ts")`), `${f}.ts is loaded with import()`);
  }
});

test("main.ts leaves «Gente», the photo mode and the Bolsa panel behind façades, and the voice pool out of the start bundle", () => {
  const main = readFileSync("apps/plaza/main.ts", "utf8");
  for (const f of ["gente", "foto", "inventario"]) {
    assert.ok(!new RegExp(`^import .* from "\\./${f}\\.ts"`, "m").test(main), `${f}.ts must not be imported statically by main.ts`);
    assert.ok(main.includes(`./${f}-puerta.ts`), `${f}-puerta.ts is the façade main.ts mounts`);
    assert.ok(readFileSync(`apps/plaza/${f}-puerta.ts`, "utf8").includes(`import("./${f}.ts")`), `${f}-puerta.ts loads ${f}.ts with import()`);
  }
  // what the sheet, the VR menu and fishing need from the Bolsa stays small and apart, so inventario.ts can wait
  for (const f of ["ficha.ts", "xr-menu.ts", "pesca.ts"]) assert.ok(!/from "\.\/inventario\.ts"/.test(readFileSync(`apps/plaza/${f}`, "utf8")), `${f} reads inventario-resumen.ts, not the panel`);
  // a photo's link cannot wait for the first frame: the façade brings the mode at once for it
  assert.match(readFileSync("apps/plaza/foto-puerta.ts", "utf8"), /if \(enlace\) void puerta\.cargarYa\(\)/);
  const sonidos = readFileSync("packages/render/src/audio/sonidos.ts", "utf8");
  assert.ok(!/^import \{ crearVoces \}/m.test(sonidos), "sonidos.ts must not import the voice pool statically");
  assert.ok(sonidos.includes('import("./voces.ts")'));
});

test("main.ts leaves the conditions gate behind a façade that holds the page (Pablo's decision of 26-10: it loads after the first frame, nobody plays before accepting)", () => {
  const main = readFileSync("apps/plaza/main.ts", "utf8");
  assert.ok(!/^import .* from "\.\/condiciones\.ts"/m.test(main), "condiciones.ts must not be imported statically by main.ts");
  assert.ok(main.includes("montarCondicionesPuerta({"), "main.ts mounts the façade");
  const puerta = readFileSync("apps/plaza/condiciones-puerta.ts", "utf8");
  assert.ok(puerta.includes('import("./condiciones.ts")'), "the façade loads the bubble with import()");
  assert.ok(!/^import \{[^}]*\} from "\.\/condiciones-logica\.ts"/m.test(puerta), "the façade keeps condiciones-logica.ts out of the entry");
  // the closed-page guards stay as they were: walking, jumping and the walk-to order ask `condiciones.cerrada()`, which the façade answers true while the offer is on
  assert.equal((main.match(/condiciones\.cerrada\(\)/g) ?? []).length >= 4, true);
  assert.match(puerta, /cerrada: \(\): boolean => \(real \? real\.cerrada\(\) : pendiente\(\)\)/);
});

test("alPrimerCuadro: waits for the first frame, then runs once; a failing task does not stop the others", async () => {
  const visto: string[] = [];
  const anota = (s: string): void => { visto.push(s); };
  alPrimerCuadro(() => { visto.push("a"); });
  alPrimerCuadro(() => { throw new Error("boom"); });
  alPrimerCuadro(async () => { visto.push("c"); throw new Error("boom async"); });
  alPrimerCuadro(() => { visto.push("d"); });
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(visto, [], "nothing runs before the first frame");
  assert.equal(primerCuadroYaDado(), false);
  const aviso = console.warn; console.warn = () => {};
  try {
    primerCuadroDado(); primerCuadroDado(); // idempotent
    await new Promise((r) => setTimeout(r, 30));
    assert.deepEqual(visto, ["a", "c", "d"]);
    alPrimerCuadro(() => { anota("tarde"); }); // after the frame: runs right away
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(visto.at(-1), "tarde");
  } finally { console.warn = aviso; }
});
