// N17: web screens (features/web): the world's allow-list, https only, what a site says about being framed, who may put
// or take a screen (owners and the Game Director: STD-052 manage-rituals), the screens of entorno/web.json, the chat's
// /web, and the view's rule for when a wall hides the live page. No network: the site's answer is a fake prober.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { TICK_HZ } from "../packages/sim/src/index.ts";
import chatServer from "../features/chat/server.ts";
import { crearCliente as crearChat } from "../features/chat/client.ts";
import { crearWeb } from "../features/web/server.ts";
import type { Cabeceras } from "../features/web/server.ts";
import { crearCliente as crearWebCliente } from "../features/web/client.ts";
import { web, motivoUrl, videoDe, urlVideo, resumirMarco, dejaEnmarcar, leerWebMundo, normalizarDominio, DOMINIOS_MAX } from "../features/web/feature.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { tapadoPorCajas, SANDBOX, PERMISOS, PERMISOS_VIDEO } from "../packages/render/src/web-politica.ts";

const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
/** numinia.org's real answer on 18-10-2026 (curl -sI https://numinia.org): it refuses every frame. */
const NUMINIA_ORG: Cabeceras = { xfo: "DENY", csp: "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; frame-ancestors 'none'; base-uri 'self'" };

test("web: declared for people and agents; addresses: https on the world's list only, http only for this machine", () => {
  assert.deepEqual(web.issues, []);
  const lista = ["numinia.org", "127.0.0.1:8123"];
  assert.equal(motivoUrl("https://numinia.org/missions/", lista), "");
  assert.equal(motivoUrl("https://www.numinia.org/", lista), "", "a subdomain of a listed domain");
  assert.match(motivoUrl("https://numinia.org.evil.com/", lista), /no está en la lista/);
  assert.match(motivoUrl("https://evilnuminia.org/", lista), /no está en la lista/, "not a suffix match");
  assert.match(motivoUrl("http://numinia.org/", lista), /Solo páginas https/);
  assert.equal(motivoUrl("http://127.0.0.1:8123/pagina.html", lista), "", "plain http for this machine, with the listed port");
  assert.match(motivoUrl("http://127.0.0.1:9999/", lista), /no está en la lista/, "another port is another site");
  assert.match(motivoUrl("https://user:pw@numinia.org/", lista), /usuario/);
  assert.match(motivoUrl("javascript:alert(1)", lista), /Solo páginas https/);
  assert.match(motivoUrl("numinia.org", lista), /URL completa/);
  assert.match(motivoUrl("https://numinia.org/", []), /no tiene lista/);
  assert.equal(normalizarDominio("https://Numinia.ORG/abc"), "numinia.org");
  assert.equal(normalizarDominio("*.numinia.org"), null);
});

test("web: what a site says about framing, and whether THIS page may frame it", () => {
  assert.equal(resumirMarco(NUMINIA_ORG!.xfo, NUMINIA_ORG!.csp), "no", "numinia.org today: a card with «Abrir», no iframe");
  assert.equal(resumirMarco(null, null), "si");
  assert.equal(resumirMarco("SAMEORIGIN", null), "no");
  assert.equal(resumirMarco(null, "default-src 'self'; frame-ancestors 'self'"), "no", "only itself");
  assert.equal(resumirMarco(null, "frame-ancestors *"), "si");
  const lista = resumirMarco(null, "frame-ancestors 'self' https://*.numinia.com https://mundo.ejemplo.org:8443");
  assert.equal(lista, "https://*.numinia.com https://mundo.ejemplo.org:8443");
  assert.equal(dejaEnmarcar(lista, "https://torre.numinia.com"), true);
  assert.equal(dejaEnmarcar(lista, "https://numinia.com"), false, "*.x does not cover x itself");
  assert.equal(dejaEnmarcar(lista, "http://torre.numinia.com"), false, "the scheme counts");
  assert.equal(dejaEnmarcar(lista, "https://mundo.ejemplo.org:8443"), true);
  assert.equal(dejaEnmarcar(lista, "https://mundo.ejemplo.org"), false, "the port counts");
  assert.equal(dejaEnmarcar("no", "https://x.org"), false);
  assert.equal(dejaEnmarcar("?", "https://x.org"), true, "unknown: try (the panel keeps «Abrir»)");
  assert.equal(dejaEnmarcar("https:", "https://x.org"), true);
});

