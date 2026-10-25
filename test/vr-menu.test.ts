// Rediseño v2 (story E): the VR watch and menu as numbers. The watch's gesture (muneca-gesto.ts: back of the wrist
// towards the eyes, with hysteresis), its buttons and fingertip press (menu-vr.ts), the menu's geometry, hit tests and
// sections (menu-vr.ts), and the menu's behaviour with a fake canvas (menu-invocado.ts). The painted look is judged in
// the canvases' pictures (ux/rediseno-v2/despues/vr-*.png) and, one day, on a Quest.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";
import { ABRIR, CERRAR, PERDIDA_MS, inicio, paso, cumpleAbrir, normalDorsoLocal, type Muestra } from "../packages/render/src/muneca-gesto.ts";
import {
  MENU, LIENZO, SECCIONES, ETIQUETAS, ICONOS, CABECERA, ID_CERRAR, ID_SALIR, idSeccion, idBoton, seccionDeId, cajaCerrar, cajaSalir, cajasLista, zonaDe,
  medidas, colocarMenu, demasiadoLejos, filasCaben, rectFila, botonesFila, paginar, RELOJ, DISCO, circulosReloj, botonRelojEn, metrosAPxReloj,
  toqueInicio, toquePaso, TOQUE, siguienteValor, textoValor, hhmm, type Rect,
} from "../packages/render/src/menu-vr.ts";
import { createMenuInvocado, SALIR_PIDE_MS, type Proveedor } from "../packages/render/src/menu-invocado.ts";
import { medirReloj, type ManoMenu } from "../packages/render/src/muneca.ts";

// a canvas the panels can draw on without a browser (the texture is never uploaded here)
const lienzoFalso = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (_t, k) => (k === "measureText" ? () => ({ width: 10 }) : k === "getImageData" ? () => ({ data: new Uint8ClampedArray(4) }) : () => undefined), set: () => true }) });
(globalThis as { document?: unknown }).document ??= { createElement: lienzoFalso };

const mirando: Muestra = { dorso: 0.9, anguloGrados: 10, distanciaM: 0.4 };   // the back of the wrist towards you, like a watch
const bajada: Muestra = { dorso: -0.2, anguloGrados: 60, distanciaM: 0.7 };   // arm down by your side
const girada: Muestra = { dorso: 0.1, anguloGrados: 10, distanciaM: 0.4 };    // still in view, the back turned away
const fuera: Muestra = { dorso: 0.9, anguloGrados: 75, distanciaM: 0.4 };     // the back towards you, but out of view

