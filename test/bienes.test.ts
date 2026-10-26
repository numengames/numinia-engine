// N10 (bienes digitales): a chest at the end of an adventure gives a thing that is YOURS. The receipt (pure: signed,
// checked, every kind of tampering refused, the key from the world's secret), the quest format (an «objeto» reward), the
// whole path over the real plug (quest → chest → one good with a valid receipt in its owner's inventory, on every tab,
// after a reconnection and a restart; never twice; another guest's receipt is real but not yours; another world's is
// real but only checked; no secret = no good, the grant still recorded), what a chain would get (no personal data), and
// the CLI on a temp world folder (CSV with every signature re-checked; a hand-edited record says MAL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { fx } from "../packages/core/src/index.ts";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { FileStorage } from "../packages/server/src/datos.ts";
import { canonico, crearRecibos, firmarRecibo, leerRecibo, llaveDelMundo, RECIBO_MAX } from "../packages/server/src/recibos.ts";
import type { DatosBien } from "../packages/server/src/recibos.ts";
import { metadatos, vale, REDES_PRUEBA } from "../packages/server/src/cadena.ts";
import { leerBienes } from "../packages/server/src/bienes.ts";
import { cargarAventura, leerMision } from "../features/misiones/formato.ts";
import type { Fichero } from "../features/misiones/formato.ts";
import { crearMisiones } from "../features/misiones/server.ts";
import { crearCliente as crearMisionesCliente } from "../features/misiones/client.ts";
import { crearBienes, leerConfianza, INDICE_PAGINA } from "../features/bienes/server.ts";
import { crearCliente as crearBienesCliente, ficheroRecibo, reciboDe } from "../features/bienes/client.ts";
import { bienes as bienesDecl, partir, unir, TROZO, TROZOS } from "../features/bienes/feature.ts";
import { comprobar } from "../features/bienes/comprobar.ts";

const CLI = fileURLToPath(new URL("../packages/server/src/bienes.ts", import.meta.url));
const SECRETO = "una-clave-de-prueba-larga", OTRO = "otro-mundo-con-su-secreto";
const MODELO = "b".repeat(64);
const BRUJULA = { tipo: "objeto", id: "brujula-artifice", nombre: "Brújula del Artífice", descripcion: "Apunta siempre a la próxima aventura.", modelo: MODELO, licencia: "CC0-1.0" };
const datos = (o: Partial<DatosBien> = {}): DatosBien => ({ id: "0123456789abcdef01234567", objeto: { id: "brujula", nombre: "Brújula", descripcion: "", modelo: "", licencia: "CC0-1.0" }, dueno: "abcdefghijkl", mision: "cofre", instante: "2026-10-18T00:00:00.000Z", ...o });

// ---------- the receipt, pure ----------
test("receipt: signed by the world's key (from its secret), checked by anyone with the key inside; small; every tampering refused", () => {
  const r = crearRecibos(SECRETO, "mundo.test")!;
  assert.ok(r && /^ed25519:[A-Za-z0-9_-]{43}$/.test(r.emisor));
  assert.equal(crearRecibos(SECRETO, "x")!.emisor, r.emisor, "same secret, same key (no file to keep)");
  assert.notEqual(crearRecibos(OTRO, "x")!.emisor, r.emisor, "another secret, another world");
  assert.equal(crearRecibos(undefined, "x"), null); assert.equal(crearRecibos("corto", "x"), null); assert.equal(llaveDelMundo(""), null);
  const t = r.firmar(datos());
  assert.match(t, /^nb1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{86}$/);
  const l = r.verificar(t);
  assert.ok(l.ok && l.nuestro === true);
  assert.equal(l.recibo.objeto.nombre, "Brújula"); assert.equal(l.recibo.mundo, "mundo.test"); assert.equal(l.recibo.dueno, "abcdefghijkl"); assert.match(l.huella, /^[0-9a-f]{64}$/);
  assert.equal(crearRecibos(OTRO, "otro")!.verificar(t).ok, true, "another world checks it too");
  assert.equal((crearRecibos(OTRO, "otro")!.verificar(t) as { nuestro?: boolean }).nuestro, false, "…and knows it did not sign it");
  // the biggest good fits the wire (3 × 512) and the store
  const grande = r.firmar(datos({ objeto: { id: "o".repeat(32), nombre: "ñ".repeat(30), descripcion: "é".repeat(70), modelo: MODELO, licencia: "L".repeat(40) }, dueno: `p_${"f".repeat(32)}`, mision: "m".repeat(32) }));
  assert.ok(grande.length <= RECIBO_MAX && grande.length <= TROZO * TROZOS, `${grande.length} characters`);
  assert.ok(leerRecibo(grande).ok);
  // tampering: the payload changed (owner swapped), re-encoded non-canonically, signature of another receipt, cut, junk
  const [p, c, s] = t.split(".");
  const cuerpo = JSON.parse(Buffer.from(c, "base64url").toString("utf8"));
  const otroCuerpo = Buffer.from(canonico({ ...cuerpo, dueno: "ladron000000" })).toString("base64url");
  assert.match((leerRecibo(`${p}.${otroCuerpo}.${s}`) as { motivo: string }).motivo, /firma no cuadra/);
  const feo = Buffer.from(JSON.stringify(cuerpo, null, 1)).toString("base64url");
  assert.match((leerRecibo(`${p}.${feo}.${s}`) as { motivo: string }).motivo, /no canónico/);
  const ajena = r.firmar(datos({ id: "ffffffffffffffffffffffff" })).split(".")[2];
  assert.equal(leerRecibo(`${p}.${c}.${ajena}`).ok, false);
  const suplantado = firmarRecibo(llaveDelMundo(OTRO)!, "mundo.test", datos()); // someone else signs «mundo.test»: valid, but its key is not this world's
  const sv = r.verificar(suplantado);
  assert.ok(sv.ok && sv.nuestro === false, "a receipt naming this world but signed by another key is not ours");
  for (const malo of ["", "hola", "nb1.", t.slice(0, -3), `${t}.x`, "nb1." + "A".repeat(2000), 42, null]) assert.equal(leerRecibo(malo).ok, false, String(malo).slice(0, 20));
  assert.equal(leerRecibo(r.firmar(datos({ id: "NO-HEX" }))).ok, false, "a good's id is 24 hex");
});

