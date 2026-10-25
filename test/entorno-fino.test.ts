// H4b: the builder's fine environment (sky kind, colours, fog, sun, sky picture and HDR light from the library or an upload).
// The pure rules (apps/plaza/entorno-fino-logica.ts), the tier rule that keeps a big HDR off phones and headsets
// (packages/render/src/calidad.ts), and the server/page flow with the fields the panel writes: A changes the sky and names an
// HDR, B receives it. The drawing is checked by the browser leg tools/e2e-piernas/entorno-fino.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ClientPart, Msg } from "../packages/feature/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { crearEntorno } from "../features/entorno/server.ts";
import { crearCliente, CIELOS_CASA } from "../features/entorno/client.ts";
import { ficheroGrandePermitido } from "../packages/render/src/calidad.ts";
import { COLORES, NOMBRE_FICHERO, aHex, cambioColor, deHex, fondoAceptable, notaNivel, opcionesFondo } from "../apps/plaza/entorno-fino-logica.ts";

test("colours: the picker's #rrggbb and the environment's integer round-trip; junk is not a colour", () => {
  for (const n of [0, 0x5d8fc9, 0xffffff, 0x0a0b0c]) assert.equal(deHex(aHex(n)), n);
  assert.equal(aHex(0x0a0b0c), "#0a0b0c");
  assert.equal(deHex("rojo"), null);
  assert.equal(deHex("#fff"), null);
  assert.equal(cambioColor("cieloArriba", "zzz"), null);
  assert.equal(cambioColor("exposicion", "#ffffff"), null, "only the four colour fields");
  assert.deepEqual(cambioColor("solColor", "#ff8800"), { solColor: 0xff8800 });
  assert.deepEqual(cambioColor("cieloHorizonte", "#102030"), { cieloHorizonte: 0x102030 });
  // a hand-picked fog colour turns the fog's «del cielo» off, else the sky would repaint it at once
  assert.deepEqual(cambioColor("nieblaColor", "#a0b0c0"), { nieblaColor: 0xa0b0c0, nieblaAuto: false });
  assert.deepEqual(COLORES.map((c) => c.campo), ["cieloArriba", "cieloHorizonte", "nieblaColor", "solColor"]);
});

test("files: a sky picture takes .hdr .png .jpg .webp, the HDR light only .hdr; the reason says what is allowed", () => {
  for (const f of ["a.hdr", "a.PNG", "a.jpeg", "a.jpg", "a.webp"]) assert.equal(fondoAceptable("imagen", f).ok, true, f);
  assert.equal(fondoAceptable("hdr", "a.hdr").ok, true);
  for (const f of ["a.png", "a.glb", "a"]) { const r = fondoAceptable("hdr", f); assert.equal(r.ok, false, f); assert.match(!r.ok ? r.why : "", /\.hdr/); }
  const r = fondoAceptable("imagen", "a.mp4"); assert.equal(r.ok, false);
  assert.equal(fondoAceptable("imagen", "a.jpeg").ok && (fondoAceptable("imagen", "a.jpeg") as { ext: string }).ext, "jpg");
});

test("library: none, the house skies (each a real <sha256>.hdr), and the current upload when it is neither", () => {
  assert.ok(CIELOS_CASA.length >= 1);
  for (const c of CIELOS_CASA) assert.match(c.hdr, NOMBRE_FICHERO, `${c.id}: the library names a file the server keeps`);
  const sinMas = opcionesFondo("hdr", "", CIELOS_CASA);
  assert.equal(sinMas[0].valor, "");
  assert.equal(sinMas.length, 1 + CIELOS_CASA.length);
  const casa = opcionesFondo("imagen", CIELOS_CASA[0].hdr, CIELOS_CASA);
  assert.equal(casa.length, 1 + CIELOS_CASA.length, "a house sky is not listed twice");
  const sha = createHash("sha256").update("mi cielo").digest("hex") + ".hdr";
  const subido = opcionesFondo("imagen", sha, CIELOS_CASA);
  assert.equal(subido.length, 2 + CIELOS_CASA.length);
  assert.equal(subido.at(-1)!.valor, sha);
  assert.match(subido.at(-1)!.texto, /Subido: [0-9a-f]{8}…\.hdr/);
});

