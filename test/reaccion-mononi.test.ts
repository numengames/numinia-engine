// Lote 5 · «los moñoñis de la plaza reaccionan al clic»: the hop (pure), which pieces hop together, and the click wiring.
import { test } from "node:test";
import assert from "node:assert/strict";
import { REACCION_MS, reaccionDe } from "../packages/render/src/reaccion.ts";
import { bolitas, piezasDeMoñoni } from "../features/espaciobase/bolitas.ts";
import { montarReaccionClic } from "../apps/plaza/reaccion-clic.ts";

test("reaccionDe: it rests before and after, rises, never goes under the ground, and ends settled", () => {
  assert.deepEqual(reaccionDe(0), { sube: 0, ancho: 1, alto: 1 });
  assert.deepEqual(reaccionDe(1), { sube: 0, ancho: 1, alto: 1 });
  let max = 0;
  for (let i = 1; i < 1000; i++) { const r = reaccionDe(i / 1000); assert.ok(r.sube >= 0 && r.ancho > 0.7 && r.alto > 0.7 && r.ancho < 1.3 && r.alto < 1.3, `x=${i / 1000} ${JSON.stringify(r)}`); max = Math.max(max, r.sube); }
  assert.ok(max >= 0.3 && max <= 0.4, `a visible hop (${max})`);
  const fin = reaccionDe(0.999);
  assert.ok(Math.abs(fin.ancho - 1) < 0.01 && Math.abs(fin.alto - 1) < 0.01, "no jump at the end");
  assert.ok(REACCION_MS >= 500 && REACCION_MS <= 1500);
});

test("piezasDeMoñoni: the body and the smile of the same moñoni, whichever is clicked; nothing for other things", () => {
  const w = bolitas("3", 2).map((s, i) => ({ id: `o${i}`, nombre: s.nombre }));
  w.push({ id: "logo", nombre: "Logo" }, { id: "mesa", nombre: "Moñoni mesa" });
  assert.equal(w.length, 6);
  assert.deepEqual(piezasDeMoñoni("o0", w).sort(), ["o0", "o1"]);
  assert.deepEqual(piezasDeMoñoni("o1", w).sort(), ["o0", "o1"], "the smile too");
  assert.deepEqual(piezasDeMoñoni("o2", w).sort(), ["o2", "o3"], "the second one is its own");
  assert.deepEqual(piezasDeMoñoni("logo", w), []);
  assert.deepEqual(piezasDeMoñoni("mesa", w), [], "only the numbered house moñonis");
  assert.deepEqual(piezasDeMoñoni("no-existe", w), []);
});

function pagina(construyendo = false) {
  const oyentes = new Map<string, (e: Record<string, number>) => void>();
  const lienzo = { addEventListener: (t: string, f: (e: Record<string, number>) => void) => { oyentes.set(t, f); } };
  const hops: string[][] = [], sonidos: string[] = [];
  const objetos = [{ id: "a", nombre: "Moñoni 1" }, { id: "b", nombre: "Moñoni 1 boca" }, { id: "c", nombre: "Logo" }];
  let picked: string | null = "a";
  montarReaccionClic({ view: { renderer: { domElement: lienzo as never }, pick: () => picked, reaccionar: (k) => { hops.push([...k]); return k.length; } }, objetos: () => objetos, construyendo: () => construyendo, sonar: (s) => sonidos.push(s) });
  const clic = (dx = 0, boton = 0) => { oyentes.get("pointerdown")!({ button: 0, clientX: 100, clientY: 100 }); oyentes.get("pointerup")!({ button: boton, clientX: 100 + dx, clientY: 100 }); };
  return { clic, hops, sonidos, apunta: (k: string | null) => { picked = k; } };
}

test("a click on a moñoni makes both its pieces hop and sounds; a click on something else, a drag, or the builder's click do nothing", () => {
  const p = pagina();
  p.clic();
  assert.deepEqual(p.hops, [["a", "b"]]); assert.deepEqual(p.sonidos, ["coger-soltar"]);
  p.clic(40); assert.equal(p.hops.length, 1, "a drag (the camera) is not a click");
  p.clic(0, 2); assert.equal(p.hops.length, 1, "other buttons do not count");
  p.apunta("c"); p.clic(); assert.equal(p.hops.length, 1, "the logo does not hop");
  p.apunta(null); p.clic(); assert.equal(p.hops.length, 1, "the sky");
  const c = pagina(true); c.clic(); assert.equal(c.hops.length, 0, "while building, a click selects");
});