// ── the watch: when it shows ───────────────────────────────────────────────────────────────────────────────────────
test("watch: shows only after ABRIR.ms of looking; a glance shorter than that does not", () => {
  let e = inicio();
  e = paso(e, mirando, 1000); assert.equal(e.abierto, false);
  e = paso(e, mirando, 1000 + ABRIR.ms - 1); assert.equal(e.abierto, false);
  e = paso(e, mirando, 1000 + ABRIR.ms); assert.equal(e.abierto, true);
  let g = inicio();
  g = paso(g, mirando, 0); g = paso(g, bajada, 100); g = paso(g, mirando, 120); g = paso(g, mirando, 120 + ABRIR.ms - 1);
  assert.equal(g.abierto, false, "the streak breaks when any condition fails");
});
test("watch: the back must face the eyes within 60°, the wrist 0.2–0.6 m away inside the cone (ABRIR.conoGrados)", () => {
  assert.equal(cumpleAbrir({ dorso: Math.cos((59 * Math.PI) / 180), anguloGrados: 10, distanciaM: 0.4 }), true);
  assert.equal(cumpleAbrir({ dorso: Math.cos((61 * Math.PI) / 180), anguloGrados: 10, distanciaM: 0.4 }), false);
  assert.equal(cumpleAbrir({ ...mirando, distanciaM: 0.15 }), false, "too close to the face");
  assert.equal(cumpleAbrir({ ...mirando, distanciaM: 0.65 }), false, "arm stretched out");
  assert.equal(cumpleAbrir({ ...mirando, anguloGrados: ABRIR.conoGrados - 1 }), true, "inside the cone");
  assert.equal(cumpleAbrir({ ...mirando, anguloGrados: ABRIR.conoGrados + 1 }), false, "outside the cone");
});
test("watch: hysteresis — a wobble between 60° and 75° never hides it; it hides after CERRAR.ms turned away", () => {
  let e = paso(paso(inicio(), mirando, 0), mirando, ABRIR.ms);
  assert.equal(e.abierto, true);
  const vacila: Muestra = { dorso: 0.35, anguloGrados: 20, distanciaM: 0.4 }; // 69°: under the opening threshold, over the closing one
  for (let t = 1000; t < 5000; t += 50) e = paso(e, vacila, t);
  assert.equal(e.abierto, true, "no flicker");
  let h = inicio(); for (let t = 0; t < 3000; t += 50) h = paso(h, vacila, t);
  assert.equal(h.abierto, false, "and a hidden watch does not open on that wobble either");
  const t = 6000; e = paso(e, girada, t); assert.equal(e.abierto, true);
  e = paso(e, girada, t + CERRAR.ms - 1); assert.equal(e.abierto, true);
  e = paso(e, girada, t + CERRAR.ms); assert.equal(e.abierto, false);
});
test("watch: leaving the wide cone hides it after CERRAR.fueraMs; a lost hand keeps it PERDIDA_MS", () => {
  let e = paso(paso(inicio(), mirando, 0), mirando, ABRIR.ms);
  e = paso(e, fuera, 1000); e = paso(e, fuera, 1000 + CERRAR.fueraMs - 1); assert.equal(e.abierto, true);
  e = paso(e, fuera, 1000 + CERRAR.fueraMs); assert.equal(e.abierto, false);
  let l = paso(paso(inicio(), mirando, 0), mirando, ABRIR.ms);
  l = paso(l, mirando, 2000);
  l = paso(l, null, 2000 + PERDIDA_MS - 1); assert.equal(l.abierto, true);
  l = paso(l, null, 2000 + PERDIDA_MS); assert.equal(l.abierto, false);
  assert.equal(paso(inicio(), null, 5).abierto, false);
});
const mano = (p: [number, number, number], q: THREE.Quaternion, lado: "izq" | "der" = "izq", esMano = false): ManoMenu => ({ posicion: new THREE.Vector3(...p), rotacion: q, esMano, lado });
test("medirReloj: a left controller whose back faces the eyes reads dorso ≈ 1; turned the other way ≈ −1", () => {
  const ojo = new THREE.Vector3(0, 1.6, 0), mira = new THREE.Vector3(0, -1, -1).normalize();
  const dir = new THREE.Vector3(0, 0.4, 0.4).normalize(); // wrist → eye
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...normalDorsoLocal("izq", false)), dir);
  const m = medirReloj(ojo, mira, mano([0, 1.2, -0.4], q));
  assert.ok(m.dorso > 0.99, `dorso ${m.dorso}`);
  assert.ok(Math.abs(m.distanciaM - Math.hypot(0.4, 0.4)) < 1e-6);
  assert.ok(m.anguloGrados < 5);
  assert.equal(cumpleAbrir(m), true);
  const q2 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...normalDorsoLocal("izq", false)), dir.clone().negate());
  assert.ok(medirReloj(ojo, mira, mano([0, 1.2, -0.4], q2)).dorso < -0.99);
  const q3 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); // a tracked hand: wrist +Y is the back
  assert.ok(medirReloj(ojo, mira, mano([0, 1.2, -0.4], q3, "izq", true)).dorso > 0.99);
});

