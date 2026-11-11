// mundo-hermes · M6: documento (viewer origins), habilidad (grid by group), tablero (three columns), guia (pure steps and lines).
// The overlay itself (open / close / Esc / focus trap / unreachable origin) needs a browser: it is asserted in tools/e2e-espejo.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { conEspejo, claveDe } from "../features/espejo/server.ts";
import type { EnlaceEspejo } from "../features/espejo/server.ts";
import { COLUMNAS_TABLERO, ESQUEMA, LIMITES, leerEspejo, leerObjeto, leerTablero, tableroATexto, tableroDeTexto, vistaPublica } from "../features/espejo/esquema.ts";
import { ORIGEN_DEFECTO, direccionPermitida, leerDireccion, leerOrigen } from "../features/espejo/origenes.ts";
import { FRASES_DEFECTO, MAX_FRASE, aparecerCerca, fraseDe, seguir, siguienteZona, zonaDe } from "../features/espejo/guia.ts";
import { cortar, detalleDe } from "../features/espejo/client.ts";
import { acortar, anchoTexto, sinAcentos } from "../packages/render/src/formas-extra.ts";
import { readFileSync } from "node:fs";
import { fijarIdioma } from "../packages/client/src/idioma.ts";
fijarIdioma("es"); // these checks read the Spanish second language

const PLANTILLA = JSON.parse(readFileSync(new URL("../plantillas/hermes/entorno/espejo.json", import.meta.url), "utf8"));
const OK = [ORIGEN_DEFECTO];

// ---------- origins ----------
test("origins: the local docs server passes, in its normal form, with a path, a query and a fragment", () => {
  for (const u of ["http://127.0.0.1:8791", "http://127.0.0.1:8791/", "http://127.0.0.1:8791/docs/intro?x=1#a"]) {
    const v = direccionPermitida(u, OK, "http://127.0.0.1:3000"); assert.equal(v.ok, true, u);
  }
});
test("origins: javascript:, data:, file:, blob:, about:, ws: and ftp: are refused", () => {
  for (const u of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd", "blob:http://127.0.0.1:8791/x", "about:blank", "ws://127.0.0.1:8791/", "ftp://127.0.0.1:8791/", "JaVaScRiPt:alert(1)"]) {
    const v = direccionPermitida(u, OK); assert.equal(v.ok, false, u);
  }
});
test("origins: a remote origin that is not in the list is refused; the same origin is accepted once the owner lists it", () => {
  const r = direccionPermitida("https://docs.example.com/", OK);
  assert.equal(r.ok, false); assert.match(r.ok ? "" : r.why, /no está en la lista/);
  assert.equal(direccionPermitida("https://docs.example.com/x", [...OK, "https://docs.example.com"]).ok, true);
  assert.equal(direccionPermitida("http://127.0.0.1:9999/", OK).ok, false, "another port is another origin");
  assert.equal(direccionPermitida("https://127.0.0.1:8791/", OK).ok, false, "another scheme is another origin");
  assert.equal(direccionPermitida("http://127.0.0.1:8791/", []).ok, false, "an empty list opens nothing");
});
test("origins: userinfo tricks (the host is the part after the @) are refused", () => {
  for (const u of ["http://127.0.0.1@evil.com/", "http://127.0.0.1:8791@evil.com/", "http://user:pw@127.0.0.1:8791/", "http://127.0.0.1:8791\\@evil.com/", "http://evil.com#@127.0.0.1:8791/", "http://127.0.0.1:8791.evil.com/", "http://evil.com/http://127.0.0.1:8791/"]) {
    assert.equal(direccionPermitida(u, OK).ok, false, u);
  }
});
test("origins: IPv6 and decimal / octal / hex / short IPv4 forms of loopback are refused unless written in the listed form", () => {
  for (const u of ["http://[::1]:8791/", "http://[::ffff:127.0.0.1]:8791/", "http://[0:0:0:0:0:0:0:1]:8791/", "http://2130706433:8791/", "http://0x7f000001:8791/", "http://0x7f.0.0.1:8791/", "http://017700000001:8791/", "http://127.1:8791/", "http://127.0.1:8791/", "http://localhost:8791/", "http://0.0.0.0:8791/"]) {
    assert.equal(direccionPermitida(u, OK).ok, false, u);
  }
  // …and a world that really means ::1 lists it, in the form the parser gives
  assert.equal(leerOrigen("http://[::1]:8791").ok, true);
  assert.equal(direccionPermitida("http://[::1]:8791/", ["http://[::1]:8791"]).ok, true);
});
test("origins: spaces, control characters, backslashes, empty and over-long addresses, non-text are refused; the viewer never opens the world's own origin", () => {
  for (const u of ["", " http://127.0.0.1:8791/", "http://127.0.0.1:8791/a b", "http://127.0.0.1:8791/\u0000", "http:\\\\127.0.0.1:8791/", "http://127.0.0.1:8791/\n", "http://127.0.0.1:8791/" + "a".repeat(400), null, 42, {}]) assert.equal(leerDireccion(u).ok, false, JSON.stringify(u)?.slice(0, 40));
  assert.equal(direccionPermitida("http://127.0.0.1:3000/", ["http://127.0.0.1:3000"], "http://127.0.0.1:3000").ok, false);
});
test("origins: the list in espejo.json — a path, a wildcard, userinfo or a javascript: entry is an error that names its place", () => {
  const con = (origenes: unknown) => leerEspejo({ ...PLANTILLA, documentos: { origenes } });
  assert.equal(con([ORIGEN_DEFECTO, "https://docs.example.com"]).ok, true);
  for (const mal of ["http://127.0.0.1:8791/docs", "http://*.example.com", "javascript:alert(1)", "http://a@b.com", "*", 5]) {
    const r = con([mal]); assert.equal(r.ok, false, String(mal)); if (!r.ok) assert.match(r.issues[0].path, /documentos\.origenes\[0\]/);
  }
  assert.equal(con("http://127.0.0.1:8791").ok, false); assert.equal(con(Array.from({ length: 9 }, (_, i) => `http://127.0.0.${i + 1}:80`)).ok, false);
  const defecto = leerEspejo({ ...PLANTILLA, documentos: undefined }); assert.ok(defecto.ok); if (defecto.ok) assert.deepEqual(defecto.value.documentos.origenes, [ORIGEN_DEFECTO]);
});

