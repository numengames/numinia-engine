// N13 photo mode: the pure parts (filters inside the house palette, the frame, the file name, the link to a place) and
// the camera's "foto" mode (a free camera on a short leash). The page and the PNG: tools/e2e-piernas/foto.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FILTROS, PALETA, filtro, valoresSvg, aplicarMatriz, marco, nombreArchivo, codificarSitio, leerSitio, enlaceSitio, tomarSitioDeLaDireccion, rumboHacia } from "../apps/plaza/foto-nucleo.ts";
import { crearOrbita, CAMARA, haciaMundo } from "../packages/render/src/camara-orbita.ts";

const px = (...c: number[][]) => { const a = new Uint8ClampedArray(c.length * 4); c.forEach((v, i) => a.set([...v, 255], i * 4)); return a; };
const cerca = (a: ArrayLike<number>, b: ArrayLike<number>, tol = 1) => { for (let i = 0; i < b.length; i++) assert.ok(Math.abs(a[i] - b[i]) <= tol, `${Array.from(a)} ≈ ${Array.from(b)}`); };

test("filters: «Natural» changes nothing; the others stay inside the house palette (black → night, white → their light)", () => {
  assert.deepEqual(FILTROS.map((f) => f.id), ["natural", "ambar", "verdemar", "tinta"]);
  const a = px([10, 200, 30]); aplicarMatriz(a, filtro("natural").matriz); assert.deepEqual(Array.from(a.slice(0, 4)), [10, 200, 30, 255]);
  const t = px([0, 0, 0], [255, 255, 255], [255, 0, 0]); aplicarMatriz(t, filtro("tinta").matriz);
  cerca(t.slice(0, 3), PALETA.fondo); cerca(t.slice(4, 7), PALETA.texto);
  // a pure duotone: every pixel lies on the line from night to paper (same proportion in every channel)
  const k = (t[8] - PALETA.fondo[0]) / (PALETA.texto[0] - PALETA.fondo[0]);
  for (let c = 0; c < 3; c++) assert.ok(Math.abs(t[8 + c] - (PALETA.fondo[c] + k * (PALETA.texto[c] - PALETA.fondo[c]))) <= 1.5);
  const v = px([255, 255, 255]); aplicarMatriz(v, filtro("verdemar").matriz); assert.ok(v[1] > v[0] && v[2] > v[0], "verdemar is cool: green and blue over red");
  const w = px([128, 128, 128]); aplicarMatriz(w, filtro("ambar").matriz); assert.ok(w[0] > w[2], "ámbar is warm: red over blue");
  assert.equal(filtro("nada").id, "natural");
  assert.equal(t[3], 255, "alpha untouched");
});

test("filters: the SVG preview carries the same matrix the PNG gets (4 rows of 5, alpha kept)", () => {
  for (const f of FILTROS) {
    if (!f.matriz) continue;
    const n = valoresSvg(f.matriz).split(/\s+/).map(Number);
    assert.equal(n.length, 20);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) assert.ok(Math.abs(n[r * 5 + (c === 3 ? 4 : c)] - f.matriz[r][c]) < 1e-4);
    assert.deepEqual(n.slice(15), [0, 0, 0, 1, 0]);
  }
});

test("frame: thin border, a band at the foot (10 % of the short side), never too small to read", () => {
  const m = marco(1920, 1080);
  assert.equal(m.banda, 108); assert.equal(m.borde, 24); assert.ok(m.letra > 40 && m.letra < m.banda);
  const p = marco(390, 844); assert.equal(p.banda, 39); assert.ok(p.borde >= 4);
  assert.ok(marco(100, 100).banda >= 28);
});

test("file name: the world's name, no accents or spaces, and the moment", () => {
  assert.equal(nombreArchivo("La Torre de los Alquimistas · Ñandú", new Date(2026, 9, 18, 1, 2, 3)), "la-torre-de-los-alquimistas-nandu-20261018-010203.png");
  assert.equal(nombreArchivo("···", new Date(2026, 0, 1, 0, 0, 0)), "mundo-20260101-000000.png");
});

