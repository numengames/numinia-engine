// Y25 «weight of a blow»: a hit pause (2-5 frames), a flash on the creature and a low thud — all presentation, all off (pause and
// flash) with «reduce motion». The «−N» text, the announcement and the sound never depend on it. The server is untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import type { ViewHooks } from "../packages/feature/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { lucha, ENFRIAMIENTO_TICKS } from "../features/lucha/feature.ts";
import { crearLucha } from "../features/lucha/server.ts";
import { crearCliente, FLASH_MS } from "../features/lucha/client.ts";
import { crearPeso, PAUSA_MIN, PAUSA_MAX, PAUSA_FOTOGRAMAS, DESTELLO_MS, DESTELLOS_POR_S_MAX, SONIDO_GOLPE, AJUSTE_REDUCIR_MOVIMIENTO } from "../features/lucha/peso.ts";
import catalogo from "../features/sonido/catalogo.json" with { type: "json" };
import { AJUSTES_MOTOR } from "../packages/client/src/ajustes-motor.ts";
import { resolverTexto } from "../packages/client/src/ajustes.ts";

const KEY = "c:guardian-1";
const G = { id: "guardian-1", especie: "guardian-crisalida", x: 10, z: 0, y: 0, fija: true };
const sign = signer("una-clave-de-prueba-larga");

test("peso: the constants stay inside the safe ranges and the thud is a catalogue sound", () => {
  assert.ok(PAUSA_FOTOGRAMAS >= PAUSA_MIN && PAUSA_FOTOGRAMAS <= PAUSA_MAX && PAUSA_MIN === 2 && PAUSA_MAX === 5);
  assert.ok(DESTELLO_MS >= 80 && DESTELLO_MS <= 120 && FLASH_MS === DESTELLO_MS);
  assert.equal(DESTELLOS_POR_S_MAX, 3);
  assert.ok((catalogo as { sonidos: { id: string }[] }).sonidos.some((s) => s.id === SONIDO_GOLPE), "the thud exists in features/sonido/catalogo.json");
});

test("peso: the switch decides — off = pause and flash; on = neither; only my own blow pauses; no pause in a headset", () => {
  let reducido = false, xr = false;
  const t = { now: 0 };
  const p = crearPeso({ reducido: () => reducido, enXR: () => xr, reloj: () => t.now });
  assert.deepEqual(p.golpe(true), { pausa: PAUSA_FOTOGRAMAS, destello: true });
  t.now += 1000;
  assert.deepEqual(p.golpe(false), { pausa: 0, destello: true }, "someone else's blow flashes but does not stutter my picture");
  t.now += 1000; xr = true;
  assert.deepEqual(p.golpe(true), { pausa: 0, destello: true }, "headset: no pause");
  t.now += 1000; xr = false; reducido = true;
  assert.deepEqual(p.golpe(true), { pausa: 0, destello: false }, "reduce motion: nothing moves");
  assert.equal(p.destello(), false);
  t.now += 1000; reducido = false;                  // changing it live takes effect on the next blow
  assert.deepEqual(p.golpe(true), { pausa: PAUSA_FOTOGRAMAS, destello: true });
});

test("peso: a burst never flashes more than 3 times in one second (photosensitivity)", () => {
  const t = { now: 0 };
  const p = crearPeso({ reducido: () => false, reloj: () => t.now });
  let n = 0;
  for (let i = 0; i < 40; i++) { t.now = i * 20; if (p.destello()) n++; }   // 40 asks in 780 ms
  assert.equal(n, DESTELLOS_POR_S_MAX);
  t.now = 1000; assert.equal(p.destello(), true, "a second after the first flash a new one may start");
  let m = 0;
  for (let s = 0; s < 10; s++) for (let i = 0; i < 10; i++) { t.now = 5000 + s * 1000 + i * 100; if (p.destello()) m++; }
  assert.ok(m <= 10 * DESTELLOS_POR_S_MAX, `${m} flashes in 10 s`);
});

/** A headless arena as in test/lucha.test.ts, with a view that records what the presentation was asked to do. */
function arena(n = 2) {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [crearLucha({ criaturas: [G], semilla: 7 })], log: () => {}, identitySign: sign });
  const estado = { reducido: false };
  const t = { now: 1_000_000 };
  const pages = Array.from({ length: n }, (_, i) => {
    const vistas: string[] = [], anuncios: string[] = [];
    const tr = inst.join(i), cli = crearCliente(undefined, () => t.now);
    const k: GuestKeeper & { token: string | null } = { token: null, load: () => k.token, save: (x: string) => { k.token = x; } };
    const view: ViewHooks = {
      label() {}, bounce() {},
      place: (key, o) => vistas.push(`place ${key} ${o ? (o as { color?: string }).color : "null"}`),
      tag: (key, tg) => vistas.push(`tag ${key} ${tg ? tg.text : "null"}`),
      pausa: (f) => vistas.push(`pausa ${f}`),
      sonido: (s) => { vistas.push(`sonido ${s.id}`); return true; },
      movimientoReducido: () => estado.reducido,
      announce: (a) => anuncios.push(a.text),
    };
    const s = new ClientSession(tr, { features: [cli.part], identity: k, view });
    return { t: tr, s, l: cli.lucha, vistas, anuncios };
  });
  const pump = (ticks = 1) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const place = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  pump(); pump(2);
  place(pages[0].s.entity, 11, 0); if (pages[1]) place(pages[1].s.entity, 12, 1);
  pump(12);
  return { pages, pump, estado, clock: t };
}

