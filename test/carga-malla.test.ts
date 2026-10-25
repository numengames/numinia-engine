// H4: the loading screen of an espacio-base world draws the house's line mesh up to the real load progress (apps/plaza/carga.ts +
// the CSS/SVG of apps/plaza/index.html). A world without an espacio base keeps the moon screen. Pure logic only: no browser here
// (the photos at 15/50/85 % are in work/naturaleza/espacio-base/fotos/h04-*.png).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ETAPAS, TRAMO_PIEZAS, fraccionCarga, crearProgresoMalla } from "../apps/plaza/carga.ts";
import type { Etapa } from "../apps/plaza/carga.ts";

function pantalla() {
  const props: Record<string, string> = {}, clases: string[] = [], pct = { textContent: "" as string | null };
  return { props, clases, pct, el: { style: { setProperty: (n: string, v: string) => { props[n] = v; } }, classList: { add: (c: string) => clases.push(c) }, querySelector: (s: string) => (s === ".c-pct" ? pct : null) } };
}

test("la fracción sube con las etapas reales y nunca baja; sin etapas es 0 y el final es 1", () => {
  assert.equal(fraccionCarga([]), 0);
  const orden = Object.keys(ETAPAS) as Etapa[];
  let antes = 0;
  for (let i = 1; i <= orden.length; i++) { const f = fraccionCarga(orden.slice(0, i)); assert.ok(f > antes, orden[i - 1]); antes = f; }
  assert.equal(antes, 1);
  assert.equal(fraccionCarga(["vista", "codigo"]), ETAPAS.vista); // order of arrival does not matter: the furthest step counts
});

test("sin activar() (mundo sin espacio base) no toca la pantalla: ni clase, ni --p, ni porcentaje", () => {
  const p = pantalla(), c = crearProgresoMalla(p.el);
  for (const e of Object.keys(ETAPAS) as Etapa[]) c.etapa(e);
  assert.deepEqual(p.clases, []); assert.deepEqual(p.props, {}); assert.equal(p.pct.textContent, ""); assert.equal(c.activa(), false);
});

test("activar() pone la clase «eb» y se pone al día con lo ya cargado; cada etapa mueve --p y el porcentaje", () => {
  const p = pantalla(), c = crearProgresoMalla(p.el);
  c.etapa("codigo"); c.etapa("estado");
  c.activar(); c.activar();
  assert.deepEqual(p.clases, ["eb"]);
  assert.equal(p.props["--p"], String(ETAPAS.estado)); assert.equal(p.pct.textContent, "25 %");
  c.etapa("vista"); assert.equal(p.props["--p"], String(ETAPAS.vista));
  c.etapa("codigo"); assert.equal(p.props["--p"], String(ETAPAS.vista)); // a late older step does not pull the lines back
  c.etapa("listo"); assert.equal(p.props["--p"], "1"); assert.equal(p.pct.textContent, "100 %");
});

test("C: las piezas reales mueven las líneas entre la bienvenida y el 97 %, escriben «n de N piezas» y nunca retroceden", () => {
  const p = pantalla();
  const sitios = [{ textContent: "" as string | null }, { textContent: "" as string | null }];
  const el = { ...p.el, querySelectorAll: (s: string) => ({ forEach: (f: (e: { textContent: string | null }) => void) => { if (s === ".c-piezas") sitios.forEach(f); } }) };
  const c = crearProgresoMalla(el);
  c.activar(); c.etapa("codigo"); c.etapa("estado"); c.etapa("vista");
  c.piezas({ listas: 5, total: 10 });
  assert.equal(p.props["--p"], String(ETAPAS.vista), "sin bienvenida las piezas no mueven las líneas (el 55 % de la vista manda)");
  assert.equal(sitios[0].textContent, "5 de 10 piezas"); assert.equal(sitios[1].textContent, "5 de 10 piezas");
  c.etapa("bienvenida");
  assert.equal(c.fraccion(), ETAPAS.bienvenida + (TRAMO_PIEZAS.hasta - TRAMO_PIEZAS.desde) * 0.5);
  c.piezas({ listas: 10, total: 10 });
  assert.equal(p.props["--p"], String(TRAMO_PIEZAS.hasta));
  c.piezas({ listas: 10, total: 20 }); // new pieces join the count (a late placement)
  assert.equal(p.props["--p"], String(TRAMO_PIEZAS.hasta), "el trazo no vuelve atrás");
  assert.equal(sitios[0].textContent, "10 de 20 piezas", "…pero el texto dice la verdad");
  c.etapa("listo"); assert.equal(p.props["--p"], "1");
});

test("C: fraccionCarga con piezas: sin bienvenida o sin piezas no cambia; con todo listo no pasa del tramo", () => {
  assert.equal(fraccionCarga(["vista"], { listas: 9, total: 10 }), ETAPAS.vista);
  assert.equal(fraccionCarga(["bienvenida"], { listas: 0, total: 0 }), ETAPAS.bienvenida);
  assert.equal(fraccionCarga(["bienvenida"], null), ETAPAS.bienvenida);
  assert.equal(fraccionCarga(["bienvenida"], { listas: 10, total: 10 }), TRAMO_PIEZAS.hasta);
  assert.equal(fraccionCarga(["bienvenida", "mundo"], { listas: 0, total: 10 }), ETAPAS.mundo, "el suelo ya hecho no baja");
});

test("C: el HTML trae el sitio del recuento en las dos pantallas (luna y malla)", () => {
  const html = readFileSync(new URL("../apps/plaza/index.html", import.meta.url), "utf8");
  assert.equal((html.match(/class="c-piezas"/g) ?? []).length, 2);
});

test("sin pantalla (null) no revienta", () => {
  const c = crearProgresoMalla(null); c.activar(); c.etapa("vista");
  assert.equal(c.activa(), false);
});

test("el HTML cumple la regla de peso: ≤20 líneas, sin imágenes ni scripts ni urls, solo colores de la casa, y reduce-motion lo respeta", () => {
  const html = readFileSync(new URL("../apps/plaza/index.html", import.meta.url), "utf8");
  const svg = html.match(/<svg class="c-malla"[\s\S]*?<\/svg>/)?.[0] ?? "";
  assert.ok(svg, "hay un SVG de la malla");
  const lineas = svg.match(/<path /g)?.length ?? 0;
  assert.ok(lineas > 0 && lineas <= 20, `líneas ${lineas}`);
  assert.ok(!/<image|<script|href=|url\(/.test(svg));
  const css = html.slice(html.indexOf("H4: only for a world"), html.indexOf(".solo-lector {"));
  assert.ok(!/url\(|@import|<img/.test(css));
  const hex = new Set((css.match(/#[0-9a-f]{6}\b/gi) ?? []).map((h) => h.toLowerCase()));
  for (const h of hex) assert.ok(["#14110f", "#018ea1", "#a6dad5", "#efa517"].includes(h), `color fuera de la casa ${h}`);
  assert.match(css, /prefers-reduced-motion: reduce\)[^}]*#carga\.eb \{ transition: none; \}/);
  assert.match(css, /#carga \.c-malla, #carga \.c-pie \{ display: none; \}/); // off unless «eb»
});

test("/status dice espacioBase solo si el mundo lo tiene encendido (server.ts)", () => {
  const src = readFileSync(new URL("../packages/server/src/server.ts", import.meta.url), "utf8");
  assert.match(src, /k === "espacio-base:mundo"\) return \(v as \{ activa\?: boolean \}\)\.activa !== false; return false;/);
  assert.match(src, /espacioBaseActivo\(\) \? \{ espacioBase: true \} : \{\}/);
});
