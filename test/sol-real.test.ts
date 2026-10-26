// D-076: the sun that follows the real one. Pure sun maths (packages/render/src/sol-real.ts) against known sky facts, and the consent flow
// (apps/plaza/sol-real.ts): the place is asked only when the world offers it AND the player switched it on; declining switches it back off;
// the place is rounded at once; nothing is stored or sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { posicionSol, zonaAproximada, posicionValida } from "../packages/render/src/sol-real.ts";
import { decidirSolReal, montarSolReal } from "../apps/plaza/sol-real.ts";

const cerca = (a: number, b: number, tol: number, msg: string) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const dia = (anio: number, mes: number, d: number) => Date.UTC(anio, mes - 1, d);
/** The highest the sun gets that day at a place (scanning every 2 minutes), and its bearing then. */
function mediodia(fecha: number, lat: number, lon: number) {
  let mejor = { altura: -99, rumbo: 0, hora: 0 }, t = 0;
  for (let m = 0; m < 1440; m += 2) { const s = posicionSol(fecha + m * 60000, lat, lon); if (s.altura > mejor.altura) { mejor = s; t = m; } }
  return { ...mejor, minutoUTC: t };
}

test("solar noon: Madrid at the June solstice is ~73° up due south; Sydney at the December solstice ~79° due north; the equator at the equinox is overhead", () => {
  const mad = mediodia(dia(2026, 6, 21), 40, -4);
  cerca(mad.altura, 90 - 40 + 23.44, 0.7, "Madrid altura");
  assert.ok(Math.abs(Math.abs(mad.rumbo) - 180) < 3, `Madrid rumbo ${mad.rumbo} (south = ±180)`);
  cerca(mad.minutoUTC, 12 * 60 + 16 + 2, 8, "Madrid solar noon in UTC minutes (12:00 + 4 min/° × 4°W − the equation of time)");
  const syd = mediodia(dia(2026, 12, 21), -34, 151);
  cerca(syd.altura, 90 - 34 + 23.44, 0.7, "Sydney altura");
  assert.ok(Math.abs(syd.rumbo) < 10, `Sydney rumbo ${syd.rumbo} (north = 0; the bearing swings fast near the zenith)`);
  const ecu = mediodia(dia(2026, 3, 20), 0, 0);
  assert.ok(ecu.altura > 87, `equator at the equinox ${ecu.altura}`);
});

test("the day goes east → south → west, and night is below the horizon", () => {
  // Madrid in spring: solar hour 6 east-ish and rising, 18 west-ish and setting
  const manana = posicionSol(dia(2026, 3, 20) + (12 * 60 + 16 - 6 * 60) * 60000, 40, -4);
  cerca(manana.rumbo, 90, 8, "equinox dawn bearing is east (+90)"); assert.ok(manana.altura > -2 && manana.altura < 8, `dawn altura ${manana.altura}`);
  const tarde = posicionSol(dia(2026, 3, 20) + (12 * 60 + 16 + 6 * 60) * 60000, 40, -4);
  cerca(tarde.rumbo, -90, 8, "equinox dusk bearing is west (-90)");
  const noche = posicionSol(dia(2026, 3, 20) + 16 * 60000, 40, -4); // 00:16 UTC = about solar midnight
  assert.ok(noche.altura < -40, `midnight ${noche.altura}`);
  cerca((noche.hora + 12) % 24, 12, 0.3, "solar hour at solar midnight (0 ≡ 24)");
  const alba = posicionSol(dia(2026, 3, 20) + (12 * 60 + 16 - 6 * 60) * 60000, 40, -4);
  cerca(alba.hora, 6, 0.3, "solar hour at dawn");
});

test("the place is rounded to a whole degree BEFORE use; two nearby places give the same sun", () => {
  assert.deepEqual(zonaAproximada(40.4168, -3.7038), { lat: 40, lon: -4 });
  assert.deepEqual(zonaAproximada(-33.8688, 151.2093), { lat: -34, lon: 151 });
  assert.deepEqual(zonaAproximada(91, 190), { lat: 90, lon: -170 }, "out of range is clamped / wrapped, never trusted");
  const t = dia(2026, 5, 5) + 9 * 3600000;
  assert.deepEqual(posicionSol(t, 40.4168, -3.7038), posicionSol(t, 40.0, -4.0), "the exact street does not change the answer");
  assert.equal(posicionValida(40, -4), true);
  for (const m of [[NaN, 0], [0, Infinity], [91, 0], [0, 181], ["1", 2], [null, undefined]]) assert.equal(posicionValida(m[0], m[1]), false, JSON.stringify(m));
});

test("decidirSolReal: ask only when accepted AND offered; follow once the zone is known; never ask twice at once", () => {
  const e = (acepta: boolean, ofrece: boolean, zona = false, pidiendo = false) => decidirSolReal({ acepta, ofrece, zona, pidiendo });
  assert.equal(e(false, true), "apagar"); assert.equal(e(true, false), "apagar"); assert.equal(e(false, false), "apagar");
  assert.equal(e(true, true), "pedir"); assert.equal(e(true, true, false, true), "seguir", "already asking: wait");
  assert.equal(e(true, true, true), "seguir"); assert.equal(e(false, true, true), "apagar", "switching it off forgets the sun");
});