test("tiers: the big HDR (light or background) is fetched only on level A; a plain picture passes everywhere", () => {
  const grande = CIELOS_CASA[0].hdr, foto = "a".repeat(64) + ".webp";
  assert.equal(ficheroGrandePermitido("A", grande), true);
  for (const n of ["B", "C", "D"] as const) {
    assert.equal(ficheroGrandePermitido(n, grande), false, `${n}: no big HDR`);
    assert.equal(ficheroGrandePermitido(n, grande.toUpperCase()), false, `${n}: the extension is read without case`);
    assert.equal(ficheroGrandePermitido(n, foto), true, `${n}: a plain picture is a texture, not an HDR`);
    assert.equal(ficheroGrandePermitido(n, ""), true, `${n}: nothing to fetch is nothing refused`);
  }
  assert.equal(notaNivel("A"), "");
  assert.match(notaNivel("C"), /no se carga el HDR grande/);
});

test("flow: A (a builder) changes the sky colour and names an HDR; B receives exactly those fields; a closed world refuses", () => {
  const mundo = (abierto: boolean) => {
    const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearEntorno()], puede: (_w, accion) => abierto && accion === "construir" });
    const paginas = [0, 1].map((i) => {
      const t = inst.join(i), cli = crearCliente(), vistos: Msg[] = [];
      const s = new ClientSession(t, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, entorno: (v) => vistos.push(v) } });
      return { t, s, c: cli.ambiente, vistos };
    });
    const pump = (n = 3) => { for (let k = 0; k < n; k++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
    pump();
    return { paginas, pump };
  };
  const w = mundo(true), [a, b] = w.paginas;
  const hdr = CIELOS_CASA[0].hdr;
  assert.equal(a.c.ajustar({ ...cambioColor("cieloArriba", "#112233")!, cielo: "degradado", hdr, imagen: hdr, ...cambioColor("nieblaColor", "#445566")!, nieblaCerca: 10, solIntensidad: 5 }).ok, true);
  w.pump();
  const v = b.vistos.at(-1)!;
  assert.equal(v.cieloArriba, 0x112233); assert.equal(v.cielo, "degradado"); assert.equal(v.hdr, hdr); assert.equal(v.imagen, hdr);
  assert.equal(v.nieblaColor, 0x445566); assert.equal(v.nieblaAuto, false); assert.equal(v.nieblaCerca, 10); assert.equal(v.solIntensidad, 5);
  assert.equal(v.preset, "propio");
  // an uploaded name (sha256 of the bytes + .hdr) fits the field
  const subido = createHash("sha256").update("bytes de un hdr").digest("hex") + ".hdr";
  assert.equal(a.c.ajustar({ hdr: subido }).ok, true); w.pump();
  assert.equal(b.vistos.at(-1)!.hdr, subido);
  // closed to building: nobody changes the sky
  const c = mundo(false), [x, y] = c.paginas;
  const antes = y.vistos.at(-1)!.cieloArriba;
  x.c.ajustar({ cieloArriba: 0x010203 }); c.pump();
  assert.equal(y.vistos.at(-1)!.cieloArriba, antes);
  assert.match(x.c.estado.ultimoRechazo, /construir/);
});

test("two quick edits inside one round trip both survive (the second does not undo the first)", () => {
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, features: [crearEntorno()], puede: (_w, accion) => accion === "construir" });
  const tr = inst.join(0), cli = crearCliente(), vistos: Msg[] = [];
  new ClientSession(tr, { features: [cli.part as ClientPart], view: { label() {}, bounce() {}, entorno: (v) => vistos.push(v) } });
  const pump = (n = 3) => { for (let k = 0; k < n; k++) { tr.flush(); inst.tick(); tr.flush(); } };
  pump();
  const base = vistos.at(-1)!;
  // no pump between the two: the page has not heard the server's answer to the first one yet
  cli.ambiente.ajustar({ solColor: 0x112233 });
  cli.ambiente.ajustar({ solIntensidad: 6 });
  cli.ambiente.ajustar({ nieblaCerca: 25 });
  pump();
  const v = vistos.at(-1)!;
  assert.equal(v.solColor, 0x112233); assert.equal(v.solIntensidad, 6); assert.equal(v.nieblaCerca, 25);
  assert.equal(v.cieloArriba, base.cieloArriba, "what nobody touched stays");
  // a preset forgets the quick edits: it is not undone by them
  cli.ambiente.preset("noche"); pump(); cli.ambiente.ajustar({ nieblaCerca: 30 }); pump();
  const n = vistos.at(-1)!;
  assert.equal(n.nieblaCerca, 30);
  assert.notEqual(n.solColor, 0x112233, "the night preset's sun colour is not overwritten by the earlier quick edit");
});
