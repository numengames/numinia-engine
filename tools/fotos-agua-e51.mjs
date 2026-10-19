#!/usr/bin/env node
// E51 photo set (agua con código): the bench page with the whole nature and the pond re-dressed, E03's fixed framings
// («conjunto» / «orilla», angle 120° from the pond's centre), day and night (`__e51.hora(h)` re-applies the demo environment
// at that hour), and a short frame sequence of the pulse front. REAL GPU (WebGPU = Dawn on Vulkan) into an offscreen target.
//   CHROME=… TMPDIR=/tmp flock <lock> node tools/fotos-agua-e51.mjs --salida <dir> [--puerto 5861] [--nivel A] [--solo c,a]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const PUERTO = Number(opt("puerto", 5861)), NIVEL = opt("nivel", "A"), TAM = opt("tam", "1920x1080");
const SALIDA = opt("salida", join(repo, "informes/e51-fotos")), SOLO = opt("solo", "c,a,b,antes").split(",");
const NOCHE = Number(opt("noche", 23)), DIA = Number(opt("dia", 10.5));
if ((process.env.TMPDIR ?? "").length > 60) process.env.TMPDIR = "/tmp";
mkdirSync(SALIDA, { recursive: true });

const { chromium } = await import("playwright-core");
const vite = spawn(process.execPath, [join(repo, "node_modules/vite/bin/vite.js"), "--config", join(repo, "apps/banco/vite.config.mjs")], { cwd: repo, env: { ...process.env, BANCO_PUERTO: String(PUERTO) }, stdio: ["ignore", "inherit", "inherit"] });
let browser = null;
const cerrar = async () => { await browser?.close().catch(() => {}); if (vite.exitCode === null) vite.kill("SIGTERM"); };
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${PUERTO}/`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 150)); }
  browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true,
    args: ["--no-sandbox", "--ignore-gpu-blocklist", "--enable-unsafe-webgpu", "--disable-gpu-sandbox", "--use-angle=vulkan", "--enable-features=Vulkan", "--disable-vulkan-surface", "--enable-webgpu-developer-features"] });
  // pond of seed 1234: centre (17.9, 57.4), radius 17.1 m (same framings as tools/fotos-agua.mjs, angle 120°)
  const E = { x: 17.895532108348768, z: 57.37456597515798, r: 17.105361125431955 };
  const en = (ang, k, y) => [E.x + Math.cos(ang) * E.r * k, y, E.z + Math.sin(ang) * E.r * k];
  const A = (120 * Math.PI) / 180;
  const ENC = {
    conjunto: { pos: en(A, 1.24, null), alto: 2.0, mira: [E.x, -4.6, E.z] },
    orilla: { pos: en(A, 1.16, null), alto: 1.4, mira: en(A - Math.PI / 6, 0.92, -1.0) },
  };
  // [technique, prefix, shots: [hour, framing, name, frames]]
  const PLAN = [
    ["e51-nat-c", "c", [[DIA, "conjunto", "e51-c-dia", 90], [DIA, "orilla", "e51-c-dia-orilla", 90], [NOCHE, "conjunto", "e51-c-noche", 90], [NOCHE, "orilla", "e51-c-noche-orilla", 90],
      ...Array.from({ length: Number(opt("pulsos", 8)) }, (_, i) => [NOCHE, "conjunto", `e51-pulso-t${String(i + 1).padStart(2, "0")}`, 54])]], // 0.75 s apart; pick 4 in a row
    ["e51-nat-a-bin", "a", [[DIA, "conjunto", "e51-a-binarios-dia", 90], [DIA, "orilla", "e51-a-binarios-dia-orilla", 90]]],
    ["e51-nat-b-bin", "b", [[DIA, "conjunto", "e51-b-binarios-dia", 90], [DIA, "orilla", "e51-b-binarios-dia-orilla", 90]]],
    ["e51-nat-a", "antes", [[NOCHE, "conjunto", "e51-antes-a-noche", 90]]],
  ].filter(([, k]) => SOLO.includes(k));
  const hechas = [];
  for (const [t, , tomas] of PLAN) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e.message).slice(0, 300)));
    p.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
    await p.goto(`http://127.0.0.1:${PUERTO}/?${new URLSearchParams({ backend: "webgpu", on: t, nivel: NIVEL, tam: TAM, escena: "naturaleza", camara: "estanque", cuadros: "60", calentar: "5" })}`);
    await p.waitForFunction(() => window.__banco?.estado.listo || window.__banco?.estado.error, null, { timeout: 120000 });
    const err = await p.evaluate(() => window.__banco.estado.error);
    if (err) throw new Error(`${t}: ${err}`);
    const info = await p.evaluate(() => window.__banco.estado.info);
    let hora = DIA;
    for (const [h, k, nombre, cuadros] of tomas) {
      if (h !== hora) {
        const ok = await p.evaluate(async (h) => { if (!window.__e51) return false; await window.__e51.hora(h); return true; }, h);
        if (!ok) throw new Error(`${t}: no __e51 hook for the hour`);
        hora = h;
      }
      const f = ENC[k];
      const url = await p.evaluate(([f, cuadros]) => {
        const B = window.__banco, y = B.suelo(f.pos[0], f.pos[2]) + f.alto;
        return B.retrato({ pos: [f.pos[0], y, f.pos[2]], mira: f.mira, cuadros });
      }, [f, cuadros]);
      const reloj = await p.evaluate(() => window.__e51?.reloj?.() ?? null);
      const archivo = `${NIVEL === "A" ? "" : NIVEL.toLowerCase() + "-"}${nombre}.png`;
      writeFileSync(join(SALIDA, archivo), Buffer.from(url.split(",")[1], "base64"));
      hechas.push({ archivo, hora: h, reloj });
      console.error(`${archivo} · ${h} h · reloj ${reloj?.toFixed?.(2)} · ${info.backend} · ${info.gpu}${errores.length ? " · errores: " + errores.join(" | ") : ""}`);
    }
    await p.close();
  }
  console.log(JSON.stringify({ salida: SALIDA, hechas }, null, 1));
} catch (e) { console.error(String(e?.stack ?? e)); await cerrar(); process.exit(1); }
await cerrar();
