// e2e leg U12 (huecos): «pinchas el hueco, eliges tu imagen y se encaja sola», with a REAL file chooser, two tabs, for
// chromium and firefox. Tab A (it may build: the e2e server runs with MOTOR_CONSTRUIR=todos) uploads a card (a 768 × 512
// PNG, new bytes every run), hangs it 2.5 m in front of itself and makes it a hole of 2.4 × 1.6 m. Close to it the page
// offers «E: poner tu obra en este hueco»; E opens the file chooser and a 3000 × 1000 PNG goes in: the page shrinks it to
// 2048 px and the server fits it as wide as the frame (scale 0.8); B sees the new picture. Then a click on the hole
// opens the chooser again and a portrait JPEG goes in (as tall as the frame: 1.6). Emptying brings the card back; the
// hole is deleted at the end. Gets BASE and SERVER_HTTP (tools/e2e-piernas/README.md); prints JSON; exit 0 only when right.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { deflateSync } from "node:zlib";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const SERVER_HTTP = process.env.SERVER_HTTP ?? "http://127.0.0.1:8790";
const ENGINES = (process.env.BROWSERS ?? "chromium,firefox").split(",");
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium, firefox } = createRequire(import.meta.url)(PW);
const launchers = {
  chromium: () => chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] }),
  firefox: () => firefox.launch({ firefoxUserPrefs: { "webgl.force-enabled": true } }),
};

/** A plain-colour RGB PNG of w × h (zlib + CRC32: no dependency). */
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function png(w, h, [r, g, b]) {
  const fila = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { fila[1 + 3 * x] = r; fila[2 + 3 * x] = g; fila[3 + 3 * x] = b; }
  const trozo = (tipo, datos) => {
    const t = Buffer.from(tipo, "ascii"), l = Buffer.alloc(4), c = Buffer.alloc(4);
    l.writeUInt32BE(datos.length); c.writeUInt32BE(crc32(Buffer.concat([t, datos])));
    return Buffer.concat([l, t, datos, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", ihdr), trozo("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => fila)))), trozo("IEND", Buffer.alloc(0))]);
}
const sha = async (b) => Buffer.from(await crypto.subtle.digest("SHA-256", b)).toString("hex");