test("web.json: the allow-list and the world's screens; wrong entries are left out and said", () => {
  const { valor, problemas } = leerWebMundo({
    schema: "numinia-engine/web@1", dominios: ["numinia.org", "no es un dominio", "127.0.0.1:8123"],
    pantallas: [
      { id: "archivo", url: "https://numinia.org/", titulo: "El Archivo", x: 0, z: -6, ry: 0 },
      { id: "fuera", url: "https://ejemplo.com/", titulo: "Fuera", x: 0, z: 0 },
      { id: "Mal Id", url: "https://numinia.org/", titulo: "x", x: 0, z: 0 },
      { id: "sin-titulo", url: "https://numinia.org/", x: 0, z: 0 },
    ],
  });
  assert.deepEqual(valor.dominios, ["numinia.org", "127.0.0.1:8123"]);
  assert.deepEqual(valor.pantallas.map((p) => p.id), ["archivo"]);
  assert.deepEqual(problemas.map((p) => p.path), ["web.dominios[1]", "web.pantallas[1].url", "web.pantallas[2].id", "web.pantallas[3].titulo"]);
  assert.equal(leerWebMundo(undefined).valor.dominios.length, 0);
  // the composition root: a world folder with web.json swaps the house part (no list: no screens) for the world's
  const log: string[] = [];
  const partes = conMundo(funciones, (f) => (f === "web.json" ? { dominios: ["numinia.org", "nada nada"] } : undefined), (l) => log.push(l));
  assert.ok(partes.some((p) => p.feature.id === "web"));
  assert.match(log.join("\n"), /web\.json: web\.dominios\[1\]/);
});

test("render: the live page hides behind a solid wall; the iframe never gets camera, microphone or top navigation", () => {
  const pared = [-5, 0, -3.2, 5, 4, -3]; // a wall between z -3.2 and -3
  assert.equal(tapadoPorCajas({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 1.6, z: -6 }, pared), true);
  assert.equal(tapadoPorCajas({ x: 0, y: 1.6, z: -5 }, { x: 0, y: 1.6, z: -6 }, pared), false, "on the screen's side of the wall");
  assert.equal(tapadoPorCajas({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 1.6, z: -3.25 }, pared), false, "a screen hung ON the wall is not hidden by it");
  assert.equal(tapadoPorCajas({ x: 8, y: 1.6, z: 0 }, { x: 8, y: 1.6, z: -6 }, pared), false, "past the wall's end");
  assert.ok(!SANDBOX.includes("allow-top-navigation"));
  for (const p of ["camera", "microphone", "geolocation", "display-capture"]) assert.ok(PERMISOS.includes(`${p} 'none'`), p);
});

/** A headless world with chat, the world's roles and the web screens: n people with identities. */
function mundo(n: number, respuestas: Record<string, Cabeceras> = {}) {
  const log: string[] = [];
  const reloj = { ms: Date.parse("2026-10-18T02:00:00Z") };
  const pedidas: string[] = [];
  const roles = crearRoles({ construir: true, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => reloj.ms, log: (l) => log.push(l) });
  const w = crearWeb({
    dominios: ["numinia.org", "127.0.0.1:8123", "youtube.com"], reloj: () => reloj.ms,
    pantallas: [{ id: "archivo", url: "https://numinia.org/", titulo: "El Archivo", texto: "La memoria de Numinia.", x: 0, y: 2, z: -6 }],
    probar: async (url) => { pedidas.push(url); return respuestas[url] ?? null; },
  });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, w, roles.part], log: (l) => log.push(l), identitySign: sign, puede: (who, accion) => roles.puede(who, accion) });
  const entrar = (i: number) => {
    const t = inst.join(i), c = crearChat(() => reloj.ms), wc = crearWebCliente();
    const s = new ClientSession(t, { features: [c.part, wc.part], identity: keeper() });
    return { t, s, chat: c.chat, web: wc.web };
  };
  const gente = Array.from({ length: n }, (_, i) => entrar(i));
  const pump = (ticks = 2) => { for (let k = 0; k < ticks; k++) { for (const c of gente) c.t.flush(); inst.tick(); for (const c of gente) c.t.flush(); reloj.ms += 1000 / TICK_HZ; } };
  const ultimo = (p: (typeof gente)[number]) => p.chat.lineas.filter((l) => l.tipo === "aviso").map((l) => l.texto).at(-1) ?? "";
  const decir = (p: (typeof gente)[number], texto: string) => { assert.deepEqual(p.chat.decir(texto), { ok: true }, texto); pump(TICK_HZ + 2); };
  return { inst, gente, pump, ultimo, decir, log, pedidas };
}
const esperar = () => new Promise((ok) => setTimeout(ok, 0));