// ── the watch: its buttons (p6) ────────────────────────────────────────────────────────────────────────────────────
test("watch buttons: «Menú» in the centre, micro top, camera right, notices bottom, city left — only with a city", () => {
  const c = RELOJ.lienzo / 2;
  const con = circulosReloj(true), sin = circulosReloj(false);
  assert.deepEqual(con.map((b) => b.id), ["menu", "micro", "camara", "avisos", "ciudad"]);
  assert.deepEqual(sin.map((b) => b.id), ["menu", "micro", "camara", "avisos"], "no city: its place is not drawn");
  const en = (id: string) => con.find((b) => b.id === id)!;
  assert.equal(en("menu").cx, c); assert.equal(en("menu").cy, c);
  assert.ok(en("micro").cy < c && Math.abs(en("micro").cx - c) < 1e-9, "micro on top");
  assert.ok(en("camara").cx > c, "camera right"); assert.ok(en("avisos").cy > c, "notices bottom"); assert.ok(en("ciudad").cx < c, "city left");
  for (const b of con) assert.ok(Math.hypot(b.cx - c, b.cy - c) + b.r <= DISCO.r, `${b.id} inside the disc`);
  for (let i = 0; i < con.length; i++) for (let j = i + 1; j < con.length; j++) {
    const a = con[i], b = con[j];
    assert.ok(Math.hypot(a.cx - b.cx, a.cy - b.cy) > a.r + b.r + TOQUE.margenPx * 2 - 1e-9, `${a.id}/${b.id} apart, even with the fingertip's slack`);
  }
  const m = RELOJ.diametroM / RELOJ.lienzo; // in the world: «Menú» ≥ 3.5 cm across, the others ≥ 2 cm (a fingertip is ~1.6 cm)
  assert.ok(en("menu").r * 2 * m >= 0.035); assert.ok(en("micro").r * 2 * m >= 0.02);
});
test("watch hit test: the centre is «Menú», a point between buttons is nothing, the city's place without a city is nothing", () => {
  const c = RELOJ.lienzo / 2;
  assert.equal(botonRelojEn(c, c, true), "menu");
  assert.equal(botonRelojEn(c, c - DISCO.orbita, true), "micro");
  assert.equal(botonRelojEn(c + DISCO.orbita, c, true), "camara");
  assert.equal(botonRelojEn(c, c + DISCO.orbita, true), "avisos");
  assert.equal(botonRelojEn(c - DISCO.orbita, c, true), "ciudad");
  assert.equal(botonRelojEn(c - DISCO.orbita, c, false), null);
  const d = DISCO.orbita / Math.SQRT2;
  assert.equal(botonRelojEn(c + d, c - d, true), null, "between micro and camera");
  const [px, py] = metrosAPxReloj(0, 0.01); assert.equal(px, c); assert.ok(py < c, "metres on the disc: +y is up");
});
test("watch «Grabar»: drawn only where the Graboso is, between the camera and the notices, never touching a neighbour", () => {
  const c = RELOJ.lienzo / 2;
  assert.deepEqual(circulosReloj({ ciudad: true }).map((b) => b.id), ["menu", "micro", "camara", "avisos", "ciudad"], "no Graboso: no button");
  assert.deepEqual(circulosReloj(true).map((b) => b.id), ["menu", "micro", "camara", "avisos", "ciudad"], "a plain boolean keeps its old meaning");
  const con = circulosReloj({ ciudad: true, graboso: true });
  assert.deepEqual(con.map((b) => b.id), ["menu", "micro", "camara", "graboso", "avisos", "ciudad"]);
  const g = con.find((b) => b.id === "graboso")!;
  assert.ok(g.cx > c && g.cy > c, "bottom right, between camera and notices");
  assert.ok(Math.hypot(g.cx - c, g.cy - c) + g.r <= DISCO.r, "inside the disc");
  assert.ok(g.r * 2 * (RELOJ.diametroM / RELOJ.lienzo) >= 0.02, "at least 2 cm across");
  for (const b of con) if (b !== g) assert.ok(Math.hypot(g.cx - b.cx, g.cy - b.cy) > g.r + b.r + TOQUE.margenPx * 2 - 1e-9, `graboso/${b.id} apart, even with the fingertip's slack`);
  assert.equal(botonRelojEn(g.cx, g.cy, { ciudad: false, graboso: true }), "graboso");
  assert.equal(botonRelojEn(g.cx, g.cy, { ciudad: false, graboso: false }), null, "not drawn, not pressable");
  const r = toquePaso(toqueInicio(), { x: (g.cx - c) * (RELOJ.diametroM / RELOJ.lienzo), y: (c - g.cy) * (RELOJ.diametroM / RELOJ.lienzo), z: 0.01 }, { ciudad: false, graboso: true }, 1000);
  assert.equal(r.pulsado, "graboso");
});
test("watch fingertip: a press needs < 1.5 cm over a button, fires once, re-arms only after leaving, never twice in TOQUE.ms", () => {
  const s = RELOJ.diametroM / RELOJ.lienzo, yMicro = DISCO.orbita * s; // micro, in disc metres (y up)
  let e = toqueInicio();
  let r = toquePaso(e, { x: 0, y: yMicro, z: 0.05 }, true, 0); assert.equal(r.pulsado, null, "5 cm away"); e = r.estado;
  r = toquePaso(e, { x: 0, y: yMicro, z: 0.012 }, true, 100); assert.equal(r.pulsado, "micro"); e = r.estado;
  r = toquePaso(e, { x: 0, y: yMicro, z: 0.005 }, true, 200); assert.equal(r.pulsado, null, "held: no repeat"); e = r.estado;
  r = toquePaso(e, { x: 0, y: yMicro, z: 0.04 }, true, 300); e = r.estado; assert.equal(e.armado, true, "left beyond 3 cm: re-armed");
  r = toquePaso(e, { x: 0, y: yMicro, z: 0.01 }, true, 400); assert.equal(r.pulsado, null, "too soon after the last press"); e = r.estado;
  r = toquePaso(e, { x: 0, y: yMicro, z: 0.01 }, true, 100 + TOQUE.ms); assert.equal(r.pulsado, "micro"); e = r.estado;
  r = toquePaso(e, null, true, 2000); assert.equal(r.estado.armado, true, "no fingertip: re-armed");
  assert.equal(toquePaso(toqueInicio(), { x: 0, y: 0, z: 0.01 }, true, 5000).pulsado, "menu");
  assert.equal(toquePaso(toqueInicio(), { x: -DISCO.orbita * s, y: 0, z: 0.01 }, false, 5000).pulsado, null, "no city button to press");
});