// ---------- the things ----------
const zonas = leerEspejo(PLANTILLA);
if (!zonas.ok) throw new Error(JSON.stringify(zonas.issues));
const ESP = zonas.value;
test("the template names Z1 La biblioteca, Z4 El taller and Z9 El tablero, off by default, without overlapping the old floors", () => {
  assert.deepEqual(ESP.zonas.filter((z) => ["z1", "z4", "z9"].includes(z.id)).map((z) => [z.id, z.nombre, z.tipos.join()]), [["z1", "La biblioteca", "documento"], ["z4", "El taller", "habilidad"], ["z9", "El tablero", "tablero"]]);
  for (const f of ["documentos", "habilidades", "kanban", "guia"]) assert.equal(ESP.funciones[f as keyof typeof ESP.funciones], false, f);
  for (let i = 0; i < ESP.zonas.length; i++) for (let j = i + 1; j < ESP.zonas.length; j++) { const a = ESP.zonas[i], b = ESP.zonas[j]; assert.ok(Math.abs(a.x - b.x) >= (a.ancho + b.ancho) / 2 || Math.abs(a.z - b.z) >= (a.fondo + b.fondo) / 2, `${a.id}/${b.id}`); }
  assert.deepEqual(vistaPublica(ESP)!.documentos, { origenes: [ORIGEN_DEFECTO] }, "the page is told the allowlist (it checks again before it sets an iframe src)");
});
test("documento: a good page is kept, a bad origin is refused; the field is refused on other kinds", () => {
  const base = { tipo: "documento", id: "intro", titulo: "Introducción", zona: "z1" };
  const bien = leerObjeto({ ...base, url: "http://127.0.0.1:8791/docs/intro", descripcion: "Primeros pasos" }, ESP); assert.ok(bien.ok); if (bien.ok) { assert.equal(bien.value.url, "http://127.0.0.1:8791/docs/intro"); assert.equal(bien.value.descripcion, "Primeros pasos"); }
  for (const url of ["javascript:alert(1)", "http://evil.com/", "http://127.0.0.1@evil.com/", "http://2130706433:8791/"]) { const r = leerObjeto({ ...base, url }, ESP); assert.equal(r.ok, false, url); if (!r.ok) assert.match(r.issues[0].message, /^dirección no permitida/); }
  assert.equal(leerObjeto({ tipo: "cron", id: "a", titulo: "A", zona: "z7", url: "http://127.0.0.1:8791/" }, ESP).ok, false);
  assert.equal(leerObjeto({ ...base }, ESP).ok, true, "a document without a page is a shelf that says so");
});
test("habilidad: grupo (1-32 bytes) and descripcion (≤200) are kept; the card shows the description cut to 140 characters", () => {
  const h = (extra: Record<string, unknown>) => leerObjeto({ tipo: "habilidad", id: "s1", titulo: "Resumir", zona: "z4", ...extra }, ESP);
  assert.equal(h({ grupo: "Escribir" }).ok, true); assert.equal(h({ grupo: "" }).ok, false); assert.equal(h({ grupo: "x".repeat(33) }).ok, false); assert.equal(h({ grupo: "Ok", descripcion: "y".repeat(201) }).ok, false);
  const larga = "Esta habilidad ".repeat(14).trim(); // 209 chars
  assert.ok(larga.length > 200); const cortaA200 = larga.slice(0, 200);
  const r = h({ grupo: "Escribir", descripcion: cortaA200 }); assert.ok(r.ok); if (!r.ok) return;
  const lineas = detalleDe({ tipo: "habilidad", subtitulo: "", grupo: r.value.grupo, descripcion: r.value.descripcion });
  assert.equal(lineas[0], "Grupo: Escribir"); assert.equal([...lineas[1]].length, 140); assert.ok(lineas[1].endsWith("…"));
  assert.equal(cortar("corto", 140), "corto");
});
test("tablero: three columns with counts and up to three short titles; bad boards are refused with a place", () => {
  const t = leerTablero({ hacer: { n: 12, top: ["Redactar el informe trimestral de ventas", "B", "C"] }, curso: { n: 2, top: ["D"] }, hecho: { n: 140 } });
  assert.ok(t.ok); if (!t.ok) return;
  assert.deepEqual(t.value.hecho, { n: 140, top: [] }); assert.ok([...t.value.hacer.top[0]].length <= LIMITES.tituloTarjeta);
  assert.deepEqual(tableroDeTexto(tableroATexto(t.value)), t.value);
  assert.ok(tableroATexto(t.value).length <= LIMITES.tablero);
  for (const mal of [null, [], { hacer: { n: 1 }, curso: { n: 1 } }, { hacer: { n: -1 }, curso: { n: 0 }, hecho: { n: 0 } }, { hacer: { n: 1, top: ["a", "b", "c", "d"] }, curso: { n: 0 }, hecho: { n: 0 } }, { hacer: { n: 1 }, curso: { n: 0 }, hecho: { n: 0 }, extra: 1 }]) assert.equal(leerTablero(mal).ok, false, JSON.stringify(mal));
  assert.equal(tableroDeTexto("no json"), null); assert.equal(tableroDeTexto(""), null);
  // quotes and backslashes in a title never break the text the state carries
  const q = leerTablero({ hacer: { n: 1, top: ['di "hola" \\ adiós'] }, curso: { n: 0 }, hecho: { n: 0 } }); assert.ok(q.ok); if (q.ok) assert.deepEqual(tableroDeTexto(tableroATexto(q.value)), q.value);
  const o = leerObjeto({ tipo: "tablero", id: "main", titulo: "Trabajo", zona: "z9", tablero: { hacer: { n: 3, top: ["A"] }, curso: { n: 1 }, hecho: { n: 9 } } }, ESP); assert.ok(o.ok);
  assert.deepEqual(COLUMNAS_TABLERO, ["hacer", "curso", "hecho"]);
  const lineas = o.ok ? detalleDe({ tipo: "tablero", subtitulo: "", tablero: o.value.tablero }) : []; assert.deepEqual(lineas, ["Por hacer: 3", "  · A", "En curso: 1", "Hecho: 9"]);
});
test("the board's letters: accents dropped, long titles end with a dot, the width follows the count", () => {
  assert.equal(sinAcentos("Ñandú: añadir"), "NANDU: ANADIR"); assert.equal(acortar("Redactar el informe trimestral", 12), "REDACTAR EL."); assert.equal(acortar("Corto", 12), "CORTO");
  assert.ok(anchoTexto("AB", 0.1) > 0 && anchoTexto("ABC", 0.1) > anchoTexto("AB", 0.1)); assert.equal(anchoTexto("", 1), 0);
});

