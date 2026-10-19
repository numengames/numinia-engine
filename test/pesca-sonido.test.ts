// pesca sounds: the trigger is a pure function of the phase change (nibble → tick, bite → knock, nothing else) and it
// sounds through the page's single door (sonar.ts bridge → sonidos.ts `sonarLocal`), once, with no Web Audio of its own.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sonidoDeFase, sonarFase, ID } from "../apps/plaza/pesca-sonido.ts";
import { puente } from "../apps/plaza/sonar.ts";
import type { Fase } from "../apps/plaza/pesca-sonido.ts";

const FASES: Fase[] = ["nada", "espera", "mordisqueo", "picada", "pelea"];

test("only entering «mordisqueo» ticks and entering «picada» knocks; every other change is silent", () => {
  for (const a of FASES) for (const b of FASES) {
    const esperado = a === b ? null : b === "mordisqueo" ? "mordisqueo" : b === "picada" ? "picada" : null;
    assert.equal(sonidoDeFase(a, b), esperado, `${a} → ${b}`);
  }
});

test("mordisqueo → pesca-mordisqueo, picada → pesca-picada, nada más", () => {
  const oidos: string[] = [];
  const f = (id: string) => { oidos.push(id); return true; };
  assert.equal(sonarFase("espera", "mordisqueo", f), "mordisqueo");
  assert.equal(sonarFase("mordisqueo", "picada", f), "picada");
  assert.equal(sonarFase("picada", "pelea", f), null);
  assert.equal(sonarFase("pelea", "nada", f), null);
  assert.equal(sonarFase("picada", "picada", f), null);
  assert.deepEqual(oidos, ["pesca-mordisqueo", "pesca-picada"]);
  assert.deepEqual(ID, { mordisqueo: "pesca-mordisqueo", picada: "pesca-picada" });
});

test("sin puerta montada (puente vacío) no falla; con ella, una sola vez por cambio de fase", () => {
  puente.sonar = null;
  assert.doesNotThrow(() => sonarFase("espera", "picada"));
  const oidos: string[] = [];
  puente.sonar = (id) => { oidos.push(id); return true; };
  sonarFase("espera", "picada"); sonarFase("picada", "picada");
  puente.sonar = null;
  assert.deepEqual(oidos, ["pesca-picada"]);
});

test("los dos ids tienen fila en el catálogo y receta de respaldo (no son ids inventados)", async () => {
  const { RECETAS } = await import("../packages/render/src/audio/sintesis.ts");
  const cat = JSON.parse(readFileSync(new URL("../features/sonido/catalogo.json", import.meta.url), "utf8")) as { sonidos: { id: string; bus: string; texto: string }[] };
  for (const id of Object.values(ID)) {
    assert.ok(RECETAS[id], `receta ${id}`);
    const fila = cat.sonidos.find((s) => s.id === id);
    assert.ok(fila, `fila ${id} en catalogo.json`);
    assert.equal(fila.bus, "efectos");
    assert.ok(fila.texto.length > 0, "texto accesible");
  }
});