test("web: only owners and the Director put or take screens; the world's own screen arrives with what its site says", async () => {
  const W = mundo(3, { "https://numinia.org/": NUMINIA_ORG, "http://127.0.0.1:8123/pagina.html": { xfo: null, csp: null } });
  const [A, B, C] = W.gente;
  W.pump(3);
  await esperar(); W.pump(2);
  // the file's screen: everyone has it, and the server already asked numinia.org (it refuses frames: a card)
  assert.deepEqual(C.web.pantallas().map((p) => [p.id, p.titulo, p.marco, p.fichero]), [["archivo", "El Archivo", "no", true]]);
  assert.deepEqual(W.pedidas, ["https://numinia.org/"]);
  assert.equal(B.s.features.cards().find((c) => c.feature === "web")?.role, "pantalla", "screen readers and agents read it");
  // a visitor (even one who may build) cannot put a screen
  assert.equal(B.web.estado.puede, false);
  assert.deepEqual(B.web.poner({ url: "http://127.0.0.1:8123/pagina.html", titulo: "Prueba", x: 2, z: -4 }), { ok: true });
  W.pump(2);
  assert.match(B.web.estado.ultimoRechazo, /dueños del mundo y de quien dirige/);
  // A becomes owner: may put; outside the list or plain http to the internet: refused with the reason
  W.decir(A, `/dueño ${ADMIN}`);
  W.pump(3);
  assert.equal(A.web.estado.puede, true);
  A.web.poner({ url: "https://ejemplo.com/", titulo: "Fuera", x: 2, z: -4 }); W.pump(2);
  assert.match(A.web.estado.ultimoRechazo, /no está en la lista/);
  A.web.poner({ url: "http://numinia.org/", titulo: "Sin https", x: 2, z: -4 }); W.pump(2);
  assert.match(A.web.estado.ultimoRechazo, /Solo páginas https/);
  A.web.poner({ url: "http://127.0.0.1:8123/pagina.html", titulo: "Página de prueba", texto: "Una página local", x: 2, y: 1.8, z: -4, ry: 30, ancho: 2.4, alto: 1.5 }); W.pump(2);
  await esperar(); W.pump(2);
  const puesta = C.web.pantallas().find((p) => p.id === "w1")!;
  assert.deepEqual([puesta.url, puesta.titulo, puesta.ry, puesta.ancho, puesta.alto, puesta.marco], ["http://127.0.0.1:8123/pagina.html", "Página de prueba", 30, 2.4, 1.5, "si"]);
  // the file's screen cannot be taken from inside the world; the placed one can, and only by who may
  A.web.quitar("archivo"); W.pump(2);
  assert.match(A.web.estado.ultimoRechazo, /entorno\/web\.json/);
  B.web.quitar("w1"); W.pump(2);
  assert.equal(C.web.pantallas().length, 2);
  A.web.quitar("w1"); W.pump(2);
  assert.deepEqual(C.web.pantallas().map((p) => p.id), ["archivo"]);
});

test("web: from the chat — /web lists, /web <url> [title] puts one in front, /web quitar takes it", async () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(3);
  W.decir(B, "/web https://numinia.org/missions/ Misiones");
  assert.match(W.ultimo(B), /dueños del mundo y de quien dirige/);
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, "/web https://numinia.org/missions/ Las misiones");
  assert.match(W.ultimo(A), /Pantalla w1 puesta/);
  const p = B.web.pantallas().find((x) => x.id === "w1")!;
  const yo = A.s.selfPosition(1);
  assert.equal(p.titulo, "Las misiones");
  assert.ok(Math.abs(p.z - (yo.z - 3)) < 0.1 && Math.abs(p.x - yo.x) < 0.1, "3 m north of who asked");
  W.decir(A, "/web");
  assert.match(W.ultimo(A), /w1: Las misiones \(numinia\.org\)/);
  W.decir(A, "/web quitar w1");
  assert.match(W.ultimo(A), /quitada/);
  assert.deepEqual(B.web.pantallas().map((x) => x.id), ["archivo"]);
  // /web dominio: list, add, and remove, all from the chat
  W.decir(A, "/web dominio");
  assert.match(W.ultimo(A), /Dominios permitidos: numinia\.org, 127\.0\.0\.1:8123/);
  W.decir(A, "/web dominio ejemplo.com");
  assert.match(W.ultimo(A), /Dominio ejemplo\.com añadido/);
  W.decir(A, "/web dominio");
  assert.match(W.ultimo(A), /ejemplo\.com/);
  W.decir(A, "/web dominio quitar ejemplo.com");
  assert.match(W.ultimo(A), /Dominio ejemplo\.com quitado/);
  W.decir(A, "/web dominio quitar numinia.org"); // the file's: not from the chat
  assert.match(W.ultimo(A), /entorno\/web\.json/);
  await esperar();
});

