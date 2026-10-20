// F5 proof: renders 10 s of the creature sound (night: fireflies · day: birds + butterflies, plus a butterfly-close scene) with an
// OfflineAudioContext in headless Chromium, writes WAVs, and checks peak (< -6 dBFS, no clipping) and spectrum sanity.
// Usage: node tools/naturaleza-sonido-wav.mjs <out-dir> — needs a vite dev server on :5411 serving .run/f5/page.html (see docs F5).
import { chromium } from "playwright-core";
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2] ?? "work/naturaleza/audio", URL = process.env.F5_URL ?? "http://127.0.0.1:5411/.run/f5/page.html";
const EXE = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome";
mkdirSync(OUT, { recursive: true });
function wav(pcm, sr) { const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); }
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } } for (let l = 2; l <= n; l <<= 1) { const a = -2 * Math.PI / l; for (let i = 0; i < n; i += l) for (let k = 0; k < l / 2; k++) { const c = Math.cos(a * k), s = Math.sin(a * k), x = i + k, y = x + l / 2, tr = re[y] * c - im[y] * s, ti = re[y] * s + im[y] * c; re[y] = re[x] - tr; im[y] = im[x] - ti; re[x] += tr; im[x] += ti; } } }
function espectro(pcm, sr) { // average magnitude spectrum of the left channel, 4096-pt frames; returns {centroide, f95, rmsDb}
  const x = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2), N = 4096, mag = new Float64Array(N / 2); let frames = 0, sum2 = 0;
  for (let o = 0; o + N <= x.length / 2; o += N) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) { re[i] = x[(o + i) * 2] / 32768 * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); sum2 += (x[(o + i) * 2] / 32768) ** 2; } fft(re, im); for (let k = 0; k < N / 2; k++) mag[k] += Math.hypot(re[k], im[k]); frames++; }
  let tot = 0, cen = 0; for (let k = 1; k < N / 2; k++) { tot += mag[k]; cen += mag[k] * k * sr / N; }
  let acc = 0, f95 = 0; for (let k = 1; k < N / 2; k++) { acc += mag[k]; if (acc >= 0.95 * tot) { f95 = k * sr / N; break; } }
  const bajo = mag.slice(1, Math.floor(80 * N / sr)).reduce((a, b) => a + b, 0) / tot;
  return { centroideHz: Math.round(cen / tot), f95Hz: Math.round(f95), rmsDbFS: +(10 * Math.log10(sum2 / (frames * N) + 1e-12)).toFixed(1), bajo80Hz: +bajo.toFixed(4) };
}
const escenas = [
  { nombre: "noche", hora: 23.5, cx: 20, cz: 15, t0: 0 }, { nombre: "dia", hora: 12, cx: 20, cz: 15, t0: 0 },
  { nombre: "dia-B", hora: 12, cx: 20, cz: 15, t0: 0, nivel: "B" }, { nombre: "noche-C", hora: 23.5, cx: 20, cz: 15, t0: 0, nivel: "C" },
];
const b = await chromium.launch({ executablePath: EXE, args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--no-sandbox", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const p = await b.newPage(); await p.goto(URL); await p.waitForFunction("window.listo === true", null, { timeout: 60000 });
let fallos = 0; const informe = [];
const SITIOS = [[20, 15], [-30, 40], [50, -20], [0, 60], [-50, -50], [70, 70], [-70, 10]];
for (const e of escenas) {
  let r = null; // the spot of the world with the most events in the 10 s (a quiet corner proves nothing)
  for (const [cx, cz] of SITIOS) { const q = await p.evaluate((e) => window.renderizar({ ...e, seg: 10 }), { ...e, cx, cz }); if (!r || q.est.eventos > r.est.eventos) { r = q; e.cx = cx; e.cz = cz; } }
  const pcm = Buffer.from(r.b64, "base64"), dB = 20 * Math.log10(r.pico || 1e-9), esp = espectro(pcm, r.sr);
  writeFileSync(`${OUT}/${e.nombre}.wav`, wav(pcm, r.sr));
  const ok = r.pico > 0 && dB < -6 && esp.centroideHz > 400 && esp.centroideHz < 8000 && esp.bajo80Hz < 0.02 && r.est.eventos > 0;
  if (!ok) fallos++;
  informe.push({ escena: e.nombre, en: `${e.cx},${e.cz}`, nivel: e.nivel ?? "A", picoDbFS: +dB.toFixed(1), ...esp, eventos: r.est.eventos, nodos: r.nodos, vocesTope: r.est.voces, tickMaxMs: +r.tickMax.toFixed(2), tickMedioMs: +r.tickMedio.toFixed(3), ok });
}
console.table(informe); await b.close(); process.exit(fallos ? 1 : 0);