// ── the menu: geometry and hit tests (p7) ──────────────────────────────────────────────────────────────────────────
test("menu sections: the computer's seven, in its order, then Chat (v7), each with a name and a house icon", () => {
  assert.deepEqual(SECCIONES.map((s) => ETIQUETAS[s]), ["Tú", "Gente", "Bolsa", "Misiones", "Dónde estoy", "Construir", "Ajustes", "Chat"]);
  for (const s of SECCIONES) assert.ok(ICONOS[s]);
  assert.ok(!SECCIONES.some((s) => /salir|mandos/i.test(ETIQUETAS[s])), "«Salir de VR» is a header button, not a section");
  assert.equal(seccionDeId(idSeccion(0)), "tu"); assert.equal(seccionDeId(idSeccion(6)), "ajustes"); assert.equal(seccionDeId(idSeccion(7)), "chat"); assert.equal(seccionDeId(idSeccion(8)), null);
});
test("menu geometry: 1.0 × 0.611 m at 1.2 m; header and list targets ≥ 2.5° and ≥ 5 mm apart; all inside the canvas", () => {
  assert.equal(MENU.distM, 1.2);
  assert.ok(Math.abs(MENU.altoM / MENU.anchoM - LIENZO.h / LIENZO.w) < 0.001, "the canvas has the plane's proportions");
  const { minGrados, minSeparacionMm } = medidas();
  assert.ok(minGrados >= 2.5, `min ${minGrados}°`); assert.ok(minSeparacionMm >= 5, `sep ${minSeparacionMm} mm`);
  for (const c of [cajaCerrar(), cajaSalir(), ...cajasLista()]) {
    assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= LIENZO.w && c.y + c.h <= LIENZO.h);
    assert.ok(c.h >= 84, "52-56 px on the computer ≈ 84 px here (58 mm at 1.2 m)");
  }
  assert.ok(cajaSalir().x + cajaSalir().w < cajaCerrar().x, "«Salir de VR» next to the X, left of it");
  const l = cajasLista(); assert.ok(l[l.length - 1].y + l[l.length - 1].h <= LIENZO.h, "the eight rows fit");
  assert.ok(l[0].y >= CABECERA.h, "the list starts under the header");
});
test("menu hit test: zonaDe maps uv (v up) to the X, «Salir», a section, a content button, or 0", () => {
  const cen = (r: Rect): [number, number] => [(r.x + r.w / 2) / LIENZO.w, 1 - (r.y + r.h / 2) / LIENZO.h];
  assert.equal(zonaDe(...cen(cajaCerrar())), ID_CERRAR);
  assert.equal(zonaDe(...cen(cajaSalir())), ID_SALIR);
  cajasLista().forEach((c, i) => assert.equal(zonaDe(...cen(c)), idSeccion(i)));
  const b: Rect = { x: 900, y: 400, w: 120, h: 84 };
  assert.equal(zonaDe(...cen(b), [b]), idBoton(0));
  assert.equal(zonaDe(...cen(b)), 0, "no buttons given: nothing");
  assert.equal(zonaDe(0.005, 0.995), 0, "the corner is nothing");
  assert.equal(zonaDe(...cen(cajasLista()[5]), [], new Set(["construir"])), 0, "a disabled section cannot be pressed");
});
test("menu rows: rows stack under the title, buttons sit at the row's right end, pages clamp", () => {
  const f0 = rectFila(0, 64), f1 = rectFila(1, 64);
  assert.ok(f1.y > f0.y + f0.h);
  const bs = botonesFila(f0, [200, 84]);
  assert.equal(bs.length, 2); assert.equal(bs[1].x + bs[1].w, f0.x + f0.w); assert.ok(bs[0].x + bs[0].w < bs[1].x);
  assert.ok(botonesFila(f0, [10])[0].w >= 84, "never narrower than a fingertip target");
  assert.ok(filasCaben(64) >= 5); assert.ok(filasCaben(64, true) < filasCaben(64));
  const p = paginar([1, 2, 3, 4, 5, 6, 7], 3, 9);
  assert.deepEqual([p.pagina, p.paginas, p.filas], [2, 3, [7]]);
});
test("menu placement: colocarMenu puts it 1.2 m away, 12° under the eyes, along the flattened gaze; 2 m away closes", () => {
  const ojo = { x: 0, y: 1.6, z: 0 };
  const p = colocarMenu(ojo, { x: 0, z: -1 })!;
  assert.ok(Math.abs(Math.hypot(p.x, p.y - 1.6, p.z) - 1.2) < 1e-9);
  assert.ok(p.y < 1.6 && Math.abs((Math.atan2(1.6 - p.y, -p.z) * 180) / Math.PI - MENU.bajoGrados) < 1e-9);
  assert.equal(colocarMenu(ojo, { x: 0, z: 0 }), null);
  assert.equal(demasiadoLejos(ojo, p), false); assert.equal(demasiadoLejos({ x: 0, y: 1.6, z: 1 }, p), true);
});
test("settings rows: −/+ move a number within its limits, cycle an option list, flip a switch; the value in words", () => {
  const n = { tipo: "numero", valor: 90, min: 40, max: 100, paso: 10, unidad: "%" };
  assert.equal(siguienteValor(n, 1), 100); assert.equal(siguienteValor({ ...n, valor: 100 }, 1), 100); assert.equal(siguienteValor({ ...n, valor: 40 }, -1), 40);
  const o = { tipo: "eleccion", valor: "30", opciones: [{ valor: "15", nombre: "15°" }, { valor: "30", nombre: "30°" }, { valor: "45", nombre: "45°" }] };
  assert.equal(siguienteValor(o, 1), "45"); assert.equal(siguienteValor({ ...o, valor: "45" }, 1), "15"); assert.equal(siguienteValor({ ...o, valor: "15" }, -1), "45");
  assert.equal(siguienteValor({ tipo: "booleano", valor: false }, 1), true);
  assert.equal(textoValor(o), "30°"); assert.equal(textoValor(n), "90 %"); assert.equal(textoValor({ tipo: "booleano", valor: true }), "Sí");
  assert.equal(hhmm(new Date(2026, 9, 20, 9, 5)), "09:05");
});

