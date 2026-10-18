// e2e leg N13 (photo mode): a PC tab (1280×720) and, in Chromium, a phone tab (390×844, touch). PC: P hides the whole
// interface (only the world and the photo bar), the avatar stands still while W moves the camera (on its leash), a
// drag turns it, the «Verdemar» filter and the frame go live, Enter makes the picture: a PNG at 2× (device pixel ratio
// 2) whose foot band has the frame's colour and whose pixels lie on the filter's line; «Guardar» downloads it,
// «Copiar enlace» copies `#foto=…`; Esc gives everything back (play camera, keys walk again). The link opened in a
// new tab leaves the address bar, marks the place as the waypoint and turns the camera toward it. Phone: the camera
// button, one finger on the LEFT half turns the camera (no joystick in a photo), the round button shoots and
// «Compartir» hands the PNG file and the link to the Web Share API (stubbed: a headless browser has no share sheet).
// Usage (tools/auto.sh e2e runs it): BASE=http://127.0.0.1:5174/?webgl2&server=ws://127.0.0.1:8792 node tools/e2e-piernas/foto.mjs
import { createRequire } from "node:module";
import { existsSync, statSync, readFileSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const ENGINE = process.env.BROWSER ?? "chromium";
const browser = await (ENGINE === "firefox" ? firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }) : chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }));
const errors = [];
const open = async (ctx, url = BASE) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(url);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && (globalThis.__numinia.carga?.estado ?? "listo") === "listo", null, { timeout: 60000 });
  return p;
};
const checks = {};
const ok = (k, v, data) => { checks[k] = { ok: !!v, ...data }; };
const R = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
const cam = (p) => p.evaluate(() => globalThis.__numinia.view.cam.estado());
const me = (p) => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
const settle = (p) => p.waitForFunction(() => globalThis.__numinia.view.cam.estado().quieta, null, { timeout: 20000 });
/** What is on screen: elements of the page that a person sees (visible and not hidden by visibility). */
const visibles = (p) => p.evaluate(() => ["hud", "barra-arriba", "chat", "misiones", "help", "minimapa", "foto"].filter((id) => {
  const e = document.getElementById(id); if (!e) return false;
  const s = getComputedStyle(e), r = e.getBoundingClientRect();
  return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0;
}));
/** Pixels of the last photo: the foot band's middle and a sample of the picture (to check the filter's line). */
const pixeles = (p) => p.evaluate(async () => {
  const url = await globalThis.__numinia.foto.datos();
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const banda = Array.from(x.getImageData(Math.round(img.width / 2), img.height - 4, 1, 1).data);
  const d = x.getImageData(0, 0, img.width, Math.round(img.height * 0.8)).data, muestra = [];
  for (let i = 0; i < d.length; i += 4 * 4099) muestra.push([d[i], d[i + 1], d[i + 2]]);
  const distintos = new Set(muestra.map((m) => m.join(","))).size;
  return { w: img.width, h: img.height, banda, muestra, distintos };
});

