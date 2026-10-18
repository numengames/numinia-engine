// graboso (M18b): the relic that records, without a browser. A fake recorder and a fake clock drive the cycle: out →
// recording → cut at the hard cap → a clip with a UTC name you can download. What needs real Chromium (captureStream,
// MediaRecorder, the microphone prompt) is listed in the branch's PROGRESO.md as e2e work.
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearGraboso, recortarTope, elegirFormato, nombreDeClip, contador, TOPE_S, FORMATOS } from "../packages/client/src/graboso.ts";
import type { Grabador, Aviso, Estado } from "../packages/client/src/graboso.ts";

/** A recorder that remembers what it was asked and returns a blob of `bytes` bytes (0 = nothing recorded). */
function grabadorFalso(opts: { sonido?: boolean; bytes?: number; falla?: string } = {}) {
  const llamadas: string[] = [];
  const g: Grabador = {
    async empezar(tipo) { llamadas.push(`empezar:${tipo}`); if (opts.falla) throw new Error(opts.falla); return { sonido: opts.sonido ?? true }; },
    async parar() { llamadas.push("parar"); return { blob: new Blob([new Uint8Array(opts.bytes ?? 1024)]), tipo: "video/webm" }; },
  };
  return { g, llamadas };
}
function montar(opts: Parameters<typeof grabadorFalso>[0] & { topeS?: number; tipo?: string } = {}) {
  const reloj = { ms: 10_000 };
  const avisos: Aviso[] = [], cambios: Estado["fase"][] = [];
  const { g, llamadas } = grabadorFalso(opts);
  const gr = crearGraboso({ grabador: g, ahora: () => reloj.ms, fecha: () => new Date(Date.UTC(2026, 9, 18, 14, 5, 30)), topeS: opts.topeS, tipo: opts.tipo, alCambiar: (e) => cambios.push(e.fase), avisar: (a) => avisos.push(a) });
  return { gr, reloj, avisos, cambios, llamadas };
}

test("the cap is kept between 30 and 60 s; nonsense becomes the default", () => {
  assert.equal(recortarTope(45), 45);
  assert.equal(recortarTope(10), TOPE_S.min);
  assert.equal(recortarTope(600), TOPE_S.max);
  assert.equal(recortarTope(59.6), 60);
  assert.equal(recortarTope("1 min"), TOPE_S.defecto);
  assert.equal(recortarTope(NaN), TOPE_S.defecto);
  assert.equal(TOPE_S.defecto, 60);
});

test("the format is the best one the browser supports; none → empty", () => {
  assert.equal(elegirFormato((t) => t === "video/webm;codecs=vp8,opus" || t === "video/webm"), FORMATOS[1]);
  assert.equal(elegirFormato((t) => t === "video/mp4"), "video/mp4");
  assert.equal(elegirFormato(() => false), "");
  assert.equal(elegirFormato(() => { throw new Error("no MediaRecorder"); }), "");
});

test("the clip's name is UTC and carries the extension of its type", () => {
  const f = new Date(Date.UTC(2026, 9, 18, 23, 7, 9));
  assert.equal(nombreDeClip(f, "video/webm;codecs=vp9,opus"), "graboso-2026-10-18-23-07-09.webm");
  assert.equal(nombreDeClip(f, "video/mp4"), "graboso-2026-10-18-23-07-09.mp4");
});

test("the counter reads m:ss / m:ss and never passes the cap", () => {
  assert.equal(contador(0, 60), "0:00 / 1:00");
  assert.equal(contador(12.7, 60), "0:12 / 1:00");
  assert.equal(contador(75, 45), "0:45 / 0:45");
});

test("out → recording → kept: the clip has its duration, its sound and a name", async () => {
  const { gr, reloj, avisos, cambios, llamadas } = montar({ tipo: "video/webm;codecs=vp9,opus" });
  assert.equal(gr.estado.fase, "guardado");
  assert.equal(await gr.sacar(), true);
  assert.equal(gr.estado.fase, "grabando");
  assert.deepEqual(llamadas, ["empezar:video/webm;codecs=vp9,opus"]);
  reloj.ms += 42_000;
  assert.equal(Math.round(gr.segundos()), 42);
  assert.equal(gr.contador(), "0:42 / 1:00");
  const clip = await gr.guardar();
  assert.ok(clip);
  assert.equal(clip.duracionS, 42);
  assert.equal(clip.conSonido, true);
  assert.equal(clip.corto, false);
  assert.equal(clip.nombre, "graboso-2026-10-18-14-05-30.webm");
  assert.equal(clip.blob.size, 1024);
  assert.equal(gr.estado.fase, "guardado");
  assert.deepEqual(cambios, ["despertando", "grabando", "guardado", "guardado"]);
  assert.ok(avisos.some((a) => a.texto.includes("graba lo que ves y oyes")));
  assert.ok(avisos.some((a) => a.texto.includes("Clip de 42 s guardado")));
  assert.equal(gr.segundos(), 0);
});

