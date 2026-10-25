// MIS-200 card t_a831692a: the VR controls sheet («mandos») must say what the bindings really do, and every line must
// fit on the panel (setPanel in vr.ts draws at most 8 lines, 2 rows each, and stops at y 392 of a 400 px canvas).
// The bindings themselves are read from packages/render/src/vr.ts: the Y (left) and B (right) branches of update().
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LINEAS_MANDOS } from "../apps/plaza/xr-mandos.ts";
import { envolver } from "../packages/render/src/vr.ts";

const VR = readFileSync(new URL("../packages/render/src/vr.ts", import.meta.url), "utf8");

test("la hoja de mandos: Y abre o cierra el menú, como dice la primera línea", () => {
  assert.match(LINEAS_MANDOS[0], /Y: abre o cierra el menú/);
  assert.doesNotMatch(LINEAS_MANDOS.join("\n"), /misión|ocultar/, "no quedan restos de la Y antigua (misión/ocultar)");
  // the binding behind it: the left hand's Y (buttons[5]) toggles the menu
  assert.match(VR, /else alternarMenu\(\);/, "la Y de la mano izquierda llama a alternarMenu()");
});

test("la hoja de mandos: B (derecha) cierra el menú o sale del diálogo, en ese orden", () => {
  const linea = LINEAS_MANDOS.find((l) => l.startsWith("A o X"));
  assert.ok(linea, "hay línea de A/X y B");
  assert.match(linea, /B: cerrar menú o diálogo/);
  assert.match(VR, /if \(src\.handedness === "right"\) \{ if \(!menu\.cerrar\(\)\) for \(const f of oyentes\.atras\) f\(\); \}/,
    "la B de la mano derecha cierra el menú y, si no hay menú, va a atrás (diálogo)");
});

test("la hoja de mandos: cabe en el panel (8 líneas, 2 filas cada una, hasta y 392)", () => {
  assert.ok(LINEAS_MANDOS.length <= 8, `${LINEAS_MANDOS.length} líneas: setPanel solo dibuja 8`);
  let y = 48, dibujadas = 0, totales = 0;
  LINEAS_MANDOS.forEach((l, i) => {
    const filas = envolver(l, i === 0 ? 34 : 42);
    totales += filas.length;
    for (const _ of filas.slice(0, 2)) { if (y < 392) dibujadas++; y += i === 0 ? 40 : 34; }
    y += 4;
  });
  assert.equal(dibujadas, totales, `filas que no caben: ${totales - dibujadas}`);
});