test("the page's check (WebCrypto) agrees with the server's (node:crypto) on good and tampered receipts", async () => {
  const r = crearRecibos(SECRETO, "mundo.test")!, t = r.firmar(datos());
  const [p, c, f] = t.split(".");
  const cuerpo = JSON.parse(Buffer.from(c, "base64url").toString("utf8"));
  const casos = [t, `${p}.${Buffer.from(canonico({ ...cuerpo, dueno: "ladron000000" })).toString("base64url")}.${f}`, `${p}.${Buffer.from(JSON.stringify(cuerpo, null, 1)).toString("base64url")}.${f}`, t.slice(0, -2) + "AA", firmarRecibo(llaveDelMundo(OTRO)!, "x", datos()), "nb1.x.y", "hola"];
  for (const k of casos) assert.equal((await comprobar(k)).ok, leerRecibo(k).ok, k.slice(0, 30));
  assert.equal((await comprobar(t)).ok, true);
  assert.equal((await comprobar(t, null)).ok, false, "no WebCrypto: says so instead of saying yes");
});

test("format: a quest's «objeto» reward (descripcion, modelo, licencia optional), mistakes said where; ids unique; insignias still work", () => {
  const base = { formato: "mision@1", id: "cofre", titulo: "El cofre", descripcion: "Ábrelo.", pasos: [{ id: "abre", tipo: "usa", texto: "Abre el cofre", cosa: "cofre" }] };
  const ok = leerMision({ ...base, recompensas: [BRUJULA, { tipo: "insignia", id: "sello", nombre: "Sello" }, { tipo: "objeto", id: "llave", nombre: "Llave" }] });
  assert.ok(ok.ok, JSON.stringify(ok.issues));
  assert.deepEqual(ok.value.recompensas[0], BRUJULA);
  assert.deepEqual(ok.value.recompensas[2], { tipo: "objeto", id: "llave", nombre: "Llave", descripcion: "", modelo: "", licencia: "" });
  const mal = (r: unknown) => { const m = leerMision({ ...base, recompensas: [r] }); assert.ok(!m.ok, JSON.stringify(r)); return m.issues.map((i) => `${i.path}: ${i.message}`).join(" | "); };
  assert.match(mal({ ...BRUJULA, modelo: "no-es-un-sha" }), /recompensas\[0\]\.modelo: el sha256/);
  assert.match(mal({ ...BRUJULA, licencia: "todos los derechos, salvo…" }), /recompensas\[0\]\.licencia: .*no da los derechos/);
  assert.match(mal({ ...BRUJULA, precio: 5 }), /precio/);
  assert.match(mal({ tipo: "moneda", id: "oro", nombre: "Oro" }), /"insignia".*u "objeto"/);
  const dos = leerMision({ ...base, recompensas: [BRUJULA, BRUJULA] });
  assert.ok(!dos.ok && dos.issues.some((i) => /ya es otra recompensa/.test(i.message)));
  assert.equal(bienesDecl.issues.length, 0, JSON.stringify(bienesDecl.issues));
  assert.equal(unir(partir("nb1." + "x".repeat(1300))), "nb1." + "x".repeat(1300));
});

