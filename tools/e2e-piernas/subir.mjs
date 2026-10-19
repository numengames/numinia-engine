// e2e leg H9 (subir): drop your own .glb onto the world. In tab A a model made from activos/casa/bloque.glb with a
// new node name (new bytes, new sha256 every run, so the upload really runs) is dropped (a synthetic drop with a
// DataTransfer) on a point of the ground; B sees the thing appear there and loads its file from /a/<sha256>.glb.
// Then A picks the same file with «Añadir › Subir» (the keyboard path; a real file chooser): HEAD says it is already
// there, so there is no second PUT, and it lands 3 m in front of A. A broken .glb is refused in the page. Both things
// are deleted at the end. Gets BASE and SERVER_HTTP (tools/e2e-piernas/README.md); prints JSON; exit 0 only when right.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

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

/** bloque.glb with another node name: a valid model with bytes (and a sha256) nobody uploaded before. */
function variante(nombre) {
  const glb = new Uint8Array(readFileSync(new URL("../../activos/casa/bloque.glb", import.meta.url)));
  const dv = new DataView(glb.buffer, glb.byteOffset, glb.byteLength), n = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + n)));
  json.nodes[0].name = nombre;
  const enc = new TextEncoder().encode(JSON.stringify(json)), jb = new Uint8Array(Math.ceil(enc.length / 4) * 4).fill(0x20);
  jb.set(enc);
  const rest = glb.subarray(20 + n), out = new Uint8Array(20 + jb.length + rest.length), o = new DataView(out.buffer);
  o.setUint32(0, 0x46546c67, true); o.setUint32(4, 2, true); o.setUint32(8, out.length, true);
  o.setUint32(12, jb.length, true); o.setUint32(16, 0x4e4f534a, true);
  out.set(jb, 20); out.set(rest, 20 + jb.length);
  return Buffer.from(out);
}
const sha = async (b) => Buffer.from(await crypto.subtle.digest("SHA-256", b)).toString("hex");

