// t_bdc2c2db: «Qué hay de nuevo» — the pure parts (no screen): picking the diary's last entries and deciding
// whether to show the card. docs/RUNLOG.md itself is fed in, to catch a format drift without a screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { novedadesDeRunlog, primeraFrase, debeMostrarNovedades } from "../packages/client/src/novedades.ts";

const DIARIO_SINTETICO = `# Diario de turnos

## 2026-10-18 09:00 · a · hecho
- Qué: primera cosa que pasó, con una frase corta.
- Números: 1 prueba.

## 2026-10-18 10:00 · b · bloqueada
- Qué: segunda cosa, una línea muy larga que no tiene ningún punto cerca del final y por eso se corta por longitud en vez de por punto, de verdad muy larga, sigue y sigue y sigue y sigue y sigue y sigue y sigue
- Números: n/a.

## 2026-10-18 11:00 · c · en curso
- Qué: tercera, sin frase con punto al final

## 2026-10-18 12:00 · d · hecho
- Números: esta entrada no tiene «Qué» y debe quedar fuera.

## 2026-10-18 13:00 · e · hecho
- Qué: la más nueva de todas, debe salir primera.
`;

test("novedadesDeRunlog: last 3 entries with «Qué», newest first, skipping the one without it", () => {
  const r = novedadesDeRunlog(DIARIO_SINTETICO, 3);
  assert.equal(r.length, 3);
  assert.equal(r[0], "la más nueva de todas, debe salir primera.");
  assert.ok(r[1].startsWith("tercera, sin frase con punto al final"));
  assert.ok(r[2].startsWith("segunda cosa, una línea muy larga"));
  assert.ok(r[2].endsWith("…")); // cut by length, not by a period
});

test("novedadesDeRunlog: fewer than n entries with «Qué» gives what there is, never throws", () => {
  assert.deepEqual(novedadesDeRunlog("# Diario\n\n## 2026-10-18 09:00 · solo · hecho\n- Qué: una sola.\n", 3), ["una sola."]);
  assert.deepEqual(novedadesDeRunlog("# vacío\n", 3), []);
});

test("primeraFrase: cuts at the first sentence end, or at the byte budget with an ellipsis", () => {
  assert.equal(primeraFrase("Una frase corta. Y otra que no debe salir."), "Una frase corta.");
  assert.equal(primeraFrase("sin punto final"), "sin punto final");
  const larga = "x".repeat(300);
  const corta = primeraFrase(larga, 20);
  assert.ok(corta.endsWith("…"));
  assert.ok(new TextEncoder().encode(corta).length <= 20);
});

test("debeMostrarNovedades: a different (or never seen) version shows it once", () => {
  assert.equal(debeMostrarNovedades("0.14.0", null), true);
  assert.equal(debeMostrarNovedades("0.14.0", "0.13.0"), true);
  assert.equal(debeMostrarNovedades("0.14.0", "0.14.0"), false);
});

test("the real docs/RUNLOG.md yields up to 3 non-empty novelties (catches a diary format drift)", () => {
  const diario = readFileSync(new URL("../docs/RUNLOG.md", import.meta.url), "utf8");
  const r = novedadesDeRunlog(diario, 3);
  assert.ok(r.length > 0 && r.length <= 3, `expected 1-3 items, got ${r.length}`);
  for (const t of r) assert.ok(t.length > 0 && new TextEncoder().encode(t).length <= 161, `item too long or empty: ${t}`);
});