// ---------- guide, pure ----------
test("guia: every line is plain, ≤ 120 characters, in «usted» and a zone has one; the file may change them; a bad key or text is refused", () => {
  for (const [k, v] of Object.entries(FRASES_DEFECTO)) { assert.ok([...v].length <= MAX_FRASE, k); assert.ok(!/\btú\b|\btu\b|\bpuedes\b|\bquieres\b/i.test(v), `${k}: no «tú»`); }
  for (const z of ESP.zonas) assert.ok(fraseDe(ESP.guia.frases, z.id), `${z.id} has a line`);
  const con = (frases: unknown) => leerEspejo({ ...PLANTILLA, guia: { frases } });
  const buena = con({ z0: "Pase, por favor.", "tocar:cron": "Eso es un reloj." }); assert.ok(buena.ok); if (buena.ok) assert.equal(buena.value.guia.frases.z0, "Pase, por favor.");
  for (const mal of [{ z99: "hola" }, { z0: "x".repeat(121) }, { z0: "" }, { z0: "una\nlínea" }, { z0: 4 }, { "tocar:dragon": "hola" }]) assert.equal(con(mal).ok, false, JSON.stringify(mal));
  assert.equal(leerEspejo({ ...PLANTILLA, guia: { recorrido: ["z0", "z99"] } }).ok, false);
  assert.equal(vistaPublica({ ...ESP, guia: { ...ESP.guia, definida: false } })!.guia, undefined);
  assert.deepEqual(Object.keys(vistaPublica(ESP)!.guia!).sort(), ["frases", "recorrido"]);
});
test("guia: the tour goes zone by zone and wraps; zones are found by their floor", () => {
  const r = ["z0", "z7", "z1"]; assert.equal(siguienteZona(r, null), "z0"); assert.equal(siguienteZona(r, "z0"), "z7"); assert.equal(siguienteZona(r, "z1"), "z0"); assert.equal(siguienteZona(r, "z5"), "z0"); assert.equal(siguienteZona([], "z0"), null);
  assert.equal(zonaDe(0, 0, ESP.zonas), "z0"); assert.equal(zonaDe(0, 28, ESP.zonas), "z1"); assert.equal(zonaDe(500, 500, ESP.zonas), null);
});
test("guia: she appears 3 m from the visitor, follows smoothly and never faster than 7 m/s, holds still when near, and is simply there after a teleport", () => {
  const visita = { x: 10, z: 10 }, a = aparecerCerca(visita); assert.ok(Math.abs(Math.hypot(a.x - 10, a.z - 10) - 3) < 1e-9);
  assert.deepEqual(seguir({ x: a.x, z: a.z }, visita, 0.05), { x: a.x, z: a.z, rumbo: seguir(a, visita, 0.05).rumbo }, "at 3 m she does not move");
  let p = { x: 10, z: 22 }; let ult = Infinity;
  for (let i = 0; i < 300; i++) { const n = seguir(p, visita, 0.05); assert.ok(Math.hypot(n.x - p.x, n.z - p.z) <= 7 * 0.05 + 1e-9, "speed cap"); p = n; ult = Math.hypot(p.x - 10, p.z - 10); }
  assert.ok(ult >= 2 && ult <= 3.5, `settles near 3 m (${ult})`);
  const lejos = seguir({ x: 400, z: 400 }, visita, 0.05); assert.ok(Math.abs(Math.hypot(lejos.x - 10, lejos.z - 10) - 3) < 1e-9, "after a teleport");
  assert.deepEqual(seguir({ x: 50, z: 50 }, { x: 0, z: 0 }, 0.05), seguir({ x: 50, z: 50 }, { x: 0, z: 0 }, 0.05), "pure");
});