test("web: N17 corte 2 — owners/director add and remove a domain in hot, via the intent (not the file, no restart)", () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(3);
  // a visitor cannot add one
  B.web.dominioPoner("ejemplo.com"); W.pump(2);
  assert.match(B.web.estado.ultimoRechazo, /dueños del mundo y de quien dirige/);
  W.decir(A, `/dueño ${ADMIN}`); W.pump(2);
  // not a domain: rejected, nothing added
  A.web.dominioPoner("no es un dominio"); W.pump(2);
  assert.match(A.web.estado.ultimoRechazo, /no es un dominio/);
  // a good one: accepted, and now screens on it are allowed, without touching entorno/web.json (dominiosArchivo)
  A.web.dominioPoner("https://Ejemplo.COM/algo"); W.pump(2);
  assert.equal(A.web.estado.ultimoDominio, "poner ejemplo.com");
  A.web.poner({ url: "https://ejemplo.com/pagina", titulo: "Ejemplo", x: 2, z: -4 }); W.pump(2);
  assert.ok(B.web.pantallas().some((p) => p.url === "https://ejemplo.com/pagina"), "ejemplo.com is now allowed");
  // adding it again is rejected (already there)
  A.web.dominioPoner("ejemplo.com"); W.pump(2);
  assert.match(A.web.estado.ultimoRechazo, /ya está en la lista/);
  // a domain from entorno/web.json cannot be removed this way
  A.web.dominioQuitar("numinia.org"); W.pump(2);
  assert.match(A.web.estado.ultimoRechazo, /entorno\/web\.json/);
  // removing one never added is rejected
  A.web.dominioQuitar("otro.org"); W.pump(2);
  assert.match(A.web.estado.ultimoRechazo, /no está en la lista de dominios añadidos/);
  // a visitor cannot remove one either
  B.web.dominioQuitar("ejemplo.com"); W.pump(2);
  assert.match(B.web.estado.ultimoRechazo, /dueños del mundo y de quien dirige/);
  // the owner removes it: screens on it are refused again
  A.web.dominioQuitar("ejemplo.com"); W.pump(2);
  assert.equal(A.web.estado.ultimoDominio, "quitar ejemplo.com");
  A.web.poner({ url: "https://ejemplo.com/otra", titulo: "Otra", x: 2, z: -4 }); W.pump(2);
  assert.match(A.web.estado.ultimoRechazo, /no está en la lista/);
});

test("web: N17 corte 2 — the allow-list cap (DOMINIOS_MAX) counts the file's domains and the hot ones together", () => {
  const log: string[] = [];
  const avisos: string[] = [];
  const estado = new Map<string, Record<string, unknown>>();
  const almacen = new Map<string, unknown>();
  let n = 0;
  const intents: Record<string, (f: number, m: Record<string, unknown>) => void> = {};
  const api = {
    state: { get: (k: string) => estado.get(k), set: (k: string, v: Record<string, unknown>) => { estado.set(k, v); return true; }, delete: (k: string) => { estado.delete(k); }, keys: () => [...estado.keys()] },
    store: { get: (k: string) => almacen.get(k), set: (k: string, v: unknown) => { almacen.set(k, v); return true; }, delete: (k: string) => { almacen.delete(k); }, keys: () => [...almacen.keys()] },
    log: (l: string) => log.push(l), onJoin() {}, onIdentify() {}, listen() {}, puede: () => true,
    emit: (_e: string, m: Record<string, unknown>) => { avisos.push(String(m.texto ?? m.motivo ?? "")); return 0; },
    who: () => ({ id: "x", nombre: "A" }), sign: (t: string) => `firma${n++}:${t}`.slice(0, 24),
    on: (intent: string, fn: (f: number, m: Record<string, unknown>) => void) => { intents[intent] = fn; },
  };
  const dominiosArchivo = Array.from({ length: DOMINIOS_MAX - 1 }, (_, i) => `sitio${i}.org`);
  crearWeb({ dominios: dominiosArchivo, pantallas: [], probar: async () => null }).setup(api as never);
  // one more fits exactly at DOMINIOS_MAX
  intents.dominioPoner(1, { dominio: "uno-mas.org" });
  assert.equal(almacen.size, 1, "fits: file has DOMINIOS_MAX-1, this is the last slot");
  intents.dominioPoner(1, { dominio: "otro-mas.org" });
  assert.equal(almacen.size, 1, "the cap holds: no second one was stored");
  assert.match(avisos.join("\n"), new RegExp(`ya tiene ${DOMINIOS_MAX} dominios permitidos`));
});