test("link to a place: short, round trip, junk refused", () => {
  const s = { x: 12.345, y: 1.6, z: -40.06, yaw: Math.PI / 4, pitch: 0.35, dist: 6.54 };
  const c = codificarSitio(s);
  assert.equal(c, "12.3,1.6,-40.1,45,20,6.5");
  const r = leerSitio(c)!;
  assert.ok(Math.abs(r.x - 12.3) < 1e-9 && Math.abs(r.yaw - Math.PI / 4) < 1e-9 && r.dist === 6.5);
  assert.equal(codificarSitio({ ...s, yaw: 3 * Math.PI }), "12.3,1.6,-40.1,180,20,6.5", "headings wrap");
  for (const malo of [null, "", "1,2,3", "a,b,c,d,e,f", "1,2,3,400,0,1", "1,2,3,0,0,-1", "1e9,0,0,0,0,1", "1,2,3,0,0,1,7", "1,2,3,0,0," + "1".repeat(90)]) assert.equal(leerSitio(malo as string), null, String(malo));
  assert.equal(enlaceSitio({ origin: "https://torre.example", pathname: "/", search: "?server=x" }, s), "https://torre.example/?server=x#foto=12.3,1.6,-40.1,45,20,6.5");
});

test("link opened: foto= leaves the address bar, anything else in the # stays", () => {
  let url = "";
  const hist = { state: null, replaceState: (_s: unknown, _t: string, u: string) => { url = u; } };
  const s = tomarSitioDeLaDireccion({ hash: "#foto=1,2,3,90,10,5&otro=si", pathname: "/", search: "?webgl2" }, hist);
  assert.ok(s && s.x === 1 && Math.abs(s.yaw - Math.PI / 2) < 1e-9);
  assert.equal(url, "/?webgl2#otro=si");
  assert.equal(tomarSitioDeLaDireccion({ hash: "#pass=abc", pathname: "/", search: "" }, hist), null);
  url = ""; assert.equal(tomarSitioDeLaDireccion({ hash: "#foto=roto", pathname: "/", search: "" }, hist), null); assert.equal(url, "/", "a bad value is still taken out");
});

test("rumboHacia: the heading whose «forward» (W) walks toward the place", () => {
  for (const [dx, dz] of [[0, -5], [5, 0], [-3, 4], [2, 2]]) {
    const y = rumboHacia(0, 0, dx, dz), [x, z] = haciaMundo(0, -1, y), l = Math.hypot(dx, dz);
    assert.ok(Math.abs(x - dx / l) < 1e-9 && Math.abs(z - dz / l) < 1e-9, `${dx},${dz}`);
  }
});

test("camera «foto»: free on a short leash, never first person, back to play exactly as it was", () => {
  const o = crearOrbita(), pies = { x: 0, y: 0, z: 0 };
  o.acercar(0.5); const distJuego = o.meta.dist;
  o.cambiarModo("foto");
  assert.equal(o.modo, "foto"); assert.equal(o.meta.dist, distJuego, "the photo starts from where you looked");
  o.desplazar(0, 100, 0, pies); // walk forward far away: stopped by the leash
  assert.ok(Math.abs(Math.hypot(o.meta.ox, o.meta.oy, o.meta.oz) - CAMARA.foto.alcance) < 1e-9);
  assert.ok(o.meta.oz < 0, "forward at yaw 0 = -z");
  o.desplazar(0, 0, -50, pies); assert.ok(o.pivote(pies, o.meta as never).y >= CAMARA.suelo, "never under the ground");
  o.panear(1, 0, pies); // pan works in photo mode too
  for (let i = 0; i < 40; i++) o.acercar(0.5);
  assert.equal(o.meta.dist, CAMARA.foto.cerca, "close-ups, never first person");
  o.orbitar(0, -10); assert.ok(Math.abs(o.meta.pitch - CAMARA.foto.inclinacion[0]) < 1e-9);
  o.cambiarModo("juego");
  assert.equal(o.meta.dist, distJuego); assert.deepEqual([o.meta.ox, o.meta.oy, o.meta.oz], [0, 0, 0]);
  // building still works as before, and a photo never sees the builder's distance
  o.cambiarModo("construir"); o.cambiarModo("juego"); assert.equal(o.meta.dist, distJuego);
  o.desplazar(1, 1, 1, pies); assert.deepEqual([o.meta.ox, o.meta.oy, o.meta.oz], [0, 0, 0], "desplazar is the photo's only");
});
