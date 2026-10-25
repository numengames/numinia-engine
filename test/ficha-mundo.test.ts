// H7 «ajustes del mundo»: the owner sets title, picture, default avatar and people limit from inside the world.
// Headless: real instance + real pages + the real file writer on a temp dir. The server checks `mandar`, validates with the same rules the
// file has at start, rewrites ONLY those keys of aventura/ficha.json (atomic; every other key kept) and every page gets the new state; the
// door's aforo follows the new limit and nobody inside is put out. The form (apps/plaza/ficha-mundo.ts) is checked as a plain-DOM unit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import { conFicha } from "../packages/feature/src/index.ts";
import { crearFichaViva } from "../packages/server/src/ficha-viva.ts";
import { leerFicha, AVATARES_CASA } from "../packages/server/src/aventura.ts";
import { crearFichaMundo, NO_PUEDE } from "../features/ficha-mundo/server.ts";
import { crearCliente } from "../features/ficha-mundo/client.ts";
import { fichaMundo } from "../features/ficha-mundo/feature.ts";

const SHA = "a".repeat(64);
const carpeta = (ficha?: unknown) => {
  const dir = mkdtempSync(join(tmpdir(), "ficha-mundo-"));
  if (ficha !== undefined) writeFileSync(join(dir, "ficha.json"), typeof ficha === "string" ? ficha : JSON.stringify(ficha));
  return dir;
};
const leer = (dir: string) => JSON.parse(readFileSync(join(dir, "ficha.json"), "utf8"));
const ORIGINAL = { formato: "ficha@1", nombre: "Plaza vieja", descripcion: "Un sitio", notas: "para la gente", tema: { acento: "#ff0000" }, audio: { ambiente: "ambiente-numinia" } };

/** A world as server.ts wires it: viva (the file's owner), the piece (who/what), `n` pages. `puede(e)` = may this entity «mandar». */
function mundo(dir: string, n: number, puede: (e: number) => boolean = () => true, tieneImagen = (h: string) => h === SHA) {
  const log: string[] = [];
  const { ficha } = leerFicha(dir);
  let dentro = 0;
  const viva = crearFichaViva({ aventura: dir, ficha, maxPlayers: 1000, tieneImagen, dentro: () => dentro, log: (l) => log.push(l) });
  const parte = crearFichaMundo();
  assert.ok(conFicha(parte));
  parte.ficha.conectar({ ajustes: viva.ajustes, cambiar: viva.cambiar });
  const inst = new Instance({ seed: 3, capacity: 8, k: 50, snapshotEvery: 2, features: [parte], log: (l) => log.push(l), aparicion: { x: 0, z: 0, radio: 1 }, puede: (_w, accion, e) => accion === "mandar" && puede(e) });
  const pages = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), c = crearCliente();
    const s = new ClientSession(t, { features: [c.part], view: { label() {}, bounce() {} } });
    return { t, s, aj: c.ajustes };
  });
  const pump = (ticks = 4) => { for (let i = 0; i < ticks; i++) { for (const p of pages) p.t.flush(); inst.tick(); for (const p of pages) p.t.flush(); } };
  pump();
  return { inst, pages, pump, log, viva, ponerDentro: (k: number) => { dentro = k; } };
}
const eventos = (s: ClientSession, ev: string) => s.features.log.filter((l) => l.feature === "ficha-mundo" && l.event === ev);
const cambio = { nombre: "Plaza nueva", portada: `${SHA}.png`, avatar: AVATARES_CASA[0], aforo: 3 };

test("the declaration meets the plug's rules; the piece is declared", () => {
  assert.deepEqual(fichaMundo.issues, []);
});

test("a guest (no «mandar») is refused: the file and every page stay as they were", () => {
  const dir = carpeta(ORIGINAL);
  const original = readFileSync(join(dir, "ficha.json"), "utf8");
  const { pages: [a, b], pump } = mundo(dir, 2, () => false);
  assert.equal(a.aj.actual()?.nombre, "Plaza vieja");
  assert.equal(a.aj.estado.puede, false);
  assert.ok(a.aj.guardar(cambio).ok, "the page only checks the message's shape");
  pump();
  assert.equal(eventos(a.s, "rechazado").at(-1)?.msg.motivo, NO_PUEDE);
  assert.equal(readFileSync(join(dir, "ficha.json"), "utf8"), original, "byte for byte the same");
  assert.equal(b.aj.actual()?.nombre, "Plaza vieja");
});