test("lucha peso: with the switch off a blow pauses the striker's picture, flashes the creature and thuds; the neighbour only sees flash and hears the thud", () => {
  const W = arena();
  W.pages[0].l.golpear(KEY); W.pump(2);
  const [yo, vecino] = W.pages;
  assert.ok(yo.vistas.includes(`pausa ${PAUSA_FOTOGRAMAS}`), `${yo.vistas}`);
  assert.ok(yo.vistas.includes(`place lucha:${KEY} #ffffff`), "the flash is white and on the creature only");
  assert.ok(yo.vistas.includes(`sonido ${SONIDO_GOLPE}`));
  assert.ok(yo.vistas.some((v) => /^tag lucha:c:guardian-1 .* −\d$/.test(v)), "the −N text");
  assert.ok(yo.anuncios.some((a) => /^Golpe: −\d, le quedan \d+\.$/.test(a)), "the announcement stays as it was");
  assert.equal(vecino.vistas.filter((v) => v.startsWith("pausa")).length, 0);
  assert.ok(vecino.vistas.includes(`place lucha:${KEY} #ffffff`));
  assert.ok(vecino.vistas.includes(`sonido ${SONIDO_GOLPE}`));
});

test("lucha peso: with «reduce motion» there is no pause and no flash, but the −N text, the announcement and the sound remain (no blow is left without a signal)", () => {
  const W = arena();
  W.estado.reducido = true;
  W.pages[0].l.golpear(KEY); W.pump(2);
  for (const c of W.pages) {
    assert.equal(c.vistas.filter((v) => v.startsWith("pausa")).length, 0);
    assert.equal(c.vistas.filter((v) => v === `place lucha:${KEY} #ffffff`).length, 0);
    assert.ok(c.vistas.some((v) => /^tag lucha:c:guardian-1 .* −\d$/.test(v)), "text");
    assert.ok(c.vistas.includes(`sonido ${SONIDO_GOLPE}`), "sound");
    assert.ok(c.anuncios.some((a) => a.startsWith("Golpe: −")), "announcement");
  }
});

test("lucha peso: flipping the setting live (the system preference changes) applies from the next blow, both ways", () => {
  const W = arena(1);
  const yo = W.pages[0];
  const pausas = () => yo.vistas.filter((v) => v.startsWith("pausa")).length;
  yo.l.golpear(KEY); W.pump(2); assert.equal(pausas(), 1);
  W.estado.reducido = true; W.clock.now += 5000;
  W.pump(ENFRIAMIENTO_TICKS); yo.l.golpear(KEY); W.pump(2); assert.equal(pausas(), 1, "reduce motion: no new pause");
  W.estado.reducido = false; W.clock.now += 5000;
  W.pump(ENFRIAMIENTO_TICKS); yo.l.golpear(KEY); W.pump(2); assert.equal(pausas(), 2, "back to the default: pause again");
});

test("lucha peso: the engine's switch is the existing «accesibilidad.menosMovimiento» (default from the system), declared with the new wording", () => {
  const d = AJUSTES_MOTOR.find((a) => `${a.grupo}.${a.id}` === AJUSTE_REDUCIR_MOVIMIENTO);
  assert.ok(d, "the setting exists");
  if (!d) return;
  assert.deepEqual((d.defecto as { si?: unknown }).si, [{ requiere: ["menosMovimiento"], valor: true }], "the default follows prefers-reduced-motion");
  for (const idioma of ["en", "es"] as const) {
    const nombre = resolverTexto(d.nombre, idioma), describe = resolverTexto(d.describe, idioma);
    assert.ok(nombre.length <= 40 && describe.length <= 160, idioma);
  }
  assert.match(resolverTexto(d.describe, "es"), /pausas, sacudidas y destellos/);
});

test("lucha peso: the declaration is still valid and the golpe event keeps its announcement (text + sound)", () => {
  assert.deepEqual(lucha.issues, []);
  const a = lucha.events?.golpe.announce;
  assert.ok(a && a !== "silent" && a.text.includes("{dano}"));
});