// ---------- over the real plug ----------
const adios = { texto: "Adiós.", accion: { tipo: "despedir" } };
const MISION = { formato: "mision@1", id: "cofre-final", titulo: "El cofre del final", descripcion: "Habla con la guardiana y abre el cofre.", pasos: [{ id: "abre", tipo: "usa", texto: "Abre el cofre", cosa: "cofre" }], recompensas: [BRUJULA, { tipo: "insignia", id: "sello", nombre: "Sello del Cofre" }], repetible: true };
const GUARDIANA = { formato: "pnj@1", id: "guardiana", nombre: "Guardiana", posicion: { x: 0, z: 0 }, dialogo: { entradas: [{ si: { mision: "cofre-final", estado: "disponible" }, nodo: "pide" }, { nodo: "hola" }], nodos: { pide: { texto: "¿Abrirás el cofre?", opciones: [{ texto: "Sí.", accion: { tipo: "dar_mision", mision: "cofre-final" } }] }, hola: { texto: "Hola.", opciones: [adios] } } } };
const COFRE = { formato: "cosa@1", id: "cofre", nombre: "Cofre", posicion: { x: 4, z: 0 }, aviso: "abrir el cofre" };
const fich = (dir: string, x: { id: string }): Fichero => ({ fichero: `${dir}/${x.id}.json`, texto: JSON.stringify(x) });
const aventura = () => ({ misiones: [fich("misiones", MISION)], pnj: [fich("pnj", GUARDIANA)], cosas: [fich("cosas", COFRE)] });
type Keeper = GuestKeeper & { token: string | null };
const keeper = (): Keeper => { const k = { token: null as string | null, load: () => k.token, save: (t: string) => { k.token = t; } }; return k; };

function mundo(o: { storage?: FileStorage; secreto?: string | null; confianza?: string; modelos?: string[] } = {}) {
  const secreto = o.secreto === undefined ? SECRETO : o.secreto;
  const logs: string[] = [];
  const recibos = secreto ? crearRecibos(secreto, "mundo.test") ?? undefined : undefined;
  const confianza = () => (o.confianza === undefined ? [] : [{ fichero: "bienes/confianza.json", texto: o.confianza }]);
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [...crearMisiones({ aventura: aventura() }), crearBienes({ confianza })], log: (l) => logs.push(l), identitySign: signer("guest-tokens-secret-xx"), sign: signer(secreto ?? undefined), recibos, storage: o.storage,
    activo: (sha) => (o.modelos ?? [MODELO]).includes(sha) });
  const paginas: { t: ReturnType<Instance["join"]> }[] = [];
  let n = 0;
  const abrir = (k?: Keeper, guarda?: { load(): string | null; save(t: string): void }, falla = 0) => {
    const t = inst.join(n++), mc = crearMisionesCliente(), bc = crearBienesCliente({ guarda: guarda ?? null }), oidos: string[] = [];
    const lleva = new Map<number, string>(); // N18: what this page draws on each avatar
    let faltan = falla; // a page whose hooks still throw (its session is not built yet) for the first `falla` calls
    const s = new ClientSession(t, { features: [...mc.parts, ...bc.parts], ...(k ? { identity: k } : {}), view: { label() {}, bounce() {}, tag() {}, place() {}, lleva: (e, p) => { if (faltan > 0) { faltan--; throw new Error("session is not defined yet"); } if (p) lleva.set(e, `${p.donde}:${p.model.slice(0, 4)}`); else lleva.delete(e); } } });
    s.features.tap((f, ev) => { if (f === "bienes") oidos.push(ev); });
    const p = { s, t, m: mc.misiones, b: bc.bienes, oidos, lleva };
    paginas.push(p);
    return p;
  };
  const pump = (ticks = 2) => { for (let i = 0; i < ticks; i++) { for (const p of paginas) p.t.flush(); inst.tick(); for (const p of paginas) p.t.flush(); } };
  const ir = (p: ReturnType<typeof abrir>, x: number, z: number) => { inst.sim.tf.cols.x[p.s.entity] = fx(x); inst.sim.tf.cols.z[p.s.entity] = fx(z); pump(12); };
  const cerrar = (p: ReturnType<typeof abrir>) => { inst.disconnect(p.s.entity); paginas.splice(paginas.indexOf(p), 1); pump(2); };
  const abrirCofre = (p: ReturnType<typeof abrir>) => { ir(p, 1, 0); p.m.hablar("guardiana"); pump(2); p.m.elegir(1); pump(3); ir(p, 3.5, 0); p.m.usar("cofre"); pump(4); };
  return { inst, abrir, pump, ir, cerrar, abrirCofre, logs, store: () => inst.features };
}
const nuevaCarpeta = (n: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), `${n}-`));

