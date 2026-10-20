// T1: how each player entered — the page's report, the server's session log, the reader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeReport, decodeReport, MSG, REPORT_MAX } from "../packages/net/src/index.ts";
import { Sesiones, limpiar, SHAPES, KEEP_DAYS, TEXT_MAX, CONTEO_MAX } from "../packages/server/src/sesiones.ts";
import { agrupar, describir, resumir, tirones } from "../packages/server/src/sesiones-ver.ts";
import { startServer } from "../packages/server/src/server.ts";
import { nombreNavegador, claseAparato, nombreSistema, medidorDeCuadros, CONGELACION_MS, LARGO_MS } from "../packages/render/src/sesion.ts";

const tmp = () => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "sesiones-"));

test("REPORT: JSON object up to REPORT_MAX bytes; anything else is refused without throwing", () => {
  const b = encodeReport({ k: "pulso", rttMs: 12 })!;
  assert.equal(b[0], MSG.REPORT);
  assert.deepEqual(decodeReport(b), { k: "pulso", rttMs: 12 });
  assert.equal(encodeReport({ k: "entrada", ua: "x".repeat(REPORT_MAX) }), null);
  assert.equal(decodeReport(new Uint8Array([MSG.REPORT, 0x7b])), null);          // "{" alone
  assert.equal(decodeReport(new Uint8Array([MSG.REPORT, 0x5b, 0x5d])), null);    // "[]" is not an object
});

test("limpiar keeps only the declared keys and types, cuts texts, drops NaN", () => {
  const out = limpiar(SHAPES.entrada, { clase: "movil", hack: "x", nucleos: NaN, memoriaGB: "8", ua: "a\u0000b" + "c".repeat(400), xr: { vr: true, ar: "sí", otro: 1 }, tiempos: {} });
  assert.deepEqual(Object.keys(out).sort(), ["clase", "ua", "xr"]);
  assert.equal((out.ua as string).length, TEXT_MAX);
  assert.ok(!(out.ua as string).includes("\u0000"));
  assert.deepEqual(out.xr, { vr: true });
});