async function pierna(engine) {
  const browser = await launchers[engine]();
  const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
  const errors = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
    return p;
  };
  const out = { engine, ok: false };
  let hueco = null, a = null;
  try {
    a = await open(); const b = await open();
    // listen for file choosers from the start: Playwright turns the interception on asynchronously, and a key pressed
    // in the same breath as the first waitForEvent can beat it (the native picker opens and no event comes)
    const selectores = [];
    a.on("filechooser", (fc) => selectores.push(fc));
    const selector = async (n) => {
      for (let t = 0; t < 100 && selectores.length < n; t++) await a.waitForTimeout(50);
      if (selectores.length < n) throw new Error(`no se abrió el selector de ficheros (vez ${n})`);
      return selectores[n - 1];
    };
    await a.waitForFunction(() => globalThis.__numinia.constructor.estado.puede && !!localStorage.getItem("numinia.invitado"), null, { timeout: 10000 });
    const tono = Date.now() % 200;
    const cartel = png(768, 512, [249, 235, 220 - (tono % 50)]), hc = await sha(cartel);
    const obra = png(3000, 1000, [1, 142, 161 + (tono % 50)]);
    out.paso = "1 cartel";
    // 1) the card goes up (PUT with A's guest token) and hangs 2.5 m in front of A, at 2.2 m, facing it
    const billete = await a.evaluate(() => localStorage.getItem("numinia.invitado"));
    const put = await fetch(`${SERVER_HTTP}/a/${hc}.png`, { method: "PUT", headers: { authorization: `Bearer ${billete}`, "content-type": "image/png" }, body: cartel });
    const yo = await a.evaluate(() => globalThis.__numinia.session.selfPosition(0));
    const sitio = { x: Math.round(yo.x * 100) / 100, y: 2.2, z: Math.round((yo.z - 2.5) * 100) / 100 };
    await a.evaluate(({ hc, sitio }) => globalThis.__numinia.constructor.colocarFichero(hc, "png", "Hueco de prueba", sitio), { hc, sitio });
    await a.waitForFunction((hc) => [...globalThis.__numinia.session.features.stateOf("objetos").values()].some((v) => v.modelo === hc), hc, { timeout: 5000 });
    hueco = await a.evaluate((hc) => [...globalThis.__numinia.session.features.stateOf("objetos")].find(([, v]) => v.modelo === hc)[0], hc);
    await a.evaluate((id) => { const c = globalThis.__numinia.constructor; c.transformar(id, { sx: 1.6, sy: 1.6, sz: 1.6 }); c.hueco(id, 2.4, 1.6); }, hueco);
    await a.waitForFunction((id) => globalThis.__numinia.constructor.huecos().some((h) => h.id === id), hueco, { timeout: 5000 });
    out.paso = "2 E";
    // 2) close to it: the prompt, and E opens the file chooser at once
    await a.bringToFront();
    await a.waitForFunction(() => /poner tu obra en este hueco/.test(document.getElementById("interactuar")?.textContent ?? ""), null, { timeout: 5000 });
    const aviso = await a.evaluate(() => document.getElementById("interactuar")?.textContent ?? "");
    await a.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
    await a.keyboard.press("KeyE");
    const fc = await selector(1);
    await fc.setFiles({ name: "Mar de Ibiza.png", mimeType: "image/png", buffer: obra });
    const estado = (p) => p.evaluate(() => document.getElementById("subida-estado")?.textContent ?? "");
    await a.waitForFunction(() => /Colgada en el hueco|No se pudo/.test(document.getElementById("subida-estado")?.textContent ?? ""), null, { timeout: 20000 });
    const tras1 = await estado(a);
    const de = (p, id) => p.evaluate((id) => { const v = globalThis.__numinia.session.features.stateOf("objetos").get(id); return v && { modelo: v.modelo, ext: v.ext, sx: Math.round(v.sx * 100) / 100, x: Math.round(v.x * 100) / 100, y: Math.round(v.y * 100) / 100, z: Math.round(v.z * 100) / 100, nombre: v.nombre, lleno: v.huecoLleno }; }, id);
    const enA1 = await de(a, hueco);
    await b.waitForFunction(({ id, m }) => globalThis.__numinia.session.features.stateOf("objetos").get(id)?.modelo === m, { id: hueco, m: enA1.modelo }, { timeout: 5000 });
    const enB1 = await de(b, hueco);
    const servida = await fetch(`${SERVER_HTTP}/a/${enA1.modelo}.${enA1.ext}`).then(async (r) => {
      const b = Buffer.from(await r.arrayBuffer()); // what went up: a PNG's IHDR says its size (the page shrank it)
      return { status: r.status, bytes: b.length, ancho: b.length > 24 ? b.readUInt32BE(16) : 0, alto: b.length > 24 ? b.readUInt32BE(20) : 0 };
    });
    out.paso = "3 clic";
    // 3) a click on the hole (play mode) opens the chooser again; a portrait JPEG made by the page itself goes in
    const retrato = await a.evaluate(async () => {
      const l = document.createElement("canvas"); l.width = 600; l.height = 900;
      const g = l.getContext("2d"); g.fillStyle = "#EFA517"; g.fillRect(0, 0, 600, 900); g.fillStyle = "#14110F"; g.fillRect(100, 100, 400, 700);
      const blob = await new Promise((ok) => l.toBlob(ok, "image/jpeg", 0.9));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    });
    const punto = await a.evaluate((s) => globalThis.__numinia.view.editor.pantalla(s.x, s.y, s.z), sitio);
    let camino = "clic";
    const pinchado = punto ? await a.evaluate(({ x, y }) => globalThis.__numinia.view.pickThing(x, y), punto) : null;
    if (punto && pinchado === hueco) await a.mouse.click(punto.x, punto.y);
    else { camino = `boton (bajo el puntero: ${pinchado})`; await a.locator("#interactuar").click(); }
    const fc2 = await selector(2);
    await fc2.setFiles({ name: "Retrato.jpg", mimeType: "image/jpeg", buffer: Buffer.from(retrato) });
    await a.waitForFunction((m) => globalThis.__numinia.session.features.stateOf("objetos").get(m.id)?.modelo !== m.antes && /Colgada en el hueco|No se pudo/.test(document.getElementById("subida-estado")?.textContent ?? ""), { id: hueco, antes: enA1.modelo }, { timeout: 20000 }).catch(() => {});
    const tras2 = await estado(a), enA2 = await de(a, hueco);
    out.paso = "4 vaciar";
    // 4) empty: the card comes back; then delete it (the world stays as it was found)
    await a.evaluate((id) => globalThis.__numinia.constructor.vaciar(id), hueco);
    await a.waitForFunction(({ id, hc }) => globalThis.__numinia.session.features.stateOf("objetos").get(id)?.modelo === hc, { id: hueco, hc }, { timeout: 5000 }).catch(() => {});
    const vacio = await de(a, hueco);
    await a.evaluate((id) => globalThis.__numinia.session.features.send("objetos", "borrar", { id }), hueco);
    await b.waitForFunction((id) => !globalThis.__numinia.session.features.stateOf("objetos").has(id), hueco, { timeout: 5000 }).catch(() => {});
    const quedaEnB = await b.evaluate((id) => globalThis.__numinia.session.features.stateOf("objetos").has(id), hueco);
    hueco = null;
    Object.assign(out, { put: put.status, sitio, aviso, tras1, enA1, enB1, servida, camino, tras2, enA2, vacio, quedaEnB, errors });
    const enSuSitio = (o) => !!o && o.x === sitio.x && o.y === sitio.y && o.z === sitio.z;
    out.ok = (put.status === 200 || put.status === 201) && /E: poner tu obra en este hueco/.test(aviso)
      && /Colgada en el hueco: «Mar de Ibiza»/.test(tras1) && enA1.ext === "png" && enA1.sx === 0.8 && enA1.lleno === true && enSuSitio(enA1)
      && enB1?.modelo === enA1.modelo && enB1.sx === 0.8 && servida.status === 200 && servida.ancho === 2048 && servida.alto === 683
      && /Colgada en el hueco: «Retrato»/.test(tras2) && enA2.ext === "jpg" && enA2.sx === 1.6 && enSuSitio(enA2)
      && vacio?.modelo === hc && vacio.sx === 1.6 && vacio.lleno === false && vacio.nombre === "Hueco de prueba"
      && !quedaEnB && errors.length === 0;
  } catch (e) { out.error = String(e).split("\n")[0]; out.errors = errors; }
  if (hueco && a) await a.evaluate((id) => globalThis.__numinia.session.features.send("objetos", "borrar", { id }), hueco).catch(() => {});
  await browser.close();
  return out;
}

const results = [];
for (const e of ENGINES) results.push(await pierna(e));
console.log(JSON.stringify(results, null, 1));
const ok = results.every((r) => r.ok);
console.log(ok ? "E2E HUECOS OK" : "E2E HUECOS FALLA");
process.exit(ok ? 0 : 1);