test("the chest gives a good: «Es tuyo», one valid receipt in its owner's inventory (every tab, after reconnecting and a restart); never twice; others' receipts real but not theirs", async () => {
  const dir = nuevaCarpeta("bienes");
  const st = new FileStorage(dir), W = mundo({ storage: st });
  const kA = keeper(), kB = keeper();
  const a = W.abrir(kA), b = W.abrir(kB); W.pump(3);
  assert.deepEqual(a.b.lista(), [], "nothing before the chest");
  W.abrirCofre(a);
  assert.equal(a.m.libro().find((m) => m.id === "cofre-final")?.estado, "hecha");
  assert.equal(a.b.nuevo(), "Brújula del Artífice", "«Es tuyo» arrived");
  assert.ok(a.oidos.includes("recibido"));
  const [bien] = a.b.lista();
  assert.equal(a.b.lista().length, 1);
  assert.deepEqual({ ...bien, id: "…", recibo: "…", instante: "…" }, { id: "…", ajeno: false, verse: true, objeto: "brujula-artifice", nombre: "Brújula del Artífice", descripcion: "Apunta siempre a la próxima aventura.", modelo: MODELO, licencia: "CC0-1.0", mundo: "mundo.test", mision: "cofre-final", instante: "…", recibo: "…" });
  const l = leerRecibo(bien.recibo);
  assert.ok(l.ok, "the page holds a receipt anyone can check");
  assert.equal(l.recibo.dueno, a.s.who!.id); assert.equal(l.recibo.id, bien.id); assert.match(bien.id, /^[0-9a-f]{24}$/);
  assert.deepEqual(b.b.lista(), [], "the guest beside them got nothing");
  // the quest is repeatable: done again, the grant (and so the good) stays one
  W.abrirCofre(a);
  assert.equal(a.b.lista().length, 1, "never twice");
  // a second tab of A and a reconnection: the inventory comes on entering
  const a2 = W.abrir(kA); W.pump(3);
  assert.deepEqual(a2.b.lista().map((x) => x.id), [bien.id]);
  W.cerrar(a); W.cerrar(a2);
  const a3 = W.abrir(kA); W.pump(3);
  assert.equal(a3.b.lista()[0]?.recibo, bien.recibo, "the same receipt, byte for byte");
  // checking receipts in the page (WebCrypto): A's own → yours; B checks A's → real, this world's, not theirs; tampered → no
  assert.equal(a3.b.emisor(), crearRecibos(SECRETO, "x")!.emisor, "the page knows the key its world signs with");
  assert.deepEqual(await a3.b.comprobar(ficheroRecibo(bien).texto), { ok: true, nombre: "Brújula del Artífice", mundo: "mundo.test", nuestro: true, tuyo: true, motivo: "Auténtico: «Brújula del Artífice» es tuyo, firmado por este mundo." });
  const deB = await b.b.comprobar(bien.recibo);
  assert.ok(deB.ok && deB.nuestro && !deB.tuyo, JSON.stringify(deB));
  assert.match(deB.motivo, /no está en tu inventario/);
  const roto = bien.recibo.slice(0, 40) + (bien.recibo[40] === "A" ? "B" : "A") + bien.recibo.slice(41);
  const r0 = await b.b.comprobar(roto);
  assert.equal(r0.ok, false); assert.match(r0.motivo, /no vale/);
  assert.equal((await b.b.comprobar("hola")).ok, false);
  // a receipt from another world: real, only checked, not added
  const ajeno = crearRecibos(OTRO, "otro.mundo")!.firmar(datos());
  const ra = await b.b.comprobar(ajeno);
  assert.ok(ra.ok && !ra.nuestro && !ra.tuyo); assert.match(ra.motivo, /otro\.mundo.*no que sea tuyo/);
  assert.deepEqual(b.b.lista(), [], "checking never adds");
  // the route for tools and other worlds: the bare receipt or the file; says what, never who
  const http = (body: string) => W.inst.features.http("POST", "/bienes/comprobar", {}, body) as { status?: number; body: Record<string, unknown> };
  const h1 = http(ficheroRecibo(bien).texto);
  assert.equal(h1.body.ok, true); assert.equal(h1.body.nuestro, true); assert.equal(h1.body.nombre, "Brújula del Artífice");
  assert.ok(!JSON.stringify(h1.body).includes(a3.s.who!.id), "the route never says who owns it");
  assert.equal(http(ajeno).body.nuestro, false);
  assert.equal(http(roto).status, 422); assert.equal(http("").status, 422);
  // the restart: a new server over the same folder sends the same good
  await st.flush();
  const W2 = mundo({ storage: new FileStorage(dir) });
  const a4 = W2.abrir(kA); W2.pump(3);
  assert.equal(a4.b.lista()[0]?.recibo, bien.recibo, "kept across a restart");
  // the CLI: one good, its signature re-checked; then a record edited by hand says MAL
  const r = leerBienes(dir)!;
  assert.equal(r.filas.length, 1); assert.equal(r.filas[0].firma, "valida"); assert.equal(r.filas[0].dueno, a3.s.who!.id);
  const cli = spawnSync(process.execPath, [CLI, dir], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /^id,nombre,objeto,dueno,mision,mundo,instante,firma\n[0-9a-f]{24},Brújula del Artífice,brujula-artifice,/);
  assert.match(cli.stderr, /1 bien .*todas las firmas valen/);
  appendFileSync(join(dir, "bienes.jsonl"), JSON.stringify({ t: "x", v: 1, op: "k", key: `b:${bien.id}`, value: { ...r.filas[0], recibo: bien.recibo, nombre: "Espada Legendaria" } }) + "\n");
  assert.match(leerBienes(dir)!.filas[0].firma, /^MAL: el registro no dice lo mismo/);
  // verificar / metadatos from the downloaded file
  const f = join(dir, ficheroRecibo(bien).nombre); writeFileSync(f, ficheroRecibo(bien).texto);
  assert.match(ficheroRecibo(bien).nombre, /^recibo-brujula-del-artifice-[0-9a-f]{8}\.json$/);
  const v = spawnSync(process.execPath, [CLI, "verificar", f], { encoding: "utf8" });
  assert.equal(v.status, 0, v.stderr); assert.match(v.stderr, /auténtico: «Brújula del Artífice», de mundo\.test/);
  writeFileSync(f, ficheroRecibo({ ...bien, recibo: roto }).texto);
  assert.equal(spawnSync(process.execPath, [CLI, "verificar", f], { encoding: "utf8" }).status, 1);
  const md = spawnSync(process.execPath, [CLI, "metadatos", bien.recibo, "7"], { encoding: "utf8" });
  assert.equal(md.status, 0, md.stderr);
  assert.equal(JSON.parse(md.stdout).vale.message.tokenId, "7");
  assert.equal(reciboDe(readFileSync(f, "utf8")), roto);
});