test("the hard cap cuts by itself: a 60 s cap never gives a longer clip, and the Graboso is kept", async () => {
  const { gr, reloj, avisos } = montar();
  await gr.sacar();
  reloj.ms += 59_900;
  assert.equal(gr.tic(), false, "under the cap it keeps going");
  reloj.ms += 200;
  assert.equal(gr.tic(), true, "at the cap it cuts");
  assert.equal(gr.estado.fase, "guardado");
  assert.equal(gr.tic(), false, "a second tic does nothing");
  const clip = await gr.guardar(); // waits for the closing recorder, returns the clip
  assert.ok(clip);
  assert.equal(clip.duracionS, 60);
  assert.ok(avisos.some((a) => a.texto.startsWith("Tope alcanzado")));
});

test("a 30 s cap cuts at 30; changing the cap applies to the next clip and is clamped", async () => {
  const { gr, reloj } = montar({ topeS: 30 });
  assert.equal(gr.estado.topeS, 30);
  await gr.sacar();
  reloj.ms += 30_000;
  assert.equal(gr.tic(), true);
  assert.equal(gr.tope(5), 30);
  assert.equal(gr.tope(45), 45);
  assert.equal(gr.tope(999), 60);
});

test("keeping it early still gives the clip, marked short for the mission", async () => {
  const { gr, reloj, avisos } = montar();
  await gr.sacar();
  reloj.ms += 12_000;
  const clip = await gr.guardar();
  assert.ok(clip);
  assert.equal(clip.corto, true);
  assert.ok(avisos.some((a) => a.texto.includes("la misión pide 30 s")));
});

test("without a microphone the clip is marked silent and the person is told", async () => {
  const { gr, reloj, avisos } = montar({ sonido: false });
  await gr.sacar();
  reloj.ms += 31_000;
  const clip = await gr.guardar();
  assert.equal(clip?.conSonido, false);
  assert.ok(avisos.some((a) => a.texto.includes("sin sonido")));
});

test("a recorder that will not start leaves the Graboso kept, with the reason", async () => {
  const { gr, avisos } = montar({ falla: "captureStream no existe" });
  assert.equal(await gr.sacar(), false);
  assert.equal(gr.estado.fase, "guardado");
  assert.match(gr.estado.error, /no despierta: captureStream no existe/);
  assert.equal(avisos.at(-1)?.importancia, 2);
});

test("a browser with no recordable format refuses before touching the recorder", async () => {
  const { gr, llamadas } = montar({ tipo: "" });
  assert.equal(await gr.sacar(), false);
  assert.deepEqual(llamadas, []);
  assert.match(gr.estado.error, /no sabe grabar/);
});

test("an empty recording keeps the previous clip and says so; the last clip replaces the one before", async () => {
  const { gr, reloj, avisos } = montar();
  await gr.sacar(); reloj.ms += 35_000; const primero = await gr.guardar();
  assert.ok(primero);
  await gr.sacar(); reloj.ms += 40_000; const segundo = await gr.guardar();
  assert.equal(segundo?.duracionS, 40);
  assert.ok(avisos.some((a) => a.texto.includes("se sustituye")));
  gr.quitarClip();
  assert.equal(gr.estado.clip, null);
  const { gr: vacio } = montar({ bytes: 0 });
  await vacio.sacar(); assert.equal(await vacio.guardar(), null);
  assert.match(vacio.estado.error, /no retuvo nada/);
});

test("alternar is the one key: out, kept, out again; nothing while it wakes", async () => {
  const { gr, reloj } = montar();
  const despertando = gr.alternar();
  assert.equal(gr.estado.fase, "despertando");
  assert.equal(await gr.alternar(), false, "a second press while waking does nothing");
  await despertando;
  assert.equal(gr.estado.fase, "grabando");
  reloj.ms += 31_000;
  await gr.alternar();
  assert.equal(gr.estado.fase, "guardado");
  assert.ok(gr.estado.clip);
});