try {
  // ---------------- PC ----------------
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2, acceptDownloads: true });
  if (ENGINE === "chromium") await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const p = await open(ctx);
  await p.bringToFront();
  const antes = await visibles(p);
  await p.mouse.click(640, 400); // focus the page (a click on the world, no drag)
  await p.keyboard.press("KeyP");
  await p.waitForFunction(() => globalThis.__numinia.foto.activo());
  const enFoto = await visibles(p), c0 = await cam(p), m0 = await me(p);
  ok("abrir", c0.modo === "foto" && enFoto.length === 1 && enFoto[0] === "foto" && antes.includes("hud") && antes.includes("barra-arriba"), { antes, enFoto, modo: c0.modo });

  // W walks the camera, not you; Space does not jump
  await p.keyboard.down("KeyW"); await p.waitForTimeout(1000); await p.keyboard.up("KeyW");
  await p.keyboard.press("Space"); // the focused round button: makes a picture (no jump)
  await p.waitForFunction(() => !!globalThis.__numinia.foto.ultima(), null, { timeout: 15000 });
  await p.keyboard.press("Escape"); // back to framing
  await settle(p);
  const c1 = await cam(p), m1 = await me(p);
  const avance = Math.hypot(c1.pivote.x - c0.pivote.x, c1.pivote.z - c0.pivote.z);
  ok("quieto", Math.hypot(m1.x - m0.x, m1.z - m0.z) < 0.01 && Math.abs(m1.y - m0.y) < 0.01 && avance > 0.8 && avance <= 12.01, { avatarSeMueve: R(Math.hypot(m1.x - m0.x, m1.z - m0.z), 3), camaraAvanza: R(avance) });

  // a left drag turns the camera (in play mode a plain left drag also orbits; here it must too, no click)
  await p.mouse.move(500, 400); await p.mouse.down(); await p.mouse.move(700, 380, { steps: 10 }); await p.mouse.up(); await settle(p);
  const c2 = await cam(p);
  ok("girar", Math.abs(c2.yaw - c1.yaw) > 0.5, { giro: R(c2.yaw - c1.yaw) });

  // filter + frame live, then Enter
  await p.keyboard.press("Digit3"); await p.keyboard.press("KeyF");
  const vivo = await p.evaluate(() => ({ filtro: globalThis.__numinia.view.renderer.domElement.style.filter, marco: !document.getElementById("foto-marco").hidden, nombre: document.querySelector("#foto-marco .nombre").textContent }));
  await p.evaluate(() => document.activeElement?.blur?.());
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => !document.querySelector("#foto .foto-hecha").hidden && globalThis.__numinia.foto.ultima()?.nombre, null, { timeout: 15000 });
  const u = await p.evaluate(() => globalThis.__numinia.foto.ultima());
  const px = await pixeles(p);
  const fondo = [0x14, 0x11, 0x0f], verdemar = [0xa6, 0xda, 0xd5];
  // Verdemar = 85 % duotone night → verdemar + 15 % original: every pixel near that line (generous: the 15 % original)
  const enLinea = px.muestra.every(([r, g, b]) => { const t = (g - fondo[1]) / (verdemar[1] - fondo[1]); return Math.abs(r - (fondo[0] + t * (verdemar[0] - fondo[0]))) < 45 && Math.abs(b - (fondo[2] + t * (verdemar[2] - fondo[2]))) < 45; });
  ok("foto", vivo.filtro.includes("foto-f-verdemar") && vivo.marco && vivo.nombre.length > 0 && u.ancho === 2560 && u.alto === 1440 && u.bytes > 20000 && /\.png$/.test(u.nombre)
    && px.w === 2560 && Math.abs(px.banda[0] - fondo[0]) <= 2 && Math.abs(px.banda[1] - fondo[1]) <= 2 && px.distintos > 5 && enLinea,
    { vivo, ultima: u, banda: px.banda, distintos: px.distintos, enLinea, ejemplo: px.muestra.slice(0, 3) });

  // Guardar → a download; Copiar enlace → the clipboard
  const [descarga] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.click("#foto .foto-guardar")]);
  const ruta = await descarga.path(), bytes = ruta ? statSync(ruta).size : 0, cabecera = ruta ? readFileSync(ruta).subarray(1, 4).toString() : "";
  ok("guardar", descarga.suggestedFilename() === u.nombre && bytes === u.bytes && cabecera === "PNG", { archivo: descarga.suggestedFilename(), bytes, cabecera });
  let enlace = u.enlace;
  if (ENGINE === "chromium") {
    await p.click("#foto .foto-copiar-enlace");
    await p.waitForFunction(() => /copiado/i.test(document.querySelector("#foto .foto-hecha .estado").textContent), null, { timeout: 5000 });
    enlace = await p.evaluate(() => navigator.clipboard.readText());
  }
  ok("enlace", /#foto=-?\d+(\.\d)?,-?\d+(\.\d)?,-?\d+(\.\d)?,-?\d+,-?\d+,\d+(\.\d)?$/.test(enlace) && enlace.startsWith(BASE.split("#")[0]) && enlace === u.enlace, { enlace });

  // Esc twice: the picture closes, then the photo mode; everything back, and W walks you again
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  await p.waitForFunction(() => !globalThis.__numinia.foto.activo());
  const fuera = await visibles(p), c3 = await cam(p);
  await p.mouse.click(640, 400);
  await p.keyboard.down("KeyW"); await p.waitForTimeout(600); await p.keyboard.up("KeyW"); await p.waitForTimeout(300);
  const m3 = await me(p);
  ok("cerrar", c3.modo === "juego" && fuera.includes("hud") && fuera.includes("barra-arriba") && !fuera.includes("foto") && Math.hypot(m3.x - m1.x, m3.z - m1.z) > 0.5
    && (await p.evaluate(() => globalThis.__numinia.view.renderer.domElement.style.filter)) === "", { fuera, modo: c3.modo, anda: R(Math.hypot(m3.x - m1.x, m3.z - m1.z)) });

  // the link opened in a new tab: hash taken out, the place is the waypoint, the camera turns toward it
  const q = await open(ctx, enlace);
  await q.waitForFunction(() => globalThis.__numinia.foto.guia()?.estado !== "esperando", null, { timeout: 20000 });
  const g = await q.evaluate(() => ({ guia: globalThis.__numinia.foto.guia(), destino: globalThis.__numinia.mapa.destino(), hash: location.hash, yo: globalThis.__numinia.session.selfPosition(1) }));
  await settle(q);
  const cq = await cam(q);
  const quiere = Math.atan2(-(g.guia.x - g.yo.x), -(g.guia.z - g.yo.z)), dif = Math.abs(Math.atan2(Math.sin(cq.yaw - quiere), Math.cos(cq.yaw - quiere)));
  const lejos = Math.hypot(g.guia.x - g.yo.x, g.guia.z - g.yo.z);
  ok("llegar", g.hash === "" && g.destino?.id === "foto" && Math.abs(g.destino.x - g.guia.x) < 1e-6 && (lejos <= 3 ? g.guia.estado === "llegado" : dif < 0.05), { guia: g.guia, destino: g.destino, hash: g.hash, rumboError: R(dif, 3), lejos: R(lejos) });
  await q.close();
  await ctx.close();

  // ---------------- phone (Chromium: touch through CDP) ----------------
  if (ENGINE === "chromium") {
    const W = 390, H = 844;
    const mctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
    await mctx.addInitScript(() => { // a share sheet that records what it was handed
      globalThis.__compartido = [];
      navigator.canShare = (d) => !!d?.files?.length && d.files.every((f) => f.type === "image/png");
      navigator.share = async (d) => { globalThis.__compartido.push({ files: (d.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })), url: d.url, title: d.title, text: d.text }); };
    });
    const t = await open(mctx);
    const cdp = await mctx.newCDPSession(t);
    const touch = async (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const swipe = async (a, b, steps = 8) => { await touch("touchStart", [a]); for (let i = 1; i <= steps; i++) await touch("touchMove", [[a[0] + ((b[0] - a[0]) * i) / steps, a[1] + ((b[1] - a[1]) * i) / steps]]); await touch("touchEnd", []); };
    const boton = await t.evaluate(() => { const b = document.getElementById("foto-abrir"), r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, visible: r.width > 0 && getComputedStyle(b).visibility !== "hidden" }; });
    await t.touchscreen.tap(boton.x, boton.y);
    await t.waitForFunction(() => globalThis.__numinia.foto.activo());
    const v = await visibles(t), mm0 = await me(t), tc0 = await cam(t);
    // one finger on the LEFT half (the joystick's half in play): in a photo it turns the camera and you stay
    await swipe([W * 0.25, 420], [W * 0.25 + 120, 420]); await settle(t);
    const tc1 = await cam(t), mm1 = await me(t);
    const joy = await t.evaluate(() => getComputedStyle(document.getElementById("joy")).display);
    const disparo = await t.evaluate(() => { const r = document.querySelector("#foto .foto-disparar").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, dentro: r.right <= innerWidth && r.bottom <= innerHeight && r.x >= 0 }; });
    await t.touchscreen.tap(disparo.x, disparo.y);
    await t.waitForFunction(() => !document.querySelector("#foto .foto-hecha").hidden && globalThis.__numinia.foto.ultima(), null, { timeout: 15000 });
    const mu = await t.evaluate(() => ({ u: globalThis.__numinia.foto.ultima(), compartirVisible: !document.querySelector("#foto .foto-compartir").hidden, copiarImagen: !document.querySelector("#foto .foto-copiar-imagen").hidden }));
    const share = await t.evaluate(() => { const r = document.querySelector("#foto .foto-compartir").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await t.touchscreen.tap(share.x, share.y);
    await t.waitForFunction(() => globalThis.__compartido.length > 0, null, { timeout: 5000 });
    const comp = await t.evaluate(() => globalThis.__compartido[0]);
    ok("movil", boton.visible && v.length === 1 && v[0] === "foto" && Math.abs(tc1.yaw - tc0.yaw) > 0.3 && Math.hypot(mm1.x - mm0.x, mm1.z - mm0.z) < 0.01 && joy === "none" && disparo.dentro
      && mu.u.ancho === 780 && mu.u.alto === 1688 && mu.compartirVisible && !mu.copiarImagen
      && comp.files.length === 1 && comp.files[0].type === "image/png" && comp.files[0].size === mu.u.bytes && comp.url === mu.u.enlace && /#foto=/.test(comp.url),
      { boton, visibles: v, giro: R(tc1.yaw - tc0.yaw), anda: R(Math.hypot(mm1.x - mm0.x, mm1.z - mm0.z), 3), joy, ultima: mu.u, compartido: comp });
    await mctx.close();
  }
} catch (e) { checks.excepcion = { ok: false, error: String(e).split("\n").slice(0, 3).join(" | ") }; }
await browser.close();

const allOk = Object.values(checks).every((c) => c.ok) && errors.length === 0 && Object.keys(checks).length >= (ENGINE === "chromium" ? 9 : 8);
console.log(JSON.stringify({ engine: ENGINE, checks, errors }, null, 1));
console.log(allOk ? "E2E FOTO OK" : "E2E FOTO FALLA");
process.exit(allOk ? 0 : 1);