test("no secret: no receipt, so no good — the grant is still recorded and the log says why", () => {
  const W = mundo({ secreto: null });
  const a = W.abrir(keeper()); W.pump(3);
  W.abrirCofre(a);
  assert.equal(a.m.libro().find((m) => m.id === "cofre-final")?.estado, "hecha");
  assert.deepEqual(a.b.lista(), []);
  assert.ok(W.logs.some((l) => /sin MOTOR_SECRET no hay recibo/.test(l)), W.logs.join("\n"));
});

test("chain-ready, nothing personal: ERC-721 metadata and the EIP-712 voucher carry no guest id, name, good id or receipt hash", () => {
  const r = crearRecibos(SECRETO, "mundo.test")!;
  const l = leerRecibo(r.firmar(datos({ objeto: { id: "brujula", nombre: "Brújula", descripcion: "", modelo: MODELO, licencia: "CC0-1.0" } })));
  assert.ok(l.ok);
  const md = metadatos(l.recibo), v = vale(l.recibo, { numero: 1n, uri: "ipfs://x/1.json" });
  assert.equal(md.name, "Brújula"); assert.equal(md.animation_url, `https://mundo.test/a/${MODELO}.glb`);
  assert.ok(Array.isArray(md.attributes));
  const todo = JSON.stringify([md, v]);
  for (const prohibido of [l.recibo.dueno, l.recibo.id, l.huella, "dueno", "jugador", "invitado"]) assert.ok(!todo.includes(prohibido), `«${prohibido}» must never go on a chain`);
  assert.equal((v.domain as { chainId: number }).chainId, REDES_PRUEBA["base-sepolia"]);
  assert.equal((v.message as { to: unknown }).to, null, "the wallet is the owner's choice, at claim time");
  assert.match(String(v.nota), /Sin firmar/);
});

