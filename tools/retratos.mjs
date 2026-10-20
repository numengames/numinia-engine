// Portraits of the house avatars: a real render of each VRM in activos/avatares/catalogo.json, written as WebP to
// apps/plaza/public/retratos/<id>-busto.webp (512×512, the face: HUD card), <id>-cuerpo.webp (512×768, full body, three
// quarters from the front: the «Tú» sheet) and <id>-espalda.webp (512×768, from behind: the sheet's «Girar»). Transparent
// background, arms relaxed out of the T pose. three + @pixiv/three-vrm + MeshoptDecoder (the VRMs are meshopt-compressed,
// E3) in a headless Chromium (playwright-core, software GL), served from this repo's node_modules on a loopback port.
//   node tools/retratos.mjs            every model of the catalogue
//   node tools/retratos.mjs polybot    only those ids
// CHROME=/path/to/chrome when playwright-core has no browser of its own. Run it after adding an avatar to the catalogue
// (test/retratos.test.ts fails while a house avatar has no portrait).
import { createServer } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { extname, join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SALIDA = join(RAIZ, "apps/plaza/public/retratos");
const CALIDAD = 0.85;
const catalogo = JSON.parse(readFileSync(join(RAIZ, "activos/avatares/catalogo.json"), "utf8"));
const pedidos = process.argv.slice(2);
const modelos = catalogo.modelos.filter((m) => !pedidos.length || pedidos.includes(m.id));
if (!modelos.length) { console.error(`retratos: ningún modelo con id ${pedidos.join(", ")} en activos/avatares/catalogo.json`); process.exit(1); }

const PAGINA = `<!doctype html><meta charset="utf-8">
<script type="importmap">{ "imports": { "three": "/node_modules/three/build/three.module.js", "three/addons/": "/node_modules/three/examples/jsm/" } }</script>
<body style="margin:0;background:transparent"><script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { VRMLoaderPlugin, VRMUtils } from "/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js";
const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
r.setPixelRatio(1); r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
const loader = new GLTFLoader(); loader.register((p) => new VRMLoaderPlugin(p)); loader.setMeshoptDecoder(MeshoptDecoder);
window.retratar = async (url, modo, calidad) => {
  const vrm = (await loader.loadAsync(url)).userData.vrm; VRMUtils.rotateVRM0(vrm);
  const s = new THREE.Scene();
  s.add(new THREE.HemisphereLight(0xfff4e6, 0x2a2f3a, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(modo === "espalda" ? -1.2 : 1.2, 2.2, modo === "espalda" ? -2.5 : 2.5); s.add(key);
  const rim = new THREE.DirectionalLight(0x7fd6e0, 1.6); rim.position.set(modo === "espalda" ? 2 : -2, 1.8, modo === "espalda" ? 2 : -2); s.add(rim);
  s.add(vrm.scene);
  const h = vrm.humanoid, hueso = (n) => h.getNormalizedBoneNode(n);
  if (hueso("leftUpperArm")) hueso("leftUpperArm").rotation.z = 1.2; if (hueso("rightUpperArm")) hueso("rightUpperArm").rotation.z = -1.2;
  if (hueso("leftLowerArm")) hueso("leftLowerArm").rotation.y = -0.2; if (hueso("rightLowerArm")) hueso("rightLowerArm").rotation.y = 0.2;
  vrm.update(0);
  const box = new THREE.Box3().setFromObject(vrm.scene), alto = box.max.y - box.min.y;
  const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2;
  let w = 512, hgt = 768, cam;
  if (modo === "busto") {
    hgt = 512; cam = new THREE.PerspectiveCamera(24, 1, 0.05, 50);
    const tramo = alto * 0.44, cy = box.max.y - tramo / 2 + alto * 0.02, d = (tramo * 0.62) / Math.tan(THREE.MathUtils.degToRad(12));
    cam.position.set(cx + d * 0.22, cy + 0.03, cz + d); cam.lookAt(cx, cy, cz);
  } else {
    cam = new THREE.PerspectiveCamera(22, w / hgt, 0.05, 50);
    const cy = box.min.y + alto / 2, d = alto * 2.75, lado = modo === "espalda" ? -1 : 1;
    cam.position.set(cx + lado * d * 0.3, cy + 0.15, cz + lado * d); cam.lookAt(cx, cy, cz);
  }
  r.setSize(w, hgt); r.setClearColor(0x000000, 0); r.render(s, cam);
  vrm.scene.traverse((o) => { o.geometry?.dispose?.(); });
  return r.domElement.toDataURL("image/webp", calidad);
};
window.listo = true;
</script>`;

const TIPOS = { ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm" };
// The only files this server hands out, listed before it starts: the URL is a key into this map, never part of a path.
const SERVIBLES = new Map();
for (const dir of ["node_modules/three/build", "node_modules/three/examples/jsm", "node_modules/@pixiv/three-vrm/lib", "activos/avatares"]) {
  const base = join(RAIZ, dir);
  if (!existsSync(base)) continue;
  for (const rel of readdirSync(base, { recursive: true })) {
    const f = join(base, String(rel));
    if (statSync(f).isFile()) SERVIBLES.set("/" + relative(RAIZ, f).split(sep).join("/"), f);
  }
}
const srv = createServer((q, s) => {
  const u = decodeURIComponent((q.url ?? "/").split("?")[0]);
  if (u === "/") { s.writeHead(200, { "content-type": "text/html" }); return s.end(PAGINA); }
  const f = SERVIBLES.get(u);
  if (!f) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream" }); s.end(readFileSync(f));
});
await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
const puerto = srv.address().port;

const { chromium } = await import("playwright-core");
function chrome() {
  if (process.env.CHROME) return process.env.CHROME;
  try { const p = chromium.executablePath(); if (existsSync(p)) return p; } catch { /* no default install */ }
  throw new Error("retratos: no encuentro Chromium. Pon CHROME=/ruta/a/chrome (p. ej. …/ms-playwright/chromium-1234/chrome-linux64/chrome).");
}
const b = await chromium.launch({ executablePath: chrome(), args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const p = await b.newPage();
  p.on("pageerror", (e) => console.error("retratos: error en la página:", String(e)));
  await p.goto(`http://127.0.0.1:${puerto}/`); await p.waitForFunction(() => window.listo === true);
  mkdirSync(SALIDA, { recursive: true });
  for (const m of modelos) {
    for (const modo of ["busto", "cuerpo", "espalda"]) {
      const data = await p.evaluate(([u, mo, c]) => window.retratar(u, mo, c), [`/${m.fichero}`, modo, CALIDAD]);
      if (!data.startsWith("data:image/webp")) throw new Error(`retratos: este Chromium no codifica WebP (${data.slice(0, 20)}…)`);
      const bytes = Buffer.from(data.split(",")[1], "base64"), destino = join(SALIDA, `${m.id}-${modo}.webp`);
      writeFileSync(destino, bytes);
      console.log(`${m.id} ${modo}: ${bytes.length} B → ${destino.slice(RAIZ.length + 1)}`);
    }
  }
} finally { await b.close(); srv.close(); }