// ---------- on the server ----------
const sign = signer("una-clave-de-prueba-larga");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
function mundo(funcionesOn: Record<string, boolean>, extra: Record<string, unknown> = {}) {
  const archivos = new Map<string, unknown>([["espejo.json", { ...PLANTILLA, funciones: { ...PLANTILLA.funciones, ...funcionesOn }, ...extra }]]);
  const log: string[] = [];
  const lista = conMundo([...funciones], (f) => archivos.get(f), (l) => log.push(l));
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign });
  const t = inst.join(0), s = new ClientSession(t, { features: [], identity: keeper() });
  const pump = () => { for (let i = 0; i < 3; i++) { t.flush(); inst.tick(); t.flush(); } };
  pump();
  return { inst, s, pump, log, enlace: lista.find(conEspejo)!.enlace as EnlaceEspejo };
}
test("server: a document with a good page is published with its url; one with a bad origin is left out; with `documentos` off it is refused", () => {
  const W = mundo({ documentos: true });
  const r = W.enlace.lote([
    { tipo: "documento", id: "intro", titulo: "Introducción", zona: "z1", url: "http://127.0.0.1:8791/docs/intro", descripcion: "Primeros pasos" },
    { tipo: "documento", id: "malo", titulo: "Malo", zona: "z1", url: "http://127.0.0.1@evil.com/" },
  ]); assert.equal(r.ok, true, JSON.stringify(r)); W.pump();
  const st = W.s.features.stateOf("espejo"), k = claveDe("documento", "intro");
  assert.equal(st.get(k)?.url, "http://127.0.0.1:8791/docs/intro"); assert.equal(st.has(claveDe("documento", "malo")), false, "the bad one is not in the world");
  const off = mundo({}); const r2 = off.enlace.alta({ tipo: "documento", id: "x", titulo: "X", zona: "z1", url: "http://127.0.0.1:8791/" }); assert.equal(r2.ok, false);
});
test("server: skills sit in rows by group on the tablet grid, a tablet keeps its place, two never share one, and none leaves the floor", () => {
  const W = mundo({ habilidades: true });
  const hs = [["a", "Escribir"], ["b", "Escribir"], ["c", "Buscar"], ["d", "Escribir"], ["e", "Buscar"], ...Array.from({ length: 30 }, (_, i) => [`m${i}`, "Muchas"])].map(([id, grupo]) => ({ tipo: "habilidad", id, titulo: `Hab ${id}`, grupo, descripcion: "Hace algo útil", estado: id === "b" ? "apagado" : "activo", zona: "z4" }));
  assert.equal(W.enlace.lote(hs).ok, true); W.pump();
  const st = W.s.features.stateOf("espejo"), z4 = ESP.zonas.find((z) => z.id === "z4")!;
  const pos = (id: string) => { const v = st.get(claveDe("habilidad", id))!; return { x: Number(v.x), z: Number(v.z) }; };
  const a = pos("a"), b = pos("b"), c = pos("c"), d = pos("d"), e = pos("e");
  assert.equal(a.z, b.z); assert.equal(a.z, d.z, "same group, same row"); assert.ok(b.x > a.x && d.x > b.x, "left to right"); assert.equal(c.z, e.z); assert.ok(c.z > a.z, "the second group is a row further");
  const todos = new Set<string>(); for (const [k, v] of st) if (k.startsWith("habilidad/")) { const x = Number(v.x), z = Number(v.z); assert.ok(Math.abs(x - z4.x) <= z4.ancho / 2 && Math.abs(z - z4.z) <= z4.fondo / 2 + 8, "inside"); const key = `${x.toFixed(2)},${z.toFixed(2)}`; assert.ok(!todos.has(key), `no overlap at ${key}`); todos.add(key); }
  assert.equal(st.get(claveDe("habilidad", "a"))?.grupo, "Escribir"); assert.equal(st.get(claveDe("habilidad", "b"))?.estado, "apagado");
  W.enlace.cambio({ tipo: "habilidad", id: "b", estado: "activo" }); W.pump(); assert.deepEqual(pos("b"), b, "a change keeps the place");
});
test("server: the work board carries its three columns as text and the page reads them back; the guide is a page-only switch the source never hears of", () => {
  const W = mundo({ kanban: true, guia: true });
  const tab = { hacer: { n: 3, top: ["Uno", "Dos"] }, curso: { n: 1, top: ["Tres"] }, hecho: { n: 20, top: [] } };
  assert.equal(W.enlace.alta({ tipo: "tablero", id: "trabajo", titulo: "Trabajo", zona: "z9", tablero: tab }).ok, true); W.pump();
  const v = W.s.features.stateOf("espejo").get(claveDe("tablero", "trabajo"))!; assert.deepEqual(tableroDeTexto(String(v.tablero)), tab);
  assert.deepEqual(W.enlace.funciones().sort(), ["kanban", "salud"].sort(), "«guia» is not told to the source");
  assert.equal(W.enlace.alta({ tipo: "tablero", id: "malo", titulo: "Malo", zona: "z9", tablero: { hacer: { n: 1 } } }).ok, false);
});
test("server: with every M6 switch off the new things are refused and nothing of them reaches the shared state", () => {
  const W = mundo({}); for (const c of [{ tipo: "documento", id: "a", titulo: "A", zona: "z1" }, { tipo: "habilidad", id: "a", titulo: "A", zona: "z4", grupo: "g" }, { tipo: "tablero", id: "a", titulo: "A", zona: "z9", tablero: { hacer: { n: 0 }, curso: { n: 0 }, hecho: { n: 0 } } }]) assert.equal(W.enlace.alta(c).ok, false, c.tipo);
  W.pump(); assert.deepEqual([...W.s.features.stateOf("espejo").keys()].filter((k) => /^(documento|habilidad|tablero)\//.test(k)), []);
  void ESQUEMA;
});