test("a session that reports writes entrada, pulso, xr and a closing line; one that never reports writes nothing", async () => {
  const dir = tmp();
  let t = Date.parse("2026-10-15T10:00:00Z");
  const s = new Sesiones({ dir, now: () => t });
  s.abrir(3); s.abrir(4);
  assert.equal(s.informe(3, { k: "entrada", clase: "movil", navegador: "Chrome 141", backend: "WebGL2" }), true);
  assert.equal(s.informe(3, { k: "entrada", clase: "visor" }), false, "only one entrada per session");
  assert.equal(s.informe(3, { k: "inventado" }), false);
  t += 10_000;
  s.informe(3, { k: "pulso", modo: "plano", cuadros: 300, perdidos: 3, cuadroMs: { p50: 33.3, p99: 41 }, rttMs: 25 });
  s.informe(3, { k: "xr", modo: "ar", accion: "entra" });
  assert.equal(s.resumen().conInforme, 1);
  assert.deepEqual(s.resumen().porClase, { movil: 1 });
  assert.equal((s.ahora()[0].pulso as { rttMs: number }).rttMs, 25);
  t += 5_000;
  s.cerrar(3, { cierre: 1001 }); s.cerrar(4);
  await s.vaciar();
  const lines = readFileSync(join(dir, "sesiones-2026-10-15.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map((l) => l.k), ["entrada", "pulso", "xr", "sale"]);
  assert.ok(lines.every((l) => l.sesion === lines[0].sesion && /^2026-10-15T10:00:\d\d\.000Z$/.test(l.t)));
  assert.equal(lines[3].duracionS, 15);
  assert.deepEqual(lines[3].xr, ["ar:entra"]);
  // the reader turns it into a block for people
  const [fila] = agrupar(readFileSync(join(dir, "sesiones-2026-10-15.jsonl"), "utf8").split("\n"));
  const txt = describir(fila);
  assert.match(txt, /movil/); assert.match(txt, /Chrome 141/); assert.match(txt, /perdidos 1 %/); assert.match(txt, /ping 25 ms/);
});

test(`day files older than ${KEEP_DAYS} days are deleted; a folder that cannot be written does not break anything`, async () => {
  const dir = tmp();
  writeFileSync(join(dir, "sesiones-2026-09-01.jsonl"), "{}\n");
  writeFileSync(join(dir, "sesiones-2026-10-10.jsonl"), "{}\n");
  const s = new Sesiones({ dir, now: () => Date.parse("2026-10-15T12:00:00Z") });
  assert.equal(await s.purgar(), 1);
  assert.deepEqual(readdirSync(dir).sort(), ["sesiones-2026-10-10.jsonl"]);
  const logs: string[] = [];
  writeFileSync(join(dir, "un-fichero"), "x"); // a folder under a file cannot exist (ENOTDIR)
  const bad = new Sesiones({ dir: join(dir, "un-fichero", "sesiones"), log: (l) => logs.push(l) });
  bad.abrir(1); bad.informe(1, { k: "entrada", clase: "escritorio" });
  await bad.vaciar();
  assert.equal(bad.stats.fallosDeEscritura, 1);
  assert.match(logs[0], /no puedo escribir/);
});

test("over a real WebSocket: the server answers GET /sesiones and writes the day file", async () => {
  const dir = tmp();
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, sampleMs: 100, sesiones: dir });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}`);
    ws.binaryType = "arraybuffer";
    await new Promise<void>((ok, ko) => { ws.onmessage = (ev) => { if (new Uint8Array(ev.data as ArrayBuffer)[0] === MSG.WELCOME) ok(); }; ws.onerror = () => ko(new Error("ws")); });
    ws.send(encodeReport({ k: "entrada", clase: "visor", navegador: "Quest Browser 41.2", backend: "WebGL2", xr: { vr: true, ar: true } })!);
    ws.send(encodeReport({ k: "pulso", modo: "vr", hzXR: 72, cuadros: 720, perdidos: 0 })!);
    let r: any = null;
    for (let i = 0; i < 40 && !(r?.ahora?.[0]?.pulso); i++) { await new Promise((ok) => setTimeout(ok, 25)); r = await (await fetch(`http://127.0.0.1:${srv.port}/sesiones`)).json(); }
    assert.equal(r.schema, "numinia-engine/sesiones@1");
    assert.equal(r.ahora[0].entrada.clase, "visor");
    assert.equal(r.ahora[0].pulso.hzXR, 72);
    assert.deepEqual(r.resumen.porModo, { vr: 1 });
    ws.close();
    for (let i = 0; i < 40 && srv.sesiones.ahora().length; i++) await new Promise((ok) => setTimeout(ok, 25));
  } finally { await srv.close(); }
  const day = readdirSync(dir).find((f) => f.startsWith("sesiones-"))!;
  const kinds = readFileSync(join(dir, day), "utf8").trim().split("\n").map((l) => JSON.parse(l).k);
  assert.deepEqual(kinds, ["entrada", "pulso", "sale"]);
});

test("a server without a sessions folder keeps them in memory only", async () => {
  const srv = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000 });
  try { assert.equal(srv.sesiones.dir, null); } finally { await srv.close(); }
});