// ── the menu: behaviour ───────────────────────────────────────────────────────────────────────────────────────────
function menuDePrueba() {
  const reloj = { t: 1000 }, hecho = { salir: 0, cerrado: 0, abiertas: [] as string[], pulsados: 0, ir: 0 };
  const escena = new THREE.Scene();
  const m = createMenuInvocado({ scene: escena, ahora: () => reloj.t, salir: () => { hecho.salir++; }, alCerrar: () => { hecho.cerrado++; }, alPulsar: () => { hecho.pulsados++; } });
  const proveedor: Proveedor = {
    contenido: (v) => v === "gente"
      ? { tipo: "lista", titulo: "Gente aquí", vacio: "nadie", filas: [{ texto: "Ana", botones: [{ texto: "Ir a su lado", accion: () => { hecho.ir++; } }] }] }
      : v === "tu" ? { tipo: "tu", nombre: "Pablo", linea: "", chip: { texto: "Estable", tono: "ok" }, reserva: "2 objetos", carga: null, insignias: [], retrato: null }
      : { tipo: "lista", vacio: `vacío ${v}`, filas: [] },
    desactivadas: () => new Set(["construir"]),
    alAbrir: (v) => { hecho.abiertas.push(v); },
  };
  m.proveedor(proveedor);
  return { m, reloj, hecho, ojo: new THREE.Vector3(0, 1.6, 0), mira: new THREE.Vector3(0, 0, -1) };
}
const pulsa = (m: ReturnType<typeof createMenuInvocado>, id: number) => { const p = m.paneles()[0]; assert.ok(p, "the panel is open"); p.pulsar!(id); };

