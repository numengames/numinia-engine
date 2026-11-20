// habitante@1 `apariencia.objeto`: an AI takes the place of a planted «Moñoni N» — the thing (and its smile) is hidden while the AI is connected, shown again when it leaves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { leerClave } from "../packages/server/src/pase.ts";
import { validarHabitante } from "../packages/agent/src/formato.ts";
import avatarServer from "../features/avatar/server.ts";
import iaServer from "../features/ia/server.ts";
import chatServer from "../features/chat/server.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { bolitas } from "../features/espaciobase/bolitas.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const RAW = b64(Buffer.from(par.publicKey.export({ format: "jwk" }).x as string, "base64url"));
const KID = createHash("sha256").update(Buffer.from(RAW, "base64url")).digest("hex").slice(0, 8);
const CLAVE = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const MUNDO = "agora-plaza", T0 = Date.parse("2026-10-16T10:00:00Z");
const SUB_A = `a_${"ab".repeat(16)}`, SUB_B = `a_${"cd".repeat(16)}`;
const GLB = "cc858fbfd241d007c35ff546798da34b09d8a794cffa36480e6ccfa93c9f81d1";
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };

function paseIA(sub: string): string {
  const s = Math.floor(T0 / 1000);
  const payload = { v: 1, iss: "numinia.com", aud: MUNDO, sub, org: "org-1", perm: ["enter-worlds"], height: 0, roles: [], name: "Ada", kind: "agent", state: "activa", iat: s, exp: s + 600 };
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), par.privateKey))}`;
}

function mundo(objeto: Record<string, string | undefined>) {
  const firma = signer("una-clave-de-prueba-larga");
  const roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: firma, pase: { clave: CLAVE, mundo: MUNDO, org: "org-1" }, cerrar: (e) => inst.disconnect(e), ahora: () => T0, log: () => {},
    habitante: (id) => (id in objeto ? { escalon: 0, apariencia: { modelo: GLB }, ...(objeto[id] ? { objeto: objeto[id] } : {}) } : undefined) });
  const inst: Instance = new Instance({ seed: 1, capacity: 32, k: 50, snapshotEvery: 2, features: [chatServer, crearObjetos(undefined, bolitas(7, 2)), avatarServer, iaServer, roles.part], identitySign: firma, puede: (w, a) => roles.puede(w, a), credencial: roles.credencial, renovarPase: roles.renovar });
  const sesiones: { t: ReturnType<Instance["join"]>; s: ClientSession }[] = [];
  const pump = (n = 3) => { for (let k = 0; k < n; k++) { for (const x of sesiones) x.t.flush(); inst.tick(); for (const x of sesiones) { x.t.flush(); x.s.tick(0, 0); } } };
  const unir = (pase?: string) => { const t = inst.join(sesiones.length), s = new ClientSession(t, { features: [], identity: keeper(), ...(pase ? { pase } : {}) }); sesiones.push({ t, s }); pump(); return { t, s, e: s.entity }; };
  const mirador = unir();
  /** name → hidden? for every planted thing the page sees */
  const ocultos = () => { const o = mirador.s.features.stateOf("objetos"); return Object.fromEntries(o.keys().map((k) => [String(o.get(k)?.nombre), o.get(k)?.oculto === true])); };
  return { inst, unir, pump, ocultos, salir: (a: { e: number }) => { inst.disconnect(a.e); pump(); } };
}

test("without `objeto` nothing is hidden (today's behaviour)", () => {
  const W = mundo({ [SUB_A]: undefined });
  assert.deepEqual(W.ocultos(), { "Moñoni 1": false, "Moñoni 1 boca": false, "Moñoni 2": false, "Moñoni 2 boca": false, "Moñoni mayor": false, "Moñoni mayor boca": false });
  W.unir(paseIA(SUB_A));
  assert.ok(Object.values(W.ocultos()).every((v) => v === false));
});

test("with `objeto` the planted thing and its smile are hidden while the AI is connected, and show again when it leaves", () => {
  const W = mundo({ [SUB_A]: "Moñoni 1" });
  const A = W.unir(paseIA(SUB_A));
  const h = W.ocultos();
  assert.equal(h["Moñoni 1"], true);
  assert.equal(h["Moñoni 1 boca"], true);
  assert.equal(h["Moñoni 2"], false, "the others stay");
  assert.equal(h["Moñoni mayor"], false);
  W.salir(A);
  assert.ok(Object.values(W.ocultos()).every((v) => v === false), "back when the AI leaves");
});

test("an `objeto` that matches nothing hides nothing", () => {
  const W = mundo({ [SUB_A]: "Moñoni 9" });
  W.unir(paseIA(SUB_A));
  assert.ok(Object.values(W.ocultos()).every((v) => v === false));
});

test("two AIs on two moñonis: each leaving shows only its own", () => {
  const W = mundo({ [SUB_A]: "Moñoni 1", [SUB_B]: "Moñoni 2" });
  const A = W.unir(paseIA(SUB_A)), B = W.unir(paseIA(SUB_B));
  assert.equal(W.ocultos()["Moñoni 1"], true); assert.equal(W.ocultos()["Moñoni 2"], true);
  W.salir(A);
  assert.equal(W.ocultos()["Moñoni 1"], false); assert.equal(W.ocultos()["Moñoni 2"], true);
  W.salir(B);
  assert.equal(W.ocultos()["Moñoni 2"], false);
});

test("habitante@1 validates apariencia.objeto: a name, nothing else", () => {
  const base = { formato: "habitante@1", id: "lia", nombre: "Lía", descripcion: "Una IA", responsable: "Pablo", escalon: 0, ruta: [{ x: 0, z: 0 }], pausa: 5, saludo: { radio: 3, cada: 60, frases: ["Hola"] }, respuestas: [{ si: ["hola"], dice: "Hola" }], siNoEntiende: "No entiendo", notas: "" };
  const ok = (objeto: unknown) => validarHabitante({ ...base, apariencia: { modelo: GLB, escala: 1, objeto } }, "lia.json");
  const sin = validarHabitante({ ...base, apariencia: { modelo: GLB, escala: 1 } }, "lia.json");
  assert.equal(sin.ok, true, JSON.stringify(sin));
  assert.equal(ok("Moñoni 1").ok, true);
  for (const mal of ["", "  ", " Moñoni 1", 3, "x".repeat(61)]) { const r = ok(mal); assert.equal(r.ok, false, String(mal)); if (!r.ok) assert.equal(r.issues[0].path, "lia.json.apariencia.objeto"); }
});