test("the page names browsers and devices the way people say them", () => {
  const quest = "Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/41.2.0.5.62 SamsungBrowser/4.0 Chrome/138.0.0.0 VR Safari/537.36";
  const pico = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) PicoBrowser/4.2.10 Chrome/120.0.0.0 VR Safari/537.36";
  const android = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
  const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:158.0) Gecko/20100101 Firefox/158.0";
  assert.equal(nombreNavegador(quest), "Quest Browser 41.2");
  assert.equal(nombreNavegador(pico), "Pico Browser 4.2");
  assert.equal(nombreNavegador(android, [{ brand: "Google Chrome", version: "141.0.7390.54" }, { brand: "Chromium", version: "141" }, { brand: "Not?A_Brand", version: "24" }]), "Chrome 141");
  assert.equal(nombreNavegador(iphone), "Safari 18.1");
  assert.equal(nombreNavegador(firefox), "Firefox 158.0");
  assert.equal(claseAparato({ ua: quest, punteroGrueso: false, ladoCortoPx: 1832 }), "visor");
  assert.equal(claseAparato({ ua: pico, punteroGrueso: true, ladoCortoPx: 1600 }), "visor");
  assert.equal(claseAparato({ ua: android, punteroGrueso: true, ladoCortoPx: 412 }), "movil");
  assert.equal(claseAparato({ ua: iphone, punteroGrueso: true, ladoCortoPx: 390 }), "movil");
  assert.equal(claseAparato({ ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.1 Safari/605.1.15", punteroGrueso: true, ladoCortoPx: 820 }), "tableta"); // iPad
  assert.equal(claseAparato({ ua: firefox, punteroGrueso: false, ladoCortoPx: 1080 }), "escritorio");
  assert.equal(nombreSistema(iphone), "iOS 18.1");
  assert.equal(nombreSistema(android, "Android", "14.0.0"), "Android 14");
});

test("frame meter: percentiles per window, lost frames against the target of the moment", () => {
  const m = medidorDeCuadros();
  for (let i = 0; i < 98; i++) m.cuadro(13.9, 4, 72);
  m.cuadro(30, 9, 72); m.cuadro(14, 4, 72); // one frame over 1.5 × 13.9 ms
  const w = m.ventana();
  assert.equal(w.cuadros, 100); assert.equal(w.perdidos, 1);
  assert.equal(w.cuadroMs.p50, 13.9); assert.equal(w.cuadroMs.peor, 30);
  assert.equal(m.ventana().cuadros, 0, "a new window starts empty");
});

// ---- B5: what the pulse used to hide (freezes ≥ 1 s), what the GPU was asked, and the byte budget ----
test("B5: a gap of 1 s or more with the page visible is a freeze, counted apart; a hidden page or an XR switch is a pause", () => {
  const m = medidorDeCuadros();
  for (let i = 0; i < 10; i++) m.cuadro(16.7, 2, 60);
  m.cuadro(CONGELACION_MS, 2, 60); m.cuadro(2400, 2, 60); // two freezes (the shader stalls seen in the headset)
  m.cuadro(16.7, 2, 60);
  m.pausa(); m.cuadro(30_000, 2, 60);                    // came back from a hidden tab: not a freeze
  m.cuadro(16.7, 2, 60, { xr: false }); m.cuadro(16.7, 2, 72, { xr: true }); // entering XR swaps loops…
  m.cuadro(1500, 2, 72, { xr: true });                   // …but this is the second XR frame: a freeze
  const w = m.ventana();
  assert.deepEqual(w.congelado, { n: 3, ms: 4900, peor: 2400 });
  assert.equal(w.cuadros, 13, "freezes stay out of cuadroMs/perdidos, as before");
  assert.equal(w.cuadroMs.peor, 16.7); assert.equal(w.perdidos, 0);
  const m2 = medidorDeCuadros();
  m2.cuadro(16.7, 2, 60, { xr: false }); m2.cuadro(3000, 2, 72, { xr: true });
  assert.equal(m2.ventana().congelado, undefined, "the gap while XR starts is not a freeze");
  assert.equal(m.ventana().congelado, undefined, "a new window starts without freezes");
});

test(`B5: a long frame is lost (over 1.5× the target) AND over ${LARGO_MS} ms; a slow target is not a stall`, () => {
  const m = medidorDeCuadros();
  m.cuadro(30, 2, 60);   // lost at 60 fps, not long
  m.cuadro(80, 2, 60);   // lost and long
  m.cuadro(125, 2, 8);   // 8 fps on purpose (battery, nothing moves): neither
  m.cuadro(200, 2, 8);   // lost at 8 fps and over 50 ms: long
  const w = m.ventana();
  assert.equal(w.perdidos, 3); assert.equal(w.largos, 2);
});

test("B5: draw calls, triangles, programs, pixel-ratio changes and Long Animation Frames, only when known", () => {
  const m = medidorDeCuadros();
  const bare = m.ventana();
  for (const k of ["dc", "kTri", "programas", "programasNuevos", "cambiosRes", "ratio", "loaf", "congelado"]) assert.ok(!(k in bare), `${k} absent when unknown`);
  assert.equal(bare.largos, 0);
  m.cuadro(16, 1, 60, { dc: 103, tri: 316_000, programas: 30, ratio: 1 });
  m.cuadro(16, 1, 60, { dc: 108, tri: 317_400, programas: 33, ratio: 0.85 });
  m.cuadro(16, 1, 60, { dc: 42, tri: 15_700, programas: 33, ratio: 0.72 });
  m.loaf(120, 70); m.loaf(400, 20);
  const w = m.ventana();
  assert.deepEqual(w.dc, { p50: 103, peor: 108 });
  assert.deepEqual(w.kTri, { p50: 316, peor: 317.4 });
  assert.equal(w.programas, 33); assert.equal(w.programasNuevos, 3);
  assert.equal(w.cambiosRes, 2); assert.equal(w.ratio, 0.72);
  assert.deepEqual(w.loaf, { n: 2, bloqMs: 90, peorMs: 400 }, "peorMs = the longest frame, bloqMs = the blocking summed");
  m.cuadro(16, 1, 60, { programas: 35, ratio: 0.72 });
  const w2 = m.ventana();
  assert.equal(w2.programasNuevos, 2, "new programs counted from the end of the last window");
  assert.equal(w2.cambiosRes, 0);
  assert.deepEqual(w2.loaf, { n: 0, bloqMs: 0, peorMs: 0 }, "once seen, LoAF is reported as zero rather than absent");
});

test("B5: the server keeps the new pulse fields with their types; counts must be whole and not negative", () => {
  const out = limpiar(SHAPES.pulso, {
    largos: 3, congelado: { n: 2, ms: 3400.4, peor: 2100, otro: 1 }, dc: { p50: 103, peor: 113, p99: 1 }, kTri: { p50: 316.1, peor: 317 },
    programas: 41, programasNuevos: -1, cambiosRes: 1.5, ratio: 0.85, loaf: { n: 1e9, bloqMs: 450, peorMs: "x" },
  });
  assert.deepEqual(out, {
    largos: 3, congelado: { n: 2, ms: 3400.4, peor: 2100 }, dc: { p50: 103, peor: 113 }, kTri: { p50: 316.1, peor: 317 },
    programas: 41, ratio: 0.85, loaf: { n: CONTEO_MAX, bloqMs: 450 },
  });
});

/** The most loaded pulse the page can send: every field present, VR, battery, the widest numbers each can take. */
const PULSO_MAS_CARGADO = {
  k: "pulso", modo: "plano", cuadros: 9999, cuadroMs: { p50: 999.9, p99: 999.9, peor: 999.9 }, perdidos: 9999,
  costeMs: { p50: 999.99, p99: 999.99, peor: 999.99 }, largos: 9999, objetivoFps: 120, hzXR: 120, escala: 0.52, modoBateria: false,
  rttMs: 99999, correcciones: 999999, visibles: 999, oculta: false, bateria: { nivel: 0.99, cargando: false }, errores: 9999, memoriaMB: 99999,
  congelado: { n: 99, ms: 999999, peor: 99999 }, dc: { p50: 9999, peor: 9999 }, kTri: { p50: 9999.9, peor: 9999.9 },
  programas: 9999, programasNuevos: 9999, cambiosRes: 999, ratio: 1.31, loaf: { n: 999, bloqMs: 999999, peorMs: 99999 },
};

test("B5: the most loaded pulse stays under 700 of the REPORT_MAX bytes and survives the server untouched", () => {
  const bytes = encodeReport(PULSO_MAS_CARGADO)!;
  assert.ok(bytes, "it encodes");
  assert.ok(bytes.length <= 700, `pulse is ${bytes.length} bytes (budget 700 of ${REPORT_MAX})`);
  const { k: _k, ...rest } = PULSO_MAS_CARGADO;
  assert.deepEqual(limpiar(SHAPES.pulso, decodeReport(bytes)), rest, "every field it sends is a field the server keeps");
});

test("B5: a session's freezes add up in its closing line and in GET /sesiones' summary", async () => {
  const dir = tmp();
  const s = new Sesiones({ dir, now: () => Date.parse("2026-10-18T15:00:00Z") });
  s.abrir(1); s.abrir(2); s.abrir(3);
  s.informe(1, { k: "pulso", cuadros: 600, congelado: { n: 2, ms: 3100, peor: 2000 }, largos: 4, cambiosRes: 2, programas: 31, loaf: { n: 5, bloqMs: 900, peorMs: 400 } });
  s.informe(1, { k: "pulso", cuadros: 600, congelado: { n: 1, ms: 1200, peor: 1200 }, largos: 1, programas: 33 });
  s.informe(2, { k: "pulso", cuadros: 600, largos: 0 });                 // a session without stalls
  s.informe(3, { k: "pulso", cuadros: 600, congelado: { n: -3, ms: -1 } }); // nonsense: dropped, adds nothing
  const r = s.resumen().cliente as Record<string, number>;
  assert.equal(r.congelaciones, 3); assert.equal(r.sesionesConCongelacion, 1); assert.equal(r.congeladoPeorMs, 2000);
  assert.equal(r.largos, 5); assert.equal(r.cambiosRes, 2); assert.equal(r.loaf, 5); assert.equal(r.programasMax, 33); assert.equal(r.pulsos, 4);
  s.cerrar(1); s.cerrar(2);
  await s.vaciar();
  const sale = readFileSync(join(dir, "sesiones-2026-10-18.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((l) => l.k === "sale");
  assert.deepEqual(sale[0].cliente, { pulsos: 2, congelaciones: 3, congeladoMs: 4300, congeladoPeorMs: 2000, largos: 5, cambiosRes: 2, loaf: 5, programasMax: 33 });
  assert.equal(sale[1].cliente.congelaciones, 0);
});

test("E4: the reader shows the B5 pulse fields (freezes, long frames, LoAF, draw calls, triangles, resolution); an old page shows none", () => {
  const base = { k: "pulso", sesion: "s1", t: "2026-10-15T10:00:10.000Z", modo: "plano", cuadros: 300, perdidos: 3, cuadroMs: { p50: 16.7, p99: 40 }, rttMs: 20 };
  const lineas = [
    { k: "entrada", sesion: "s1", t: "2026-10-15T10:00:00.000Z", clase: "escritorio", navegador: "Chrome 141" },
    { ...base, congelado: { n: 1, ms: 1200, peor: 1200 }, largos: 4, loaf: { n: 3, bloqMs: 180, peorMs: 90 }, dc: { p50: 40, peor: 90 }, kTri: { p50: 120, peor: 300 }, cambiosRes: 1, ratio: 1 },
    { ...base, t: "2026-10-15T10:00:20.000Z", congelado: { n: 0, ms: 0, peor: 0 }, largos: 2, dc: { p50: 60, peor: 70 }, kTri: { p50: 140, peor: 200 }, cambiosRes: 0, ratio: 0.75 },
  ].map((x) => JSON.stringify(x));
  const [f] = agrupar(lineas);
  const txt = describir(f);
  assert.match(txt, /congelada 1 vez \(1200 ms en total, peor 1200 ms\)/);
  assert.match(txt, /cuadros largos \(> 50 ms\) 6/);
  assert.match(txt, /LoAF 3 \(bloqueo 180 ms, peor 90 ms\)/);
  assert.match(txt, /dibujos p50 60 \(peor 90\)/);
  assert.match(txt, /miles de triángulos p50 140 \(peor 300\)/);
  assert.match(txt, /cambios de resolución 1 \(ratio mín 0.75, último 0.75\)/);
  assert.match(resumir([f]), /1 con congelación · cuadros largos 6/);
  const viejo = agrupar([lineas[0], JSON.stringify(base)]);
  assert.equal(tirones(viejo[0].pulsos), null);
  assert.doesNotMatch(describir(viejo[0]) + resumir(viejo), /tirones|dibujo:|congelación/);
});