test("web: N17 corte 2 — a domain added in hot survives a restart (api.store), the file's own list does not change", () => {
  const log: string[] = [];
  const almacen = new Map<string, unknown>(); // the same store across two lives of the server
  const unaVida = (dominiosArchivo: string[]) => {
    const estado = new Map<string, Record<string, unknown>>();
    const intents: Record<string, (f: number, m: Record<string, unknown>) => void> = {};
    const api = {
      state: { get: (k: string) => estado.get(k), set: (k: string, v: Record<string, unknown>) => { estado.set(k, v); return true; }, delete: (k: string) => { estado.delete(k); }, keys: () => [...estado.keys()] },
      store: { get: (k: string) => almacen.get(k), set: (k: string, v: unknown) => { almacen.set(k, v); return true; }, delete: (k: string) => { almacen.delete(k); }, keys: () => [...almacen.keys()] },
      log: (l: string) => log.push(l), onJoin() {}, onIdentify() {}, listen() {}, emit: () => 0, puede: () => true,
      who: () => ({ id: "x", nombre: "A" }), sign: (t: string) => `firma:${t}`,
      on: (intent: string, fn: (f: number, m: Record<string, unknown>) => void) => { intents[intent] = fn; },
    };
    crearWeb({ dominios: dominiosArchivo, pantallas: [], probar: async () => null }).setup(api as never);
    return { intents };
  };
  // vida 1: numinia.org from the file; add ejemplo.com in hot
  const v1 = unaVida(["numinia.org"]);
  v1.intents.dominioPoner(1, { dominio: "ejemplo.com" });
  assert.equal(almacen.size, 1);
  // vida 2: same store (the "restart"); ejemplo.com is not repeated in the file, only learnt from the store
  const v2 = unaVida(["numinia.org"]);
  v2.intents.poner(1, { url: "https://ejemplo.com/pagina", titulo: "x", x: 0, z: 0 });
  assert.ok(log.some((l) => /pone la pantalla/.test(l)), "ejemplo.com, learnt from the store, is still allowed after the restart");
  v2.intents.dominioQuitar(1, { dominio: "ejemplo.com" });
  assert.equal(almacen.size, 0, "removed from the store too, not only from memory");
});

test("web: at start, a placed screen whose site left the list is dropped (and so is a file screen no longer in the file)", () => {
  const log: string[] = [];
  const estado = new Map<string, Record<string, unknown>>([
    ["w1", { url: "https://antes.org/", titulo: "Antes", fichero: false }],
    ["w2", { url: "https://numinia.org/", titulo: "Sigue", fichero: false }],
    ["viejo", { url: "https://numinia.org/", titulo: "Viejo", fichero: true }],
  ]);
  const almacen = new Map<string, unknown>();
  const api = {
    state: { get: (k: string) => estado.get(k), set: (k: string, v: Record<string, unknown>) => { estado.set(k, v); return true; }, delete: (k: string) => { estado.delete(k); }, keys: () => [...estado.keys()] },
    store: { get: (k: string) => almacen.get(k), set: (k: string, v: unknown) => { almacen.set(k, v); return true; }, delete: (k: string) => { almacen.delete(k); }, keys: () => [...almacen.keys()] },
    log: (l: string) => log.push(l), on() {}, onJoin() {}, onIdentify() {}, listen() {}, emit: () => 0, puede: () => false,
  };
  crearWeb({ dominios: ["numinia.org"], pantallas: [], probar: async () => null }).setup(api as never);
  assert.deepEqual([...estado.keys()], ["w2"]);
  assert.match(log.join("\n"), /quito la pantalla w1: antes\.org no está en la lista/);
});