test("menu: opens 1.2 m in front facing the eyes and stays still while the player moves; «Menú» again closes it", () => {
  const { m, ojo, mira, hecho } = menuDePrueba();
  assert.equal(m.abierto, false); assert.deepEqual(m.paneles(), []);
  assert.equal(m.alternar(ojo, mira), true);
  const p0 = m.malla.position.clone(), q0 = m.malla.quaternion.clone();
  assert.ok(Math.abs(p0.distanceTo(ojo) - 1.2) < 1e-9);
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(m.malla.quaternion), haciaOjo = ojo.clone().sub(p0).normalize();
  assert.ok(n.dot(haciaOjo) > 0.999, "the glass faces the eyes (so it leans back: it is under them)");
  m.update(new THREE.Vector3(0.5, 1.6, 0.3)); m.update(new THREE.Vector3(-0.4, 1.7, -0.2));
  assert.ok(m.malla.position.equals(p0) && m.malla.quaternion.equals(q0), "does not follow the head");
  assert.equal(m.alternar(ojo, mira), false); assert.equal(m.malla.visible, false); assert.equal(hecho.cerrado, 1);
});
test("menu: the list changes section (asking the page), a disabled one does not, the X closes, walking 2 m away closes", () => {
  const { m, ojo, mira, hecho } = menuDePrueba();
  m.abrir(ojo, mira);
  assert.equal(m.vista, "tu");
  pulsa(m, idSeccion(1)); assert.equal(m.vista, "gente"); assert.ok(hecho.abiertas.includes("gente"));
  pulsa(m, idSeccion(5)); assert.equal(m.vista, "gente", "Construir is disabled here");
  const e = m.estado();
  assert.equal(e.secciones.length, 8); assert.equal(e.secciones.find((s) => s.id === "construir")!.activa, false);
  assert.deepEqual(e.filas, ["Ana"]);
  pulsa(m, idBoton(0)); assert.equal(hecho.ir, 1, "«Ir a su lado» runs the page's action");
  assert.ok(hecho.pulsados >= 3, "every press asks for the click sound");
  pulsa(m, ID_CERRAR); assert.equal(m.abierto, false);
  m.abrir(ojo, mira); m.update(new THREE.Vector3(0, 1.6, 0.7)); assert.equal(m.abierto, true);
  m.update(new THREE.Vector3(0, 1.6, 2.5)); assert.equal(m.abierto, false);
  m.abrir(ojo, mira, "avisos"); assert.equal(m.vista, "avisos", "the watch's notices open straight there");
});
test("menu: «Salir de VR» asks first and leaves on a second press within SALIR_PIDE_MS; a late one only asks again", () => {
  const { m, ojo, mira, hecho, reloj } = menuDePrueba();
  m.abrir(ojo, mira);
  pulsa(m, ID_SALIR); assert.equal(hecho.salir, 0);
  reloj.t += SALIR_PIDE_MS + 1; pulsa(m, ID_SALIR); assert.equal(hecho.salir, 0, "too late: it asks again");
  reloj.t += 500; pulsa(m, ID_SALIR); assert.equal(hecho.salir, 1); assert.equal(m.abierto, false);
});
test("menu: the ray's hit test (fila) finds header, list and content buttons; pressing while closed does nothing", () => {
  const { m, ojo, mira, hecho } = menuDePrueba();
  m.abrir(ojo, mira, "gente");
  const p = m.paneles()[0];
  const uv = (r: Rect) => new THREE.Vector2((r.x + r.w / 2) / LIENZO.w, 1 - (r.y + r.h / 2) / LIENZO.h);
  assert.equal(p.fila(uv(cajaCerrar())), ID_CERRAR);
  assert.equal(p.fila(uv(cajasLista()[3])), idSeccion(3));
  assert.equal(p.fila(uv(cajasLista()[5])), 0, "disabled");
  assert.ok(m.zonaMundo(idSeccion(0)), "each zone has a place in the world (for the e2e)");
  m.cerrar(); m.pulsar(idBoton(0)); assert.equal(hecho.ir, 0);
  assert.equal(m.abrir(ojo, new THREE.Vector3(0, -1, 0)), false, "no front when looking straight down");
});