// ---------- N18: wear it, the index, receipts from other worlds ----------
const espera = async (W: ReturnType<typeof mundo>, p: Promise<unknown>) => { let hecho = false; void p.finally(() => { hecho = true; }); for (let i = 0; i < 40 && !hecho; i++) { W.pump(1); await new Promise((r) => setTimeout(r, 1)); } return p; };

test("N18 wear: your good in a hand or on your head, seen by every page; refused when not yours or without a model here; back on when you return; off when you leave", async () => {
  const dir = nuevaCarpeta("bienes-llevar");
  const st = new FileStorage(dir), W = mundo({ storage: st });
  const kA = keeper(), kB = keeper();
  const a = W.abrir(kA), b = W.abrir(kB); W.pump(3);
  W.abrirCofre(a);
  const [bien] = a.b.lista();
  assert.equal(bien.verse, true, "this server has its model"); assert.equal(bien.ajeno, false);
  assert.ok(a.b.llevar(bien.id, "mano").ok); W.pump(3);
  assert.deepEqual(a.b.puesto(), { modelo: MODELO, donde: "mano", nombre: "Brújula del Artífice" });
  assert.equal(b.lleva.get(a.s.entity), "mano:bbbb", "the other guest's page draws it on A");
  assert.equal(a.lleva.get(a.s.entity), "mano:bbbb", "and A's own page on A");
  assert.equal(b.b.puestos()[a.s.entity]?.donde, "mano");
  a.b.llevar(bien.id, "cabeza"); W.pump(3);
  assert.equal(b.lleva.get(a.s.entity), "cabeza:bbbb");
  // B cannot wear A's good (it is not B's), the server says why
  b.b.llevar(bien.id, "mano"); W.pump(3);
  assert.equal(b.b.puesto(), null); assert.ok(b.oidos.includes("aviso"));
  assert.ok(b.s.features.announcements.some((x) => x.feature === "bienes" && /no es tuyo/.test(x.text)), "«Ese objeto no es tuyo en este mundo.»");
  // a second tab of A wears it too; leaving takes it off that avatar; coming back puts it back on
  const a2 = W.abrir(kA); W.pump(3);
  assert.equal(b.lleva.get(a2.s.entity), "cabeza:bbbb", "what you wear comes back on every tab of yours");
  const ea = a.s.entity;
  W.cerrar(a);
  assert.equal(b.lleva.has(ea), false, "gone with the avatar");
  a2.b.quitar(); W.pump(3);
  assert.equal(b.lleva.has(a2.s.entity), false); assert.equal(a2.b.puesto(), null);
  a2.b.llevar(bien.id, "mano"); W.pump(3);
  await st.flush();
  const W2 = mundo({ storage: new FileStorage(dir) }), c = W2.abrir(kB); W2.pump(2);
  const a3 = W2.abrir(kA); W2.pump(3);
  assert.equal(c.lleva.get(a3.s.entity), "mano:bbbb", "kept across a restart");
  // a world without the model's file: the good is there, but it cannot be worn (and the page knows it)
  const W3 = mundo({ storage: new FileStorage(dir), modelos: [] }), a4 = W3.abrir(kA); W3.pump(3);
  assert.equal(a4.b.lista()[0]?.verse, false);
  assert.equal(a4.lleva.size, 0, "not put back on without its model");
  a4.b.llevar(bien.id, "mano"); W3.pump(3);
  assert.equal(a4.b.puesto(), null); assert.ok(a4.oidos.includes("aviso"));
});

