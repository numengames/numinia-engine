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
import { crearBienes } from "../features/bienes/server.ts";
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

function mundo(o: { storage?: FileStorage; secreto?: string | null } = {}) {
  const secreto = o.secreto === undefined ? SECRETO : o.secreto;
  const logs: string[] = [];
  const recibos = secreto ? crearRecibos(secreto, "mundo.test") ?? undefined : undefined;
  const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: [...crearMisiones({ aventura: aventura() }), crearBienes()], log: (l) => logs.push(l), identitySign: signer("guest-tokens-secret-xx"), sign: signer(secreto ?? undefined), recibos, storage: o.storage });
  const paginas: { t: ReturnType<Instance["join"]> }[] = [];
  let n = 0;
  const abrir = (k?: Keeper) => {
    const t = inst.join(n++), mc = crearMisionesCliente(), bc = crearBienesCliente(), oidos: string[] = [];
    const s = new ClientSession(t, { features: [...mc.parts, ...bc.parts], ...(k ? { identity: k } : {}), view: { label() {}, bounce() {}, tag() {}, place() {} } });
    s.features.tap((f, ev) => { if (f === "bienes") oidos.push(ev); });
    const p = { s, t, m: mc.misiones, b: bc.bienes, oidos };
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
  assert.deepEqual({ ...bien, id: "…", recibo: "…", instante: "…" }, { id: "…", objeto: "brujula-artifice", nombre: "Brújula del Artífice", descripcion: "Apunta siempre a la próxima aventura.", modelo: MODELO, licencia: "CC0-1.0", mundo: "mundo.test", mision: "cofre-final", instante: "…", recibo: "…" });
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