// t_022e9bc1 (U-reloj in the headset): the HTML #reloj is not drawn in VR, so the wrist watch and the menu's header carry the time.
test("VR clock: horaVR follows interfaz.hora (local/UTC); the watch paints the time under «Menú», the menu header beside it", async () => {
  const { horaVR } = await import("../packages/client/src/reloj.ts");
  const { dibujarReloj } = await import("../packages/render/src/muneca.ts");
  const t = Date.UTC(2026, 9, 18, 22, 14, 59);
  assert.equal(horaVR(t, "utc"), "22:14 UTC");
  assert.match(horaVR(t, "local"), /^\d\d:\d\d$/);
  assert.equal(horaVR(t, "marte"), horaVR(t, "local"), "an unknown value is local, like the HUD");
  const pinta = (hora?: string) => {
    const textos: string[] = [];
    const g = new Proxy({}, { get: (_t, k) => (k === "fillText" ? (s: string) => { textos.push(s); } : k === "measureText" ? () => ({ width: 10 }) : () => undefined), set: () => true }) as unknown as CanvasRenderingContext2D;
    dibujarReloj(g, { micro: null, camara: false, avisos: 0, ciudad: false, menuAbierto: false, ...(hora ? { hora } : {}) }, null);
    return textos;
  };
  assert.deepEqual(pinta("21:40").filter((x) => x !== "Menú"), ["21:40"], "the time is drawn once");
  assert.ok(pinta("21:40").includes("Menú"));
  assert.deepEqual(pinta(), ["Menú"], "no time given = the watch as before");
});

test("VR clock: the menu repaints when the minute changes (and not before), a throwing clock does not break the menu", () => {
  const { m, reloj, ojo, mira } = menuDePrueba();
  let hora = "21:40", rompe = false;
  const base = { contenido: () => ({ tipo: "lista" as const, vacio: "x", filas: [] }), desactivadas: () => new Set<never>(), hora: () => { if (rompe) throw new Error("no clock"); return hora; } };
  m.proveedor(base);
  m.alternar(ojo, mira);
  const pinturas = () => m.estado().pinturas;
  const p0 = pinturas();
  reloj.t += 500; m.update(ojo); assert.equal(pinturas(), p0, "same minute: no repaint");
  hora = "21:41"; reloj.t += 500; m.update(ojo); assert.equal(pinturas(), p0 + 1, "a new minute: one repaint");
  rompe = true; hora = "21:42"; reloj.t += 500; m.update(ojo); assert.ok(pinturas() >= p0 + 1, "a broken clock paints the menu without it");
});