function montaje(o: { acepta: boolean; ofrece: boolean; geo: "da" | "niega" | "sin" }) {
  const aj = new Map<string, unknown>([["graficos.solReal", o.acepta]]);
  const oyentes: ((id: string) => void)[] = [];
  const llamadas: ({ altura: number; rumbo: number; hora: number } | null)[] = [];
  const view = { entorno: { ofreceSolReal: o.ofrece, solReal: (s: { altura: number; rumbo: number; hora: number } | null) => { llamadas.push(s); return !!s; } } };
  const ajustes = { get: (id: string) => aj.get(id), set: (id: string, v: unknown) => { aj.set(id, v); oyentes.forEach((f) => f(id)); }, alCambiar: (f: (id: string) => void) => { oyentes.push(f); } };
  const preguntas: unknown[] = [], avisos: string[] = [];
  const geo = o.geo === "sin" ? null : { getCurrentPosition: (ok: (p: unknown) => void, no: (e: unknown) => void, opts: unknown) => { preguntas.push(opts); if (o.geo === "da") ok({ coords: { latitude: 40.4168, longitude: -3.7038, accuracy: 20 } }); else no({ code: 1 }); } };
  const m = montarSolReal({ view, ajustes, geo: geo as never, ahora: () => dia(2026, 6, 21) + 12 * 3600000, decir: (t) => avisos.push(t), cadaMs: 1e9 });
  return { m, aj, llamadas, preguntas, avisos, ajustes, view };
}

test("consent flow: the world does not offer it, or the player did not switch it on → the browser is never asked", () => {
  for (const [acepta, ofrece] of [[true, false], [false, true], [false, false]] as const) {
    const t = montaje({ acepta, ofrece, geo: "da" });
    assert.equal(t.preguntas.length, 0, `acepta=${acepta} ofrece=${ofrece}`);
    assert.equal(t.m.estado().solicitudes, 0); assert.equal(t.llamadas.filter(Boolean).length, 0, "the world's own sun stays");
    t.m.parar();
  }
});

test("consent flow: accepted → the zone (rounded) gives a sun, kept only in memory; nothing but the sun is handed to the render", () => {
  const t = montaje({ acepta: true, ofrece: true, geo: "da" });
  assert.equal(t.preguntas.length, 1); assert.deepEqual(t.preguntas[0], { enableHighAccuracy: false, maximumAge: 3600_000, timeout: 20_000 });
  assert.deepEqual(t.m.estado().zona, { lat: 40, lon: -4 }, "the exact place was dropped at once");
  const sol = t.llamadas.filter(Boolean).at(-1)!;
  assert.deepEqual(sol, posicionSol(dia(2026, 6, 21) + 12 * 3600000, 40, -4));
  assert.deepEqual(Object.keys(sol).sort(), ["altura", "hora", "rumbo"], "no coordinates travel with it");
  assert.equal(t.m.estado().siguiendo, true);
  // the player switches it off: back to the world's own sun, and the zone is forgotten
  t.ajustes.set("graficos.solReal", false);
  assert.equal(t.llamadas.at(-1), null); assert.equal(t.m.estado().zona, null); assert.equal(t.m.estado().siguiendo, false);
  t.m.parar();
});

test("consent flow: declined or no geolocation → the setting goes back off, a short note, the world's own sun stays", () => {
  const no = montaje({ acepta: true, ofrece: true, geo: "niega" });
  assert.equal(no.aj.get("graficos.solReal"), false); assert.equal(no.avisos.length, 1); assert.match(no.avisos[0], /sol sigue siendo el del mundo/);
  assert.equal(no.llamadas.filter(Boolean).length, 0); assert.equal(no.m.estado().zona, null); no.m.parar();
  const sin = montaje({ acepta: true, ofrece: true, geo: "sin" });
  assert.equal(sin.aj.get("graficos.solReal"), false); assert.equal(sin.avisos.length, 1); sin.m.parar();
});

test("the motor's settings all declare cleanly (the sun's and the effects' texts fit the limits)", async () => {
  const { crearAjustes } = await import("../packages/client/src/ajustes.ts");
  const { crearCapacidades } = await import("../packages/client/src/capacidades.ts");
  const { AJUSTES_MOTOR } = await import("../packages/client/src/ajustes-motor.ts");
  const registro: string[] = [];
  const a = crearAjustes({ capacidades: crearCapacidades({ entorno: true, "entorno.efectos": true } as never, { nivel: "A" }), guardado: { leer: () => null, escribir: () => {} }, mundo: null as never, registro: (l: string) => registro.push(l) } as never);
  assert.deepEqual(a.declarar(AJUSTES_MOTOR as never), []);
  assert.deepEqual(registro, []);
  assert.equal(a.get("graficos.solReal"), false, "off until the player chooses");
});
