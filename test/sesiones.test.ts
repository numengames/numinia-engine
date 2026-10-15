// T1: how each player entered — the page's report, the server's session log, the reader.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeReport, decodeReport, MSG, REPORT_MAX } from "../packages/net/src/index.ts";
import { Sesiones, limpiar, SHAPES, KEEP_DAYS, TEXT_MAX } from "../packages/server/src/sesiones.ts";
import { agrupar, describir } from "../packages/server/src/sesiones-ver.ts";
import { startServer } from "../packages/server/src/server.ts";
import { nombreNavegador, claseAparato, nombreSistema, medidorDeCuadros } from "../packages/render/src/sesion.ts";

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