test("video screen: the addresses of a YouTube video, the player's start second, and the permissions it gets", () => {
  for (const u of ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?t=5", "https://www.youtube.com/embed/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/live/dQw4w9WgXcQ"]) assert.equal(videoDe(u), "dQw4w9WgXcQ", u);
  for (const u of ["https://numinia.org/watch?v=dQw4w9WgXcQ", "http://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=corto", "https://www.youtube.com/", "https://youtube.com.malo.com/watch?v=dQw4w9WgXcQ", "no es url"]) assert.equal(videoDe(u), null, u);
  assert.equal(urlVideo("dQw4w9WgXcQ", 1000, 1042.9), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1&start=42");
  assert.match(urlVideo("dQw4w9WgXcQ", 1000, 900), /start=0$/, "a clock that is behind never asks for a negative second");
  assert.equal(motivoUrl("https://youtu.be/dQw4w9WgXcQ", ["youtube.com"]), "", "youtube.com on the list also lets youtu.be");
  assert.notEqual(motivoUrl("https://youtu.be/dQw4w9WgXcQ", ["numinia.org"]), "", "a world without youtube on its list refuses it");
  for (const p of ["camera", "microphone", "geolocation", "display-capture"]) assert.ok(PERMISOS_VIDEO.includes(`${p} 'none'`), p);
  assert.ok(PERMISOS_VIDEO.includes("autoplay") && !PERMISOS.includes("autoplay"), "only a video screen autoplays");
});

test("video screen: /video puts it with the same start second for everybody; the same video put again keeps its clock", async () => {
  const W = mundo(2);
  const [A, B] = W.gente;
  W.pump(3); await esperar(); W.pump(2);
  W.decir(A, `/dueño ${ADMIN}`);
  W.decir(A, "/video https://www.youtube.com/watch?v=dQw4w9WgXcQ La Nave");
  const antes = A.web.pantallas().find((p) => p.titulo === "La Nave");
  assert.ok(antes, "put: " + W.ultimo(A));
  assert.ok(antes.inicio > 0, "stamped with the server's clock");
  assert.equal(antes.marco, "si", "the player is made to be embedded: the server does not need to ask");
  assert.equal(B.web.pantallas().find((p) => p.titulo === "La Nave")?.inicio, antes.inicio, "everybody gets the same start second");
  W.decir(A, "/video https://youtu.be/no");
  assert.match(W.ultimo(A), /no parece un vídeo de YouTube/);
  W.pump(TICK_HZ * 5);
  assert.deepEqual(A.web.poner({ id: antes.id, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", titulo: "La Nave 2", x: 1, z: 1 }), { ok: true });
  W.pump(4);
  assert.equal(A.web.pantallas().find((p) => p.id === antes.id)?.inicio, antes.inicio, "moving or renaming it does not restart the video");
  const web1 = A.web.pantallas().find((p) => p.titulo === "El Archivo");
  assert.equal(web1?.inicio, 0, "an ordinary screen has no clock");
});

// H8 hole-punch: the mouse reaches the page through the canvas only inside the screen's quad on the client
test("puntoEnCuadrilatero: inside, outside, in a tilted quad, whichever way the corners go round", async () => {
  const { puntoEnCuadrilatero } = await import("../packages/render/src/web-politica.ts");
  const q = [{ x: 100, y: 100 }, { x: 300, y: 120 }, { x: 300, y: 220 }, { x: 100, y: 240 }]; // a screen seen from a corner: taller on the left
  assert.equal(puntoEnCuadrilatero(q, 200, 170), true);
  assert.equal(puntoEnCuadrilatero(q, 101, 101), true);
  assert.equal(puntoEnCuadrilatero(q, 299, 125), true);
  assert.equal(puntoEnCuadrilatero(q, 50, 170), false);
  assert.equal(puntoEnCuadrilatero(q, 200, 99), false, "above the slanted top edge");
  assert.equal(puntoEnCuadrilatero(q, 299, 100), false, "above the right end of the top edge (y=120 there)");
  assert.equal(puntoEnCuadrilatero(q, 200, 245), false);
  assert.equal(puntoEnCuadrilatero([...q].reverse(), 200, 170), true, "the other winding");
  assert.equal(puntoEnCuadrilatero([], 1, 1), false);
});