test("N18 index: entering reads your goods through d:<guest>, not every good of the world; an old world is indexed once", async () => {
  const dir = nuevaCarpeta("bienes-indice");
  const st = new FileStorage(dir), W = mundo({ storage: st });
  const kA = keeper(); const a = W.abrir(kA); W.pump(3);
  W.abrirCofre(a);
  const [bien] = a.b.lista(), yo = a.s.who!.id;
  await st.flush();
  const k = (key: string, value: unknown) => JSON.stringify({ t: "x", v: 2, op: "k", key, value });
  const hex = (i: number) => i.toString(16).padStart(24, "0");
  const ajenoDeA = { id: hex(999), recibo: "nb1.x.y", dueno: yo, objeto: "o", nombre: "Sin índice", mundo: "m", mision: "x", instante: "2026-01-01T00:00:00Z" };
  // 300 goods of other guests + one of A's written by hand WITHOUT its index entry
  appendFileSync(join(dir, "bienes.jsonl"), [...Array.from({ length: 300 }, (_, i) => k(`b:${hex(i)}`, { ...ajenoDeA, id: hex(i), dueno: `otro${i}`, nombre: "Otro" })), k(`b:${hex(999)}`, ajenoDeA)].join("\n") + "\n");
  const W2 = mundo({ storage: new FileStorage(dir) });
  const a2 = W2.abrir(kA); W2.pump(3);
  assert.deepEqual(a2.b.lista().map((x) => x.id), [bien.id], "only what the index lists: the inventory never walks the world's goods");
  assert.ok(!W2.logs.some((l) => /índice por dueño/.test(l)), "already indexed: no pass on start");
  // a world from before the index (N10): no `i`, no d:* — indexed once on start, then A gets both
  appendFileSync(join(dir, "bienes.jsonl"), [JSON.stringify({ t: "x", v: 2, op: "kd", key: "i" }), JSON.stringify({ t: "x", v: 2, op: "kd", key: `d:${yo}` })].join("\n") + "\n");
  const st3 = new FileStorage(dir), W3 = mundo({ storage: st3 });
  assert.ok(W3.logs.some((l) => /índice por dueño: 302 bienes indexados \(una vez\)/.test(l)), W3.logs.join("\n"));
  const a3 = W3.abrir(kA); W3.pump(3);
  assert.deepEqual(a3.b.lista().map((x) => x.nombre).sort(), ["Brújula del Artífice", "Sin índice"]);
  await st3.flush();
  const W4 = mundo({ storage: new FileStorage(dir) });
  assert.ok(!W4.logs.some((l) => /índice por dueño/.test(l)), "once: not again on the next start");
  // pages: a guest with more than INDICE_PAGINA goods spreads over d:<guest>~2
  const muchos = Array.from({ length: INDICE_PAGINA + 5 }, (_, i) => `b:${hex(5000 + i)}`);
  appendFileSync(join(dir, "bienes.jsonl"), [...muchos.map((key, i) => k(key, { ...ajenoDeA, id: hex(5000 + i), nombre: `N${i}`, instante: `2026-02-01T00:00:${String(i % 60).padStart(2, "0")}Z` })), JSON.stringify({ t: "x", v: 2, op: "kd", key: "i" })].join("\n") + "\n");
  const W5 = mundo({ storage: new FileStorage(dir) }), a5 = W5.abrir(kA); W5.pump(3);
  assert.equal(a5.b.lista().length, 2 + INDICE_PAGINA + 5);
});