test("who rules saves: the file keeps every key it does not own, atomically; every page gets the new settings at once", () => {
  const dir = carpeta(ORIGINAL);
  const { pages: [a, b], pump, viva } = mundo(dir, 2);
  assert.equal(a.aj.estado.puede, true);
  const vistos: string[] = []; b.aj.alCambiar((x) => vistos.push(x.nombre));
  a.aj.guardar(cambio); pump();
  const f = leer(dir);
  assert.deepEqual(f, { ...ORIGINAL, nombre: "Plaza nueva", portada: `${SHA}.png`, avatar: AVATARES_CASA[0], aforo: 3 });
  assert.deepEqual(readdirSync(dir), ["ficha.json"], "no temporary file left behind");
  for (const p of [a, b]) {
    assert.deepEqual({ ...p.aj.actual() }, { nombre: "Plaza nueva", portada: `${SHA}.png`, avatar: AVATARES_CASA[0], aforo: 3, capacidad: 1000, guardado: true });
    assert.equal(eventos(p.s, "cambiado").at(-1)?.msg.nombre, "Plaza nueva");
  }
  assert.deepEqual(vistos.slice(-1), ["Plaza nueva"], "the title listener is told");
  assert.equal(viva.aforo(), 3, "the door follows the file");
  assert.equal(leerFicha(dir).ficha?.aforo, 3, "and a restart reads the same thing back");
});

test("aforo: 0 = the engine's capacity; above it the engine's capacity wins; lowering it below who is inside puts nobody out", () => {
  const dir = carpeta(ORIGINAL);
  const { viva, ponerDentro } = mundo(dir, 1);
  assert.equal(viva.aforo(), 1000);
  ponerDentro(5);
  const r = viva.cambiar({ ...cambio, aforo: 2 }, "t");
  assert.ok(r.ok);
  assert.equal(viva.aforo(), 2);
  assert.equal(viva.ajustes().dentro, 5, "five still inside: the next one finds the door closed (inst.conns.length >= aforo)");
  assert.ok(viva.cambiar({ ...cambio, aforo: 0 }, "t").ok);
  assert.equal(viva.aforo(), 1000);
  assert.equal("aforo" in leer(dir), false, "0 = the key leaves the file");
});

test("bad settings are refused with a reason and never touch the file", () => {
  const dir = carpeta(ORIGINAL);
  const original = readFileSync(join(dir, "ficha.json"), "utf8");
  const { viva } = mundo(dir, 1);
  const malo = (c: Partial<typeof cambio>, re: RegExp) => { const r = viva.cambiar({ ...cambio, ...c }, "t"); assert.equal(r.ok, false); assert.match((r as { texto: string }).texto, re); };
  malo({ nombre: "  " }, /nombre/i);
  malo({ nombre: "x".repeat(61) }, /nombre/);
  malo({ nombre: "<b>" }, /nombre/);
  malo({ portada: "http://malo.example/x.png" }, /imagen/i);
  malo({ portada: `${"b".repeat(64)}.png` }, /no está en este servidor/);
  malo({ avatar: "no-existe" }, /avatar/);
  malo({ aforo: 5000 }, /aforo/);
  malo({ aforo: 1.5 }, /aforo/);
  assert.equal(readFileSync(join(dir, "ficha.json"), "utf8"), original);
});

test("a broken ficha.json is never overwritten; a world without one gets one created", () => {
  const roto = carpeta("{ no es json");
  const { viva } = mundo(roto, 1);
  const r = viva.cambiar(cambio, "t");
  assert.equal(r.ok, false); assert.match((r as { texto: string }).texto, /JSON/);
  assert.equal(readFileSync(join(roto, "ficha.json"), "utf8"), "{ no es json");
  const vacio = carpeta();
  const m = mundo(vacio, 1);
  assert.ok(m.viva.cambiar({ ...cambio, portada: "", avatar: "", aforo: 0 }, "t").ok);
  assert.deepEqual(leer(vacio), { formato: "ficha@1", nombre: "Plaza nueva" });
});

