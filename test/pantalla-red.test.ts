// M18 trozo 3: a screen shared onto the world's video screen is relayed by the server to who is near that screen — and only them.
// The wire (net/pantalla.ts) and the rules (instance/pantallas.ts) run here with no sockets and no browser; the last test goes through a real
// Instance with two pages. The browser's part (WebCodecs) is pure-logic tested in its own file's helpers (apps/plaza/pantalla-red-logica.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MSG, WS_FRAME_MAX, PANTALLA_TIPO, PANTALLA_VP8, PANTALLA_H264, PANTALLA_FRAGMENTO, PANTALLA_FRAGMENTOS_MAX, PANTALLA_MOTIVO, PANTALLA_EMITIR_M, PANTALLA_VER_M, PANTALLA_BYTES_S, PANTALLA_LADO_MAX, PANTALLA_FPS,
  codificarPantallaEmpezar, leerPantallaEmpezar, codificarPantallaParar, leerPantallaParar, codificarPantallaTrama, leerPantallaTramaSubida, bajarPantallaTrama, leerPantallaTramaBajada,
  codificarPantallaEstado, leerPantallaEstado, codificarPantallaPideClave, leerPantallaPideClave, trocearPantalla, Montador,
} from "../packages/net/src/index.ts";
import { Pantallas, pantallasDelEstado } from "../packages/instance/src/pantallas.ts";
import type { MundoPantallas } from "../packages/instance/src/pantallas.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { defineFeature, serverPart } from "../packages/feature/src/index.ts";
import { setBody } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";

const bytes = (n: number, v = 7) => new Uint8Array(n).fill(v);
const lleno = (n: number) => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + 5) & 0xff; return b; };

test("pantalla wire: every message round-trips and the biggest stays under the socket's frame cap", () => {
  const e = { codec: PANTALLA_VP8, ancho: 1280, alto: 720, key: "obj-12" };
  assert.deepEqual(leerPantallaEmpezar(codificarPantallaEmpezar(e)!), e);
  assert.equal(leerPantallaParar(codificarPantallaParar("")!), "");
  assert.equal(leerPantallaParar(codificarPantallaParar("obj-12")!), "obj-12");
  const t = { seq: 65535, idx: 127, n: PANTALLA_FRAGMENTOS_MAX, clave: true, ts: 4_000_000_000, datos: lleno(PANTALLA_FRAGMENTO) };
  const arriba = codificarPantallaTrama(t)!;
  assert.ok(arriba.length <= WS_FRAME_MAX, `${arriba.length} bytes up`);
  assert.deepEqual(leerPantallaTramaSubida(arriba), t);
  const abajo = bajarPantallaTrama(arriba, 513);
  assert.ok(abajo.length <= WS_FRAME_MAX, `${abajo.length} bytes down`);
  assert.deepEqual(leerPantallaTramaBajada(abajo), { ...t, id: 513 });
  const s = { id: 9, vivo: true, motivo: 0, emisor: 4, codec: PANTALLA_H264, ancho: 640, alto: 360, puedeParar: true, key: "x".repeat(32) };
  assert.deepEqual(leerPantallaEstado(codificarPantallaEstado(s)), s);
  assert.equal(leerPantallaPideClave(codificarPantallaPideClave(777)), 777);
  assert.equal(MSG.PANTALLA, PANTALLA_TIPO);
});