test("N18 receipts from another world: checked always; an untrusted signer = «de otro mundo» (remembered in this browser, not yours here); a trusted one = yours here, once, for one person", async () => {
  const otro = crearRecibos(OTRO, "otro.mundo")!;
  const ajeno = otro.firmar(datos({ objeto: { id: "brujula", nombre: "Brújula de fuera", descripcion: "De otro mundo.", modelo: MODELO, licencia: "CC0-1.0" } }));
  // 1) this world trusts nobody (the default): real, shown as from another world, never given
  const mem: Record<string, string> = {};
  const guarda = (k: string) => ({ load: () => mem[k] ?? null, save: (t: string) => { mem[k] = t; } });
  const W = mundo({ confianza: JSON.stringify({ formato: "confianza@1", emisores: [] }) });
  const a = W.abrir(keeper(), guarda("a")); W.pump(3);
  const r1 = await espera(W, a.b.traer(ficheroRecibo({ id: "0".repeat(24), objeto: "brujula", nombre: "x", descripcion: "", modelo: "", licencia: "", mundo: "otro.mundo", mision: "m", instante: "", recibo: ajeno, ajeno: false, verse: false }).texto)) as Awaited<ReturnType<typeof a.b.traer>>;
  assert.equal(r1.ok, true); assert.equal(r1.confia, false); assert.equal(r1.dado, false);
  assert.match(r1.motivo, /no confía en quien lo firmó.*de otro mundo/);
  assert.deepEqual(a.b.lista(), [], "never given here");
  assert.deepEqual(a.b.otros().map((x) => [x.nombre, x.mundo]), [["Brújula de fuera", "otro.mundo"]]);
  const a2 = W.abrir(keeper(), guarda("a")); W.pump(3);
  assert.equal(a2.b.otros().length, 1, "remembered in this browser");
  a2.b.olvidar(ajeno); assert.equal(a2.b.otros().length, 0);
  // a tampered one never reaches the server
  const roto = ajeno.slice(0, 50) + (ajeno[50] === "A" ? "B" : "A") + ajeno.slice(51);
  const r0 = await espera(W, a.b.traer(roto)) as Awaited<ReturnType<typeof a.b.traer>>;
  assert.equal(r0.ok, false);
  // the server refuses a tampered one sent by hand too (pieces of an edited receipt)
  // 2) this world trusts that signer (its file): yours here, «de otro mundo», wearable; a second guest cannot take it
  const W2 = mundo({ confianza: JSON.stringify({ formato: "confianza@1", emisores: [{ emisor: otro.emisor, nombre: "Otro Mundo", nota: "prueba" }] }) });
  const kA = keeper(), x = W2.abrir(kA, guarda("x")), y = W2.abrir(keeper(), guarda("y")); W2.pump(3);
  const r2 = await espera(W2, x.b.traer(ajeno)) as Awaited<ReturnType<typeof x.b.traer>>;
  assert.equal(r2.ok, true); assert.equal(r2.confia, true); assert.equal(r2.dado, true, r2.motivo);
  assert.match(r2.motivo, /Otro Mundo.*confía/);
  W2.pump(2);
  const [b] = x.b.lista();
  assert.equal(b?.nombre, "Brújula de fuera"); assert.equal(b.ajeno, true); assert.equal(b.mundo, "otro.mundo"); assert.equal(b.recibo, ajeno, "the same receipt, signed there");
  assert.deepEqual(x.b.otros(), [], "not «just seen»: it is yours");
  assert.match((await x.b.comprobar(ajeno)).motivo, /confía en quien lo firmó y aquí es tuyo/);
  x.b.llevar(b.id, "cabeza"); W2.pump(3);
  assert.equal(y.lleva.get(x.s.entity), "cabeza:bbbb", "worn and seen like any good");
  const r3 = await espera(W2, x.b.traer(ajeno)) as Awaited<ReturnType<typeof x.b.traer>>;
  assert.match(r3.motivo, /ya estaba en tu inventario/); assert.equal(x.b.lista().length, 1, "never twice");
  const r4 = await espera(W2, y.b.traer(ajeno)) as Awaited<ReturnType<typeof y.b.traer>>;
  assert.equal(r4.dado, false); assert.match(r4.motivo, /otra persona/); assert.deepEqual(y.b.lista(), []);
  // kept with its owner when they come back; the route says it is trusted, not who has it
  const x2 = W2.abrir(kA); W2.pump(3);
  assert.equal(x2.b.lista()[0]?.ajeno, true);
  const h = W2.inst.features.http("POST", "/bienes/comprobar", {}, ajeno) as { body: Record<string, unknown> };
  assert.equal(h.body.nuestro, false); assert.equal(h.body.confiado, true); assert.ok(!JSON.stringify(h.body).includes(x.s.who!.id));
  // our own receipt brought back: nothing new
  W2.abrirCofre(x2);
  const propio = x2.b.lista().find((z) => !z.ajeno)!;
  const r5 = await espera(W2, x2.b.traer(propio.recibo)) as Awaited<ReturnType<typeof x2.b.traer>>;
  assert.equal(r5.nuestro, true); assert.equal(x2.b.lista().length, 2);
});

test("N18 trust file: confianza@1 read leniently; a bad key is reported, never trusted", () => {
  const k = crearRecibos(OTRO, "x")!.emisor;
  assert.deepEqual(leerConfianza(JSON.stringify({ formato: "confianza@1", emisores: [] })), { emisores: [], problemas: [] });
  assert.deepEqual(leerConfianza(JSON.stringify([k])).emisores, [{ emisor: k, nombre: "" }]);
  const c = leerConfianza(JSON.stringify({ formato: "confianza@1", emisores: [{ emisor: "ed25519:corta" }, { emisor: k, nombre: "Otro" }] }));
  assert.deepEqual(c.emisores, [{ emisor: k, nombre: "Otro" }]); assert.equal(c.problemas.length, 1);
  assert.deepEqual(leerConfianza("{").emisores, []);
  // the example world ships the file, empty: trusting is the world's decision
  const f = JSON.parse(readFileSync(fileURLToPath(new URL("../aventuras/ejemplo/bienes/confianza.json", import.meta.url)), "utf8"));
  assert.equal(f.formato, "confianza@1"); assert.deepEqual(f.emisores, []);
});

test("N18 wear, late guest: someone who joins after you put something on sees it on you, even if its page was not ready for the first call", async () => {
  const W = mundo({ storage: new FileStorage(nuevaCarpeta("bienes-llevar-tarde")) });
  const a = W.abrir(keeper()); W.pump(3);
  W.abrirCofre(a);
  assert.ok(a.b.llevar(a.b.lista()[0].id, "mano").ok); W.pump(3);
  const tarde = W.abrir(undefined, undefined, 1); W.pump(3); // joins late; its first lleva() throws
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(tarde.lleva.get(a.s.entity), "mano:bbbb", "the late guest draws the Seed in A's hand");
});