test("without a world folder the change lasts until restart, and it says so", () => {
  const log: string[] = [];
  const viva = crearFichaViva({ aventura: null, ficha: null, maxPlayers: 1000, tieneImagen: () => false, dentro: () => 0, log: (l) => log.push(l) });
  assert.equal(viva.ajustes().guardado, false);
  assert.ok(viva.cambiar({ nombre: "Efímero", portada: "", avatar: "", aforo: 4 }, "t").ok);
  assert.equal(viva.aforo(), 4);
  assert.match(log.join("\n"), /hasta que el servidor se reinicie/);
});

// ---- the whole thing through a real server: real feature list, real sockets, /dueño for the right to rule ----
import { WebSocket } from "ws";
import { webSocketClient } from "../packages/net/src/index.ts";
import { CIERRE_LLENO, startServer } from "../packages/server/src/server.ts";
import partes from "../features/servidor.ts";
import { crearCliente as crearChat } from "../features/chat/client.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";

const ADMIN = "codigo-de-administracion-largo";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const espera = async (f: () => boolean) => { const t0 = performance.now(); while (!f() && performance.now() - t0 < 6000) await sleep(20); return f(); };
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

test("through a real server: a guest cannot, the owner can; B sees the new title and limit; the door follows the file and the next one is told", async () => {
  const aventura = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "ficha-srv-"));
  writeFileSync(join(aventura, "ficha.json"), JSON.stringify(ORIGINAL));
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, log: (l) => log.push(l), secret: "una-clave-de-prueba-larga", admin: ADMIN, aventura, features: partes, motor: { build: "dev", commit: "0".repeat(40), imagen: "" } });
  const url = `ws://127.0.0.1:${srv.port}/ws`;
  const pagina = async () => {
    const t = webSocketClient(url), f = crearCliente(), chat = crearChat();
    const s = new ClientSession(t, { identity: keeper(), features: [f.part, chat.part], view: { label() {}, bounce() {} } });
    await t.opened; assert.ok(await espera(() => s.who !== null && f.ajustes.actual() !== null), "identified and told the settings");
    return { t, s, aj: f.ajustes, chat: chat.chat };
  };
  const abiertos: { t: { close(): void } }[] = [];
  try {
    const a = await pagina(), b = await pagina(); abiertos.push(a, b);
    assert.equal(a.aj.actual()?.nombre, "Plaza vieja");
    assert.equal(a.aj.estado.puede, false, "a guest is not told it may");
    a.aj.guardar({ ...cambio, aforo: 2 }); await sleep(400);
    assert.equal(leer(aventura).nombre, "Plaza vieja", "refused: the file is as it was");
    assert.deepEqual(a.chat.decir(`/dueño ${ADMIN}`), { ok: true });
    assert.ok(await espera(() => a.aj.estado.puede), "the owner is told it may");
    // aforo 2 with both inside: a third is refused at the door, with the reason the page turns into its message
    const ok = a.aj.guardar({ ...cambio, portada: "", avatar: AVATARES_CASA[1], nombre: "Sala viva", aforo: 2 });
    assert.ok(ok.ok);
    assert.ok(await espera(() => b.aj.actual()?.nombre === "Sala viva"), "B sees the new title");
    assert.equal(b.aj.actual()?.aforo, 2);
    assert.equal(leer(aventura).nombre, "Sala viva"); assert.equal(leer(aventura).tema.acento, "#ff0000", "keys it does not own are kept");
    const st = await (await fetch(`http://127.0.0.1:${srv.port}/status`)).json();
    assert.equal(st.nombre, "Sala viva"); assert.equal(st.aforo, 2); assert.equal(st.avatar, AVATARES_CASA[1]);
    const tercero = new WebSocket(url);
    const c = await new Promise<{ code: number; reason: string }>((r) => tercero.on("close", (code, reason) => r({ code, reason: reason.toString() })));
    assert.equal(c.code, CIERRE_LLENO); assert.equal(c.reason, "lleno 2/2");
    // lowering the limit below who is inside puts nobody out
    a.aj.guardar({ ...cambio, portada: "", avatar: "", nombre: "Sala viva", aforo: 1 });
    assert.ok(await espera(() => b.aj.actual()?.aforo === 1));
    await sleep(200); assert.equal(srv.metrics().conectados, 2, "both still inside");
  } finally { for (const p of abiertos) p.t.close(); await srv.close(); }
});
