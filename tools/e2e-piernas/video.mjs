// e2e leg «video»: the video screen in two real browsers, NO network (the leg only checks what the page BUILDS; the
// YouTube address is answered by a fake). Its own engine server (spare port, a world whose web.json lists youtube.com,
// no screens). Person A becomes owner (MOTOR_ADMIN) and says «/video <url> La Nave»; person B (another browser, opened
// ~6 s later) must see the SAME screen with the same start second; both pages draw the player
// (youtube-nocookie.com/embed/<id>) with autoplay+mute, B already ≥4 s further in than A; the iframe is sandboxed, has
// no camera/microphone, no top navigation. No page errors. Env: BASE, CHROME, PW_CORE. Exit 0 = right.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { join } from "node:path";
const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
const { chromium } = createRequire(import.meta.url)(PW);
const RAIZ = new URL("../../", import.meta.url).pathname, TMP = process.env.TMPDIR || "/tmp";
const libre = () => new Promise((ok) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); }); });
const SP = await libre(), DIR = join(TMP, `e2e-video-${SP}`), ADMIN = "codigo-admin-e2e-video-largo", ID = "dQw4w9WgXcQ";
mkdirSync(join(DIR, "entorno"), { recursive: true }); mkdirSync(join(DIR, "datos"), { recursive: true });
writeFileSync(join(DIR, "entorno", "entorno.json"), JSON.stringify({ schema: "numinia-engine/entorno@1", aparicion: { x: 0, z: 0, radio: 1 } }));
writeFileSync(join(DIR, "entorno", "web.json"), JSON.stringify({ schema: "numinia-engine/web@1", dominios: ["youtube.com"], pantallas: [] }));
const servidor = spawn(process.execPath, ["packages/server/src/main.ts"], { cwd: RAIZ, env: { ...process.env, PORT: String(SP), MUNDO_DIR: join(DIR, "entorno"), DATOS_DIR: join(DIR, "datos"), MOTOR_ADMIN: ADMIN, MOTOR_SECRET: "secreto-de-prueba-e2e-video-1234" }, stdio: ["ignore", "pipe", "pipe"] });
let logServidor = ""; servidor.stdout.on("data", (d) => { logServidor += d; }); servidor.stderr.on("data", (d) => { logServidor += d; });
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${SP}/health`)).ok) break; } catch { /* not yet */ } await new Promise((ok) => setTimeout(ok, 250)); }
const PAGINA = BASE.replace(/server=[^&]*/, `server=ws://127.0.0.1:${SP}`) + (BASE.includes("server=") ? "" : `${BASE.includes("?") ? "&" : "?"}server=ws://127.0.0.1:${SP}`);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], res = {}, fallos = [], pide = (ok, m) => { if (!ok) fallos.push(m); };
const abrir = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await ctx.route(/youtube(-nocookie)?\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>reproductor falso</title>" })); // no network: the leg never touches YouTube
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  await p.goto(PAGINA);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 40000 });
  return p;
};
const tiene = (p) => p.evaluate(() => globalThis.__numinia.web.pantallas().map((x) => ({ id: x.id, titulo: x.titulo, inicio: x.inicio, marco: x.marco })));
const fuente = (p) => p.evaluate(() => { const f = document.querySelector("#web-capa iframe.web-iframe"); return f ? { src: f.src, allow: f.getAttribute("allow"), sandbox: f.getAttribute("sandbox"), referrer: f.getAttribute("referrerpolicy") } : null; });
try {
  const A = await abrir();
  await A.evaluate((t) => globalThis.__numinia.chat.decir(t), `/dueño ${ADMIN}`); await A.waitForTimeout(1500);
  await A.evaluate(() => globalThis.__numinia.chat.decir("/video https://www.youtube.com/watch?v=dQw4w9WgXcQ La Nave"));
  await A.waitForFunction(() => globalThis.__numinia.web.pantallas().length === 1, null, { timeout: 15000 }).catch(() => {});
  res.A = await tiene(A);
  await A.waitForTimeout(6000); // B arrives later: its player must start later in the video
  const B = await abrir();
  await B.waitForFunction(() => globalThis.__numinia.web.pantallas().length === 1, null, { timeout: 15000 }).catch(() => {});
  res.B = await tiene(B);
  for (const [n, p] of [["A", A], ["B", B]]) {
    await p.waitForFunction(() => !!document.querySelector("#web-capa iframe.web-iframe"), null, { timeout: 20000 }).catch(() => {});
    res["iframe" + n] = await fuente(p);
  }
  pide(res.A.length === 1 && res.A[0].inicio > 0 && res.A[0].marco === "si", "A no tiene su pantalla de vídeo con reloj y marco «si»: " + JSON.stringify(res.A));
  pide(res.B[0]?.inicio === res.A[0]?.inicio, "A y B no comparten el segundo de inicio");
  const st = (x) => Number(/[?&]start=(\d+)/.exec(x?.src ?? "")?.[1] ?? -1);
  for (const n of ["A", "B"]) {
    const f = res["iframe" + n];
    pide(f && f.src.startsWith(`https://www.youtube-nocookie.com/embed/${ID}?`) && /autoplay=1/.test(f.src) && /mute=1/.test(f.src), `${n}: el reproductor no es el embed con autoplay y mute: ${f?.src}`);
    pide(f && /autoplay/.test(f.allow) && /camera 'none'/.test(f.allow) && /microphone 'none'/.test(f.allow) && !f.sandbox.includes("allow-top-navigation") && f.referrer === "no-referrer", `${n}: permisos del iframe`);
  }
  res.start = { A: st(res.iframeA), B: st(res.iframeB) };
  pide(res.start.A >= 0 && res.start.B - res.start.A >= 4, `B, que entró ~6 s después, debía empezar ≥4 s más adentro que A: ${JSON.stringify(res.start)}`);
} catch (e) { fallos.push("excepción: " + String(e).split("\n")[0]); }
pide(errors.length === 0, "errores en la página: " + errors.slice(0, 3).join(" | "));
await browser.close(); servidor.kill();
console.log(JSON.stringify({ res, fallos }, null, 1));
if (fallos.length) console.log(logServidor.split("\n").filter((l) => l.includes("[web]")).join("\n"));
console.log(fallos.length ? "E2E VIDEO FALLA" : "E2E VIDEO OK");
process.exit(fallos.length ? 1 : 0);
