#!/usr/bin/env node
// E03 photo set: the bench page (apps/banco) with the whole nature and the pond re-dressed, a fixed camera per framing,
// rendered on the REAL GPU (WebGPU = Dawn on Vulkan, RTX 4080) into an offscreen target and read back as PNG.
//   flock <lock> node tools/fotos-agua.mjs --salida <dir> [--nivel A] [--tam 1920x1080] [--prueba] [--tecnicas naturaleza,e03-nat-a]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const PUERTO = Number(opt("puerto", 5831)), NIVEL = opt("nivel", "A"), TAM = opt("tam", "1920x1080");
const SALIDA = opt("salida", join(repo, "informes/e03-fotos")), PRUEBA = args.includes("--prueba"), BACKEND = opt("backend", "webgpu");
const PREFIJO = opt("prefijo", "e03");
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
  // pond of seed 1234: centre (17.9, 57.4), radius 17.1 m. Framings are in pond-relative terms (angle from its centre).
  const E = { x: 17.895532108348768, z: 57.37456597515798, r: 17.105361125431955 };
  const en = (ang, k, y) => [E.x + Math.cos(ang) * E.r * k, y, E.z + Math.sin(ang) * E.r * k];
  const ENCUADRES = PRUEBA
    ? Object.fromEntries([0, 60, 120, 180, 240, 300].map((g) => [`prueba-${g}`, { pos: en((g * Math.PI) / 180, 1.45, null), alto: 1.8, mira: [E.x, -0.6, E.z] }]))
    : {
      conjunto: { pos: en((Number(opt("angulo", 120)) * Math.PI) / 180, 1.24, null), alto: 2.0, mira: [E.x, -4.6, E.z] },
      orilla: { pos: en((Number(opt("angulo", 120)) * Math.PI) / 180, 1.16, null), alto: 1.4, mira: en(((Number(opt("angulo", 120)) - 30) * Math.PI) / 180, 0.92, -1.0) },
    };
  const tecnicas = opt("tecnicas", "naturaleza,e03-nat-a,e03-nat-b,e03-nat-a-bin,e03-nat-b-bin").split(",");
  const NOMBRE = { naturaleza: "antes-e01", "e03-nat-a": "a-continuo", "e03-nat-b": "b-bandas", "e03-nat-a-bin": "a-binarios", "e03-nat-b-bin": "b-binarios" };
  const hechas = [];
  for (const t of tecnicas) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e.message).slice(0, 300)));
    p.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
    await p.goto(`http://127.0.0.1:${PUERTO}/?${new URLSearchParams({ backend: BACKEND, on: t, nivel: NIVEL, tam: TAM, escena: "naturaleza", camara: "estanque", cuadros: "60", calentar: "5" })}`);
    await p.waitForFunction(() => window.__banco?.estado.listo || window.__banco?.estado.error, null, { timeout: 120000 });
    const err = await p.evaluate(() => window.__banco.estado.error);
    if (err) throw new Error(`${t}: ${err}`);
    const info = await p.evaluate(() => window.__banco.estado.info);
    for (const [k, f] of Object.entries(ENCUADRES)) {
      const url = await p.evaluate(([f]) => {
        const B = window.__banco, y = B.suelo(f.pos[0], f.pos[2]) + f.alto;
        return B.retrato({ pos: [f.pos[0], y, f.pos[2]], mira: f.mira, cuadros: 90 });
      }, [f]);
      const nombre = `${PREFIJO}-${NIVEL === "A" ? "" : NIVEL.toLowerCase() + "-"}${NOMBRE[t] ?? t}${k === "conjunto" ? "" : "-" + k}.png`;
      writeFileSync(join(SALIDA, nombre), Buffer.from(url.split(",")[1], "base64"));
      hechas.push(nombre);
      console.error(`${nombre} · ${info.backend} · ${info.gpu}${errores.length ? " · errores: " + errores.join(" | ") : ""}`);
    }
    await p.close();
  }
  console.log(JSON.stringify({ salida: SALIDA, hechas }, null, 1));
} catch (e) { console.error(String(e?.stack ?? e)); await cerrar(); process.exit(1); }
await cerrar();