test("pantalla wire: malformed bytes are refused, never thrown on (fuzz)", () => {
  assert.equal(codificarPantallaEmpezar({ codec: 9, ancho: 640, alto: 360, key: "a" }), null);
  assert.equal(codificarPantallaEmpezar({ codec: 1, ancho: PANTALLA_LADO_MAX + 1, alto: 360, key: "a" }), null);
  assert.equal(codificarPantallaEmpezar({ codec: 1, ancho: 640, alto: 360, key: "" }), null);
  assert.equal(codificarPantallaEmpezar({ codec: 1, ancho: 640, alto: 360, key: "x".repeat(33) }), null);
  assert.equal(codificarPantallaTrama({ seq: 0, idx: 0, n: 1, clave: false, ts: 0, datos: bytes(PANTALLA_FRAGMENTO + 1) }), null);
  assert.equal(codificarPantallaTrama({ seq: 0, idx: 3, n: 3, clave: false, ts: 0, datos: bytes(5) }), null);
  assert.equal(codificarPantallaTrama({ seq: 0, idx: 0, n: 1, clave: false, ts: 0, datos: new Uint8Array(0) }), null);
  assert.equal(trocearPantalla(0, true, 0, new Uint8Array(0)), null);
  assert.equal(trocearPantalla(0, true, 0, bytes(PANTALLA_FRAGMENTO * PANTALLA_FRAGMENTOS_MAX + 1)), null);
  const leer = [leerPantallaEmpezar, leerPantallaParar, leerPantallaTramaSubida, leerPantallaTramaBajada, leerPantallaEstado, leerPantallaPideClave];
  let semilla = 12345; const azar = () => (semilla = (semilla * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 4000; i++) {
    const b = new Uint8Array(Math.floor(azar() * 40)); for (let j = 0; j < b.length; j++) b[j] = Math.floor(azar() * 256);
    if (b.length > 1 && i % 2) { b[0] = PANTALLA_TIPO; b[1] = 1 + (i % 6); }
    for (const f of leer) assert.doesNotThrow(() => f(b), `${f.name} on ${b.length} bytes`);
  }
  // a declared length that does not match the bytes
  const e = codificarPantallaEmpezar({ codec: 1, ancho: 640, alto: 360, key: "abc" })!;
  assert.equal(leerPantallaEmpezar(e.subarray(0, e.length - 1)), null);
  assert.equal(leerPantallaEmpezar(new Uint8Array([...e, 0])), null);
});

test("pantalla: a frame cut into pieces is joined again; a lost piece throws the frame away, and the next frame is fine", () => {
  const frame = lleno(PANTALLA_FRAGMENTO * 3 + 17);
  const piezas = trocearPantalla(5, true, 1234, frame)!;
  assert.equal(piezas.length, 4);
  for (const p of piezas) assert.ok(p.length <= WS_FRAME_MAX);
  const m = new Montador();
  let sal: ReturnType<Montador["poner"]> = null;
  for (const p of piezas) sal = m.poner(leerPantallaTramaSubida(p)!);
  assert.deepEqual(sal && { clave: sal.clave, ts: sal.ts }, { clave: true, ts: 1234 });
  assert.deepEqual(sal!.datos, frame);
  // piece 1 never came
  const roto = trocearPantalla(6, false, 1300, frame)!;
  const m2 = new Montador();
  assert.equal(m2.poner(leerPantallaTramaSubida(roto[0])!), null);
  assert.equal(m2.poner(leerPantallaTramaSubida(roto[2])!), null);
  assert.equal(m2.poner(leerPantallaTramaSubida(roto[3])!), null);
  const sig = trocearPantalla(7, false, 1400, bytes(100))!;
  assert.deepEqual(m2.poner(leerPantallaTramaSubida(sig[0])!)!.datos, bytes(100));
  // a piece in the middle of nothing
  assert.equal(new Montador().poner(leerPantallaTramaSubida(roto[1])!), null);
});

// ---------- the server's rules, with a fake world ----------
type Msg = { para: number; b: Uint8Array };
function mundo(opts: { puedeEmitir?: (e: number) => boolean; puedeParar?: (e: number) => boolean; puedeVer?: (a: number, b: number) => boolean } = {}) {
  const pos = new Map<number, { x: number; z: number }>();
  let pantallas = [{ key: "cine", x: 0, z: 0 }];
  const enviados: Msg[] = [];
  const m: MundoPantallas = {
    pantallas: () => pantallas,
    posicion: (e) => pos.get(e) ?? null,
    entidades: () => pos.keys(),
    puedeEmitir: opts.puedeEmitir ?? (() => true),
    puedeParar: opts.puedeParar ?? (() => false),
    puedeVer: opts.puedeVer ?? (() => true),
    enviar: (para, b) => { enviados.push({ para, b }); },
  };
  const p = new Pantallas(m);
  const de = (para: number, op: number) => enviados.filter((x) => x.para === para && x.b[1] === op);
  const estados = (para: number) => de(para, 4).map((x) => leerPantallaEstado(x.b)!);
  return { p, pos, enviados, de, estados, quitarPantallas: () => { pantallas = []; }, poner: (x: number, z: number, e: number) => pos.set(e, { x, z }) };
}
const empezar = (w: ReturnType<typeof mundo>, e: number, key = "cine", tick = 1) => w.p.recibir(e, codificarPantallaEmpezar({ codec: PANTALLA_VP8, ancho: 1280, alto: 720, key })!, tick);
function enviarFrame(w: ReturnType<typeof mundo>, e: number, seq: number, clave: boolean, largo: number, tick: number) {
  for (const pieza of trocearPantalla(seq, clave, seq * 66, bytes(largo))!) assert.ok(w.p.recibir(e, pieza, tick));
}

test("pantalla server: a sharer near a screen goes live; the people within reach are told and get frames from the next key frame", () => {
  const w = mundo();
  w.poner(5, 0, 1); w.poner(20, 0, 2); w.poner(PANTALLA_VER_M + 10, 0, 3);
  assert.ok(empezar(w, 1));
  assert.equal(w.estados(1)[0].vivo, true);
  assert.equal(w.estados(1)[0].key, "cine");
  assert.equal(w.estados(2)[0].vivo, true, "the one at 20 m is told");
  assert.equal(w.estados(3).length, 0, "the one at 50 m hears nothing, not even the state");
  assert.ok(w.de(1, 6).length >= 1, "the sharer is asked for a key frame because somebody arrived");
  enviarFrame(w, 1, 0, false, 500, 2);
  assert.equal(w.de(2, 5).length, 0, "a delta frame before the first key frame is not relayed to a newcomer");
  enviarFrame(w, 1, 1, true, 2500, 3);
  assert.equal(w.de(2, 5).length, 3, "the key frame goes out piece by piece");
  assert.equal(w.de(3, 5).length, 0);
  assert.equal(w.de(1, 5).length, 0, "the sharer never gets its own pieces back");
  enviarFrame(w, 1, 2, false, 800, 4);
  assert.equal(w.de(2, 5).length, 4);
  const p = leerPantallaTramaBajada(w.de(2, 5)[0].b)!;
  assert.equal(p.id, w.estados(1)[0].id);
  assert.equal(p.clave, true);
});

test("pantalla server: someone who walks into reach later is told, waits for a key frame, and is told when they walk away", () => {
  const w = mundo();
  w.poner(0, 0, 1); w.poner(200, 0, 2);
  empezar(w, 1);
  enviarFrame(w, 1, 0, true, 300, 2);
  assert.equal(w.estados(2).length, 0);
  w.poner(30, 0, 2); w.p.tick(10);
  assert.equal(w.estados(2).length, 1);
  assert.equal(w.estados(2)[0].vivo, true);
  const pedidas = w.de(1, 6).length;
  enviarFrame(w, 1, 1, false, 300, 11);
  assert.equal(w.de(2, 5).length, 0, "no delta for the newcomer");
  assert.ok(w.de(1, 6).length >= pedidas);
  enviarFrame(w, 1, 2, true, 300, 12);
  assert.equal(w.de(2, 5).length, 1);
  w.poner(PANTALLA_VER_M + 2, 0, 2); w.p.tick(20); // inside the hysteresis band: still a viewer
  assert.equal(w.estados(2).length, 1);
  w.poner(PANTALLA_VER_M + 20, 0, 2); w.p.tick(30);
  const ult = w.estados(2).at(-1)!;
  assert.equal(ult.vivo, false); assert.equal(ult.motivo, PANTALLA_MOTIVO.fueraDeAlcance);
  enviarFrame(w, 1, 3, true, 300, 31);
  assert.equal(w.de(2, 5).length, 1, "nothing more after leaving");
});

test("pantalla server: refusals — far, busy, no such screen, not allowed; one share per person, and moving it", () => {
  const w = mundo({ puedeEmitir: (e) => e !== 9 });
  w.poner(PANTALLA_EMITIR_M + 5, 0, 1); w.poner(3, 0, 2); w.poner(4, 0, 3); w.poner(1, 0, 9);
  empezar(w, 1);
  assert.equal(w.estados(1)[0].motivo, PANTALLA_MOTIVO.lejos);
  empezar(w, 9);
  assert.equal(w.estados(9)[0].motivo, PANTALLA_MOTIVO.noPermitido);
  empezar(w, 2, "nada");
  assert.equal(w.estados(2)[0].motivo, PANTALLA_MOTIVO.noExiste);
  empezar(w, 2);
  assert.equal(w.estados(2)[1].vivo, true);
  empezar(w, 3);
  assert.equal(w.estados(3).at(-1)!.motivo, PANTALLA_MOTIVO.ocupada);
  empezar(w, 2); // asking again for the same screen: the same answer, nothing changes
  assert.equal(w.p.vivas().length, 1);
  assert.equal(w.p.stats.empezadas, 1);
  assert.equal(w.p.vivas()[0].espectadores.includes(3), true);
});

test("pantalla server: stopping — your own, a moderator's, the sharer leaving, going far, or the screen being deleted", () => {
  const w = mundo({ puedeParar: (e) => e === 7 });
  w.poner(2, 0, 1); w.poner(3, 0, 2); w.poner(4, 0, 7); w.poner(5, 0, 8);
  empezar(w, 1); assert.equal(w.p.vivas().length, 1);
  w.p.recibir(8, codificarPantallaParar("cine")!, 5); // nobody special
  assert.equal(w.p.vivas().length, 1);
  w.p.recibir(7, codificarPantallaParar("cine")!, 5); // someone who directs
  assert.equal(w.p.vivas().length, 0);
  assert.equal(w.estados(1).at(-1)!.motivo, PANTALLA_MOTIVO.moderacion, "the sharer is told too");
  assert.equal(w.estados(2).at(-1)!.vivo, false);
  empezar(w, 1, "cine", 6);
  w.p.recibir(1, codificarPantallaParar()!, 7); // my own
  assert.equal(w.p.vivas().length, 0);
  empezar(w, 1, "cine", 8); w.p.salir(1);
  assert.equal(w.p.vivas().length, 0);
  assert.equal(w.estados(2).at(-1)!.motivo, PANTALLA_MOTIVO.seFue);
  empezar(w, 1, "cine", 9); w.poner(PANTALLA_EMITIR_M * 2, 0, 1); w.p.tick(10);
  assert.equal(w.p.vivas().length, 0, "walking too far ends it");
  assert.equal(w.estados(2).at(-1)!.motivo, PANTALLA_MOTIVO.lejos);
  w.poner(2, 0, 1); empezar(w, 1, "cine", 11); w.quitarPantallas(); w.p.tick(20);
  assert.equal(w.p.vivas().length, 0);
  assert.equal(w.estados(2).at(-1)!.motivo, PANTALLA_MOTIVO.borrada);
});

test("pantalla server: a closed bubble or a block keeps a viewer out; a viewer who leaves is dropped", () => {
  const w = mundo({ puedeVer: (_a, b) => b !== 3 });
  w.poner(2, 0, 1); w.poner(3, 0, 2); w.poner(4, 0, 3);
  empezar(w, 1);
  assert.deepEqual(w.p.vivas()[0].espectadores, [2]);
  assert.equal(w.estados(3).length, 0);
  w.p.salir(2);
  assert.deepEqual(w.p.vivas()[0].espectadores, []);
});

test("pantalla server: over the bandwidth guard a frame is dropped whole, and every delta after it until a key frame", () => {
  const w = mundo();
  w.poner(2, 0, 1); w.poner(3, 0, 2);
  empezar(w, 1);
  enviarFrame(w, 1, 0, true, 60_000, 2);
  const tras = w.de(2, 5).length;
  assert.equal(tras, 60);
  // the bucket holds 1.5 s of PANTALLA_BYTES_S: keep pushing key frames until one does not fit
  let seq = 1, tick = 2;
  while (w.p.stats.descartadas === 0 && seq < 20) { enviarFrame(w, 1, seq++, true, 100_000, tick); if (seq % PANTALLA_FPS === 0) tick += 20; }
  assert.ok(w.p.stats.descartadas >= 1, "a frame over the guard is dropped");
  const antes = w.de(2, 5).length, pedidas = w.p.stats.clavesPedidas;
  enviarFrame(w, 1, 90, false, 500, tick);
  assert.equal(w.de(2, 5).length, antes, "the delta after a dropped frame is dropped too");
  assert.ok(pedidas >= 1);
  w.p.tick(((tick / 10) | 0) * 10 + 10); // time passes: the bucket refills
  w.p.tick(((tick / 10) | 0) * 10 + 20);
  enviarFrame(w, 1, 91, true, 500, tick + 40);
  assert.equal(w.de(2, 5).length, antes + 1, "a key frame restarts the stream");
  assert.ok(PANTALLA_BYTES_S >= 150_000, "the guard leaves room for the page's 1.2 Mbit/s");
});

test("pantalla server: a flood of frames or of tiny pieces is cut; a piece out of order loses the frame", () => {
  const w = mundo();
  w.poner(2, 0, 1); w.poner(3, 0, 2);
  empezar(w, 1);
  for (let i = 0; i < 100; i++) enviarFrame(w, 1, i, true, 50, 5); // 100 frames inside one second
  const dejadas = w.de(2, 5).length;
  assert.ok(dejadas <= Math.round(PANTALLA_FPS * 1.5) + 1, `${dejadas} frames relayed in a second`);
  assert.ok(w.p.stats.descartadas > 50);
  // out of order: piece 1 of 2 without piece 0
  const piezas = trocearPantalla(500, true, 0, bytes(1500))!;
  const w2 = mundo(); w2.poner(2, 0, 1); w2.poner(3, 0, 2); empezar(w2, 1);
  w2.p.recibir(1, piezas[1], 3);
  assert.equal(w2.de(2, 5).length, 0);
  // pieces from someone who is not sharing are ignored (and not «bad»)
  assert.equal(w2.p.recibir(2, piezas[0], 3), true);
  assert.equal(w2.de(1, 5).length, 0);
  // a start with a bad payload is «bad»
  assert.equal(w2.p.recibir(2, new Uint8Array([PANTALLA_TIPO, 1, 9]), 3), false);
  assert.equal(w2.p.recibir(2, new Uint8Array([PANTALLA_TIPO, 99]), 3), false);
});

test("pantalla: the video screens are read from the objetos feature's shared state", () => {
  const lista = pantallasDelEstado([
    ["objetos:a", { tipo: "video", x: 1, z: 2 }], ["objetos:b", { tipo: "imagen", x: 3, z: 4 }], ["gestos:c", { tipo: "video", x: 5, z: 6 }], ["objetos:d", { tipo: "video", x: "no", z: 1 }],
  ]);
  assert.deepEqual(lista, [{ key: "a", x: 1, z: 2 }]);
});

// ---------- a real Instance with two pages ----------
const objetosFalsos = defineFeature({
  id: "objetos", version: 1, describe: "Pantallas de prueba.",
  intents: { poner: { describe: "Pone una pantalla.", spoken: "poner", fields: {} } },
  state: { describe: "Cosas.", fields: { tipo: { kind: "enum", values: ["video", "imagen"], default: "video" }, x: { kind: "fixed", min: -100, max: 100, step: 0.1, default: 0 }, z: { kind: "fixed", min: -100, max: 100, step: 0.1, default: 0 } } },
});
const objetosServer = serverPart(objetosFalsos, (api) => { api.on("poner", () => { api.state.set("pan", { tipo: "video", x: 0, z: 0 }); }); });

test("pantalla, end to end: a page shows its screen, the one near gets the pieces, the one far gets nothing, and leaving ends it", () => {
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [objetosServer], log: () => {} });
  const pages = Array.from({ length: 3 }, (_, i) => {
    const t = inst.join(i), s = new ClientSession(t);
    const estados: { vivo: boolean; motivo: number; key: string; emisor: number }[] = [], trozos: number[] = [];
    s.onPantallaEstado = (e) => estados.push({ vivo: e.vivo, motivo: e.motivo, key: e.key, emisor: e.emisor });
    s.onPantallaTrama = (tr) => trozos.push(tr.idx);
    return { t, s, estados, trozos };
  });
  const pump = (k = 2) => { for (let i = 0; i < k; i++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  pump();
  const [a, b, c] = pages;
  setBody(inst.sim, a.s.entity, { x: fx(3), y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  setBody(inst.sim, b.s.entity, { x: fx(20), y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  setBody(inst.sim, c.s.entity, { x: fx(90), y: 0, z: 0, vy: 0, air: 0, buf: 0 });
  pump(4);
  b.s.features.send("objetos", "poner", {}); pump(2);
  assert.ok(a.s.pantallaEmpezar("pan", PANTALLA_VP8, 1280, 720));
  pump(2);
  assert.equal(a.estados.at(-1)?.vivo, true);
  assert.equal(b.estados.at(-1)?.vivo, true, "the near page is told");
  assert.equal(c.estados.length, 0, "the far page hears nothing");
  assert.ok(a.s.pantallaTrama(0, true, 0, bytes(2500)));
  pump(2);
  assert.deepEqual(b.trozos, [0, 1, 2]);
  assert.deepEqual(c.trozos, []);
  assert.deepEqual(a.trozos, []);
  assert.equal(inst.puertaStats.malas, 0);
  assert.ok(inst.pantallasVivas.vivas().length === 1);
  inst.disconnect(a.s.entity);
  pump(2);
  assert.equal(b.estados.at(-1)?.vivo, false);
  assert.equal(b.estados.at(-1)?.motivo, PANTALLA_MOTIVO.seFue);
  assert.equal(inst.pantallasVivas.vivas().length, 0);
});

test("pantalla: the limits published in limits.json are the ones the code enforces", async () => {
  const lim = Object.fromEntries((JSON.parse((await import("node:fs")).readFileSync("limits.json", "utf8")).limits as { key: string; value: number }[]).map((e) => [e.key, e.value]));
  assert.equal(lim.pantalla_alcance_m, PANTALLA_VER_M);
  assert.equal(lim.pantalla_ancho_max, PANTALLA_LADO_MAX);
  assert.equal(lim.pantalla_fps, PANTALLA_FPS);
  assert.equal(lim.pantalla_bytes_s, PANTALLA_BYTES_S);
});