async function pierna(engine) {
  const browser = await launchers[engine]();
  const ctx = await browser.newContext({ viewport: { width: 480, height: 300 } });
  // the «Novedades» dialog would take the keyboard from «Añadir › Subir» (step 2): mark this version as seen
  await ctx.addInitScript((v) => { try { localStorage.setItem("numinia.novedades.version", v); } catch {} }, JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version);
  const errors = [], puts = [], heads = [];
  const open = async () => {
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.goto(BASE);
    await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0, null, { timeout: 30000 });
    return p;
  };
  const out = { engine, ok: false };
  try {
    const a = await open(), b = await open();
    a.on("request", (r) => { if (r.url().includes("/a/") && r.method() === "PUT") puts.push(r.url()); if (r.url().includes("/a/") && r.method() === "HEAD") heads.push(r.url()); });
    // A may build (the e2e server runs with MOTOR_CONSTRUIR=todos) and knows who it is (its guest token)
    await a.waitForFunction(() => globalThis.__numinia.constructor.estado.puede && !!localStorage.getItem("numinia.invitado"), null, { timeout: 10000 });
    const nombre = `prueba-subir-${engine}-${Date.now().toString(36)}`, glb = variante(nombre), h = await sha(glb);
    const estado = (p) => p.evaluate(() => document.getElementById("subida-estado")?.textContent ?? "");
    const conModelo = (p, m) => p.evaluate((m) => [...globalThis.__numinia.session.features.stateOf("objetos")].filter(([, v]) => v.modelo === m).map(([id, v]) => ({ id, x: v.x, z: v.z, nombre: v.nombre })), m);
    const cargadosB0 = await b.evaluate(() => globalThis.__numinia.view.objects().loaded);

    // 1) drop it on a point of the ground, left of and below the middle of A's screen
    const soltar = (p, bytes, fichero, x, y) => p.evaluate(({ b64, fichero, x, y }) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer(); dt.items.add(new File([bytes], fichero, { type: "model/gltf-binary" }));
      const target = document.elementFromPoint(x, y) ?? document.body, ev = (type) => new DragEvent(type, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true, cancelable: true });
      target.dispatchEvent(ev("dragenter")); target.dispatchEvent(ev("dragover"));
      const capa = document.getElementById("soltar")?.classList.contains("activo") ?? false;
      const suelo = globalThis.__numinia.view.sueloBajo(x, y);
      target.dispatchEvent(ev("drop"));
      return { capa, suelo, capaTrasSoltar: document.getElementById("soltar")?.classList.contains("activo") ?? false };
    }, { b64: Buffer.from(bytes).toString("base64"), fichero, x, y });
    await a.bringToFront();
    const drop = await soltar(a, glb, `${nombre}.glb`, 120, 220);
    await a.waitForFunction(() => /Colocado|No se pudo/.test(document.getElementById("subida-estado")?.textContent ?? ""), null, { timeout: 15000 });
    const tras1 = await estado(a);
    await b.waitForFunction((m) => [...globalThis.__numinia.session.features.stateOf("objetos").values()].some((v) => v.modelo === m), h, { timeout: 5000 });
    await b.waitForFunction((n0) => globalThis.__numinia.view.objects().loaded > n0, cargadosB0, { timeout: 20000 });
    const [enB] = await conModelo(b, h);
    const dibujoB = await b.evaluate(() => globalThis.__numinia.view.objects());
    const servido = await fetch(`${SERVER_HTTP}/a/${h}.glb`).then(async (r) => ({ status: r.status, igual: Buffer.from(await r.arrayBuffer()).equals(glb) }));

    // 2) the same file again, through «Añadir › Subir» (open the builder and its «Añadir» drawer, focus the button, Enter → file chooser)
    let camino = "boton", porQue = "";
    const yo = await a.evaluate(() => globalThis.__numinia.session.selfPosition(0));
    try {
      if (!(await a.evaluate(() => !document.getElementById("panel-construir")?.hidden))) await a.locator("#construir").click({ timeout: 3000 });
      if (await a.evaluate(() => document.getElementById("cajon-anadir")?.hidden !== false)) await a.locator("#dock-anadir").click({ timeout: 3000 });
      await a.locator("#cajon-anadir #subir").focus({ timeout: 3000 });
      const [fc] = await Promise.all([a.waitForEvent("filechooser", { timeout: 5000 }), a.keyboard.press("Enter")]);
      await fc.setFiles({ name: `${nombre}.glb`, mimeType: "model/gltf-binary", buffer: glb });
    } catch (e) {
      porQue = String(e).split("\n")[0].slice(0, 200);
      camino = "input"; // the panel changed shape (another branch): the same input, filled directly
      await a.setInputFiles("#subir-fichero", { name: `${nombre}.glb`, mimeType: "model/gltf-binary", buffer: glb });
    }
    await a.waitForFunction((n) => (globalThis.__numinia.session.features.stateOf("objetos").size >= n) && /Colocado|No se pudo/.test(document.getElementById("subida-estado")?.textContent ?? ""), 2, { timeout: 15000 }).catch(() => {});
    await a.waitForFunction((m) => [...globalThis.__numinia.session.features.stateOf("objetos").values()].filter((v) => v.modelo === m).length >= 2, h, { timeout: 5000 }).catch(() => {});
    const tras2 = await estado(a);
    const enA = await conModelo(a, h);
    const delante = enA.find((o) => o.id !== enB.id);

    // 3) a broken .glb is refused by the page itself (no upload)
    const putsAntes = puts.length;
    await soltar(a, Buffer.from("esto no es un modelo"), "roto.glb", 240, 200);
    await a.waitForFunction(() => /roto\.glb/.test(document.getElementById("subida-estado")?.textContent ?? ""), null, { timeout: 5000 }).catch(() => {});
    const tras3 = await estado(a);

    // 4) clean up: delete both things, B sees them go
    await a.evaluate((ids) => { for (const id of ids) globalThis.__numinia.session.features.send("objetos", "borrar", { id }); }, enA.map((o) => o.id));
    await b.waitForFunction((m) => ![...globalThis.__numinia.session.features.stateOf("objetos").values()].some((v) => v.modelo === m), h, { timeout: 5000 }).catch(() => {});
    const quedanEnB = (await conModelo(b, h)).length;
    const cerca = (p, q, d) => !!p && !!q && Math.abs(p.x - q.x) <= d && Math.abs(p.z - q.z) <= d;
    Object.assign(out, {
      sha256: h.slice(0, 12), drop, tras1, enB, dibujoB, servido, camino, porQue, tras2, delante, yo: { x: Math.round(yo.x * 100) / 100, z: Math.round(yo.z * 100) / 100 },
      puts: puts.length - 0, heads: heads.length, tras3, putsTrasRoto: puts.length - putsAntes, quedanEnB, errors,
    });
    out.ok = drop.capa && !drop.capaTrasSoltar && /Colocado/.test(tras1) && cerca(enB, drop.suelo, 0.02) && enB?.nombre === nombre
      && dibujoB.failed === 0 && servido.status === 200 && servido.igual
      && camino === "boton" && /Ya estaba en el servidor/.test(tras2) && /Colocado/.test(tras2) && enA.length === 2 && cerca(delante, { x: yo.x, z: yo.z - 3 }, 0.6)
      && puts.length === 1 && heads.length === 2 && /No se pudo subir «roto\.glb»/.test(tras3) && out.putsTrasRoto === 0
      && quedanEnB === 0 && errors.length === 0;
  } catch (e) { out.error = String(e).split("\n")[0]; out.errors = errors; }
  await browser.close();
  return out;
}

const results = [];
for (const e of ENGINES) results.push(await pierna(e));
console.log(JSON.stringify(results, null, 1));
const ok = results.every((r) => r.ok);
console.log(ok ? "E2E SUBIR OK" : "E2E SUBIR FALLA");
process.exit(ok ? 0 : 1);
