// ia-visible S1: the optional `ia` block of an organization AI's pass (how it looks and is called in the world; pase.ts `leerIA`).
// Strict at every level: unknown fields, wrong types and out-of-range values refuse the pass («contenido») with the field named.
// A pass without the block is read exactly as before. The world keeps the parsed block (roles-mundo `iaDe`); nothing uses it yet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { leerClave, leerIA, verificarPase, carteraCorta } from "../packages/server/src/pase.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { signer } from "../packages/server/src/secret.ts";

const b64 = (b: Buffer | string): string => Buffer.from(b).toString("base64url");
const par = generateKeyPairSync("ed25519");
const rawDe = (k: KeyObject): Buffer => Buffer.from(k.export({ format: "jwk" }).x as string, "base64url");
const RAW = b64(rawDe(par.publicKey));
const KID = createHash("sha256").update(rawDe(par.publicKey)).digest("hex").slice(0, 8);
const clave = (() => { const r = leerClave(RAW); assert.ok(r.ok); return r.value; })();
const AHORA = 1_790_000_000;
const en = { aud: "agora-plaza", now: AHORA };
const SUB = `p_${"ab".repeat(16)}`, SUB_IA = `a_${"cd".repeat(16)}`;
const CARTERA = `0x${"12".repeat(19)}ab`;

const carga = (o: Record<string, unknown> = {}) => ({
  v: 1, iss: "numinia.com", aud: "agora-plaza", sub: SUB, org: "org-1", perm: ["enter-worlds", "build-in-worlds"], height: 3,
  roles: [{ name: "Guardia", color: "#aabbcc" }], name: "Lía", iat: AHORA - 5, exp: AHORA + 595, ...o,
});
const cargaIA = (o: Record<string, unknown> = {}) => carga({ sub: SUB_IA, kind: "agent", state: "activa", name: "Ada", height: 0, perm: ["enter-worlds", "build-in-worlds"], ...o });
function pase(payload: object): string {
  const firmado = `${b64(JSON.stringify({ alg: "EdDSA", typ: "numinia-world-pass", kid: KID }))}.${b64(JSON.stringify(payload))}`;
  return `${firmado}.${b64(sign(null, Buffer.from(firmado), par.privateKey))}`;
}
const COMPLETO = {
  cuerpo: { tipo: "casa", modelo: 2 },
  burbuja: { forma: "cupula", radio: 6, visible: "siempre" },
  llamada: { nombre: true, barra: true, frase: "agente, responde", boton: true, solo_dentro: false },
  responde: { comunidad: "La Torre", nombre: "Ana", cartera: CARTERA },
  quedarse_h: 4,
};
const mal = (ia: unknown): string => { const r = leerIA(ia); assert.ok(!r.ok, JSON.stringify(ia).slice(0, 80)); return r.ok ? "" : r.razon; };

test("ia: a full block is read as it is, the wallet only in its short form", () => {
  const v = verificarPase(pase(cargaIA({ ia: COMPLETO })), clave, en);
  assert.ok(v.ok);
  assert.deepEqual(v.pase.ia, { ...COMPLETO, responde: { comunidad: "La Torre", nombre: "Ana", cartera: "0x12…ab" } });
  assert.equal(carteraCorta(`0xABCDEF${"0".repeat(32)}CD`), "0xab…cd");
});

test("ia: the smallest block is only «responde» (D-084): community plus name, or community plus wallet", () => {
  for (const responde of [{ comunidad: "La Torre", nombre: "Ana" }, { comunidad: "La Torre", cartera: CARTERA }]) {
    const v = verificarPase(pase(cargaIA({ ia: { responde } })), clave, en);
    assert.ok(v.ok && v.pase.ia && Object.keys(v.pase.ia).join() === "responde");
  }
  const sinFrase = leerIA({ responde: COMPLETO.responde, llamada: { nombre: true, barra: false, boton: true, solo_dentro: true } });
  assert.ok(sinFrase.ok && sinFrase.ia.llamada && !("frase" in sinFrase.ia.llamada));
});

test("ia: a pass without the block is read exactly as before (no `ia` key at all), for a person and for an AI", () => {
  const persona = verificarPase(pase(carga()), clave, en), ia = verificarPase(pase(cargaIA()), clave, en);
  assert.ok(persona.ok && ia.ok);
  assert.ok(!("ia" in persona.pase) && !("ia" in ia.pase));
});

test("ia: only an AI's pass may carry the block; a person's pass with one is refused and says why", () => {
  const v = verificarPase(pase(carga({ ia: { responde: COMPLETO.responde } })), clave, en);
  assert.ok(!v.ok && v.motivo === "contenido");
  assert.match(v.texto, /solo existe en el pase de una IA/);
});

test("ia: every field of the block is strict — unknown fields at any level, wrong shapes", () => {
  assert.match(mal({ ...COMPLETO, extra: 1 }), /ia\.extra no existe/);
  assert.match(mal({ ...COMPLETO, estado: "activa" }), /ia\.estado no existe.*el estado va en el pase/);
  assert.match(mal({ ...COMPLETO, cuerpo: { tipo: "casa", modelo: 1, url: "x" } }), /ia\.cuerpo\.url no existe/);
  assert.match(mal({ ...COMPLETO, burbuja: { ...COMPLETO.burbuja, color: "rojo" } }), /ia\.burbuja\.color no existe/);
  assert.match(mal({ ...COMPLETO, llamada: { ...COMPLETO.llamada, dentro: true } }), /ia\.llamada\.dentro no existe/);
  assert.match(mal({ ...COMPLETO, responde: { ...COMPLETO.responde, correo: "a@b" } }), /ia\.responde\.correo no existe/);
  for (const basura of [null, 3, "x", [], [COMPLETO]]) assert.match(mal(basura), /ia debe ser un objeto/);
  for (const k of ["cuerpo", "burbuja", "llamada"]) for (const basura of [null, 3, "x", []]) assert.match(mal({ ...COMPLETO, [k]: basura }), new RegExp(`ia\\.${k} debe ser un objeto`));
  assert.match(mal({ ...COMPLETO, responde: null }), /ia\.responde es obligatorio/);
  const { responde: _, ...sinResponde } = COMPLETO;
  assert.match(mal(sinResponde), /ia\.responde es obligatorio/);
  assert.match(mal({}), /ia\.responde es obligatorio/);
});

test("ia: body — a house avatar by index; an uploaded or remote one cannot travel in a pass", () => {
  for (const modelo of [0, 2, 999]) assert.ok(leerIA({ ...COMPLETO, cuerpo: { tipo: "casa", modelo } }).ok);
  assert.match(mal({ ...COMPLETO, cuerpo: { tipo: "subido", modelo: 0 } }), /ia\.cuerpo\.tipo debe ser «casa»/);
  assert.match(mal({ ...COMPLETO, cuerpo: { modelo: 0 } }), /ia\.cuerpo\.tipo/);
  for (const modelo of [-1, 1000, 1.5, "1", null, undefined, Number.NaN]) assert.match(mal({ ...COMPLETO, cuerpo: { tipo: "casa", modelo } }), /ia\.cuerpo\.modelo debe ser un entero de 0 a 999/);
});

test("ia: bubble — four shapes, radius 2..12 whole metres, three visibilities; all three fields", () => {
  for (const forma of ["esfera", "cupula", "cilindro", "caja"]) for (const visible of ["siempre", "al-acercarte", "nunca"]) for (const radio of [2, 4, 12]) assert.ok(leerIA({ ...COMPLETO, burbuja: { forma, radio, visible } }).ok);
  for (const forma of ["cubo", "Esfera", "", 1, null, undefined]) assert.match(mal({ ...COMPLETO, burbuja: { ...COMPLETO.burbuja, forma } }), /ia\.burbuja\.forma/);
  for (const radio of [1, 13, 0, -4, 2.5, "4", null, undefined, Infinity]) assert.match(mal({ ...COMPLETO, burbuja: { ...COMPLETO.burbuja, radio } }), /ia\.burbuja\.radio debe ser un entero de 2 a 12/);
  for (const visible of ["a-veces", "", true, null, undefined]) assert.match(mal({ ...COMPLETO, burbuja: { ...COMPLETO.burbuja, visible } }), /ia\.burbuja\.visible/);
});

test("ia: call — four booleans and an optional key phrase of 1..40 characters on one line", () => {
  const llamada = (o: Record<string, unknown>) => ({ ...COMPLETO, llamada: { ...COMPLETO.llamada, ...o } });
  for (const k of ["nombre", "barra", "boton", "solo_dentro"]) for (const v of [1, "true", null, undefined]) assert.match(mal(llamada({ [k]: v })), new RegExp(`ia\\.llamada\\.${k} debe ser true o false`));
  const quieta = leerIA(llamada({ frase: undefined }));
  assert.ok(quieta.ok && !("frase" in quieta.ia.llamada!));
  const borde = leerIA(llamada({ frase: "x".repeat(40) })), tilde = leerIA(llamada({ frase: "  ¿me ayudas?  " }));
  assert.ok(borde.ok && tilde.ok && tilde.ia.llamada?.frase === "¿me ayudas?", "trimmed");
  assert.ok(leerIA(llamada({ frase: "😀".repeat(40) })).ok, "40 characters, not 40 UTF-16 units");
  for (const frase of ["", "   ", "x".repeat(41), "😀".repeat(41)]) assert.match(mal(llamada({ frase })), /ia\.llamada\.frase debe tener de 1 a 40/);
  for (const frase of [3, null, ["a"], "dos\nlíneas", "tab\taqui", "nul\u0000", "\u202eexit", "a\u200bb"]) assert.match(mal(llamada({ frase })), /ia\.llamada\.frase debe ser un texto de una línea/);
});

test("ia: who answers — a community and a name or a wallet (D-084); names are cleaned like a person's, a wallet is kept short", () => {
  const r = (o: Record<string, unknown>) => ({ ...COMPLETO, responde: { comunidad: "La Torre", nombre: "Ana", ...o } });
  const limpio = leerIA(r({ comunidad: "  La\u0007  Torre · IA ", nombre: "Ana\n · IA" }));
  assert.ok(limpio.ok && limpio.ia.responde.comunidad === "La Torre" && limpio.ia.responde.nombre === "Ana", "no control characters, never a «· IA» mark");
  const larga = leerIA(r({ comunidad: "c".repeat(60) }));
  assert.ok(larga.ok && larga.ia.responde.comunidad.length === 40, "cut at 40 like a name");
  for (const comunidad of ["", "   ", "\n", " · IA", 3, null, undefined]) assert.match(mal(r({ comunidad })), /ia\.responde\.comunidad/);
  for (const nombre of ["", "  ", 3, null]) assert.match(mal(r({ nombre })), /ia\.responde\.nombre/);
  for (const cartera of ["0x12", "12".repeat(20), `0x${"zz".repeat(20)}`, `0x${"12".repeat(21)}`, 7, null]) assert.match(mal(r({ cartera })), /ia\.responde\.cartera debe ser una dirección 0x/);
  assert.match(mal({ ...COMPLETO, responde: { comunidad: "La Torre" } }), /necesita nombre o cartera/);
  const solo = leerIA({ responde: { comunidad: "La Torre", cartera: CARTERA.toUpperCase().replace("0X", "0x") } });
  assert.ok(solo.ok && solo.ia.responde.cartera === "0x12…ab" && !("nombre" in solo.ia.responde));
  assert.ok(!JSON.stringify(solo).includes(CARTERA.slice(6)), "the full address is never kept");
});

test("ia: stays in the world — 0, 1, 4 or 24 hours (D-082)", () => {
  for (const h of [0, 1, 4, 24]) { const v = leerIA({ ...COMPLETO, quedarse_h: h }); assert.ok(v.ok && v.ia.quedarse_h === h); }
  for (const h of [2, 3, 12, 25, -1, "4", null, true]) assert.match(mal({ ...COMPLETO, quedarse_h: h }), /ia\.quedarse_h debe ser 0, 1, 4, 24/);
});

test("ia: a bad block refuses the whole pass as «contenido» and the text names the field, never the value", () => {
  for (const ia of [{ ...COMPLETO, burbuja: { forma: "esfera", radio: 99, visible: "siempre" } }, { ...COMPLETO, secreto: "S3CR3T-VALUE" }, { responde: { comunidad: "La Torre", cartera: "0xSECRET-WALLET" } }]) {
    const v = verificarPase(pase(cargaIA({ ia })), clave, en);
    assert.ok(!v.ok && v.motivo === "contenido");
    assert.match(v.texto, /numinia\.com/, "tells where to get a fresh pass");
    assert.match(v.texto, /ia\.(burbuja\.radio|secreto|responde\.cartera)/);
    assert.ok(!/S3CR3T|SECRET|99/.test(v.texto.replace(/ia\.burbuja\.radio debe ser un entero de 2 a 12/, "")), "no value echoed");
  }
  for (const otro of [cargaIA({ extra: 1, ia: { responde: COMPLETO.responde } }), cargaIA({ ia: undefined, kind: "bot" })]) {
    const v = verificarPase(pase(otro), clave, en);
    assert.ok(!v.ok && v.motivo === "contenido" && !/Detalle|bloque/.test(v.texto), "other unknown fields stay refused as before");
  }
});

test("ia: the world keeps the parsed block per AI (iaDe): a fresh pass replaces it, a person or an unknown id has none", () => {
  let ahora = AHORA * 1000;
  const roles = crearRoles({ construir: false, admin: "codigo-de-administracion-largo", firmar: signer("una-clave-de-prueba-larga"), pase: { clave, mundo: "agora-plaza", org: "org-1" }, cerrar: () => {}, ahora: () => ahora, log: () => {} });
  const entra = (e: number, payload: object) => roles.credencial(e, pase(payload), { id: "invitado", nombre: "x" } as never);
  assert.equal(roles.iaDe(`ia-${SUB_IA}`), null, "nobody yet");
  assert.ok(entra(1, cargaIA({ ia: COMPLETO })));
  assert.deepEqual(roles.iaDe(`ia-${SUB_IA}`), { ...COMPLETO, responde: { comunidad: "La Torre", nombre: "Ana", cartera: "0x12…ab" } });
  assert.equal(roles.iaDe(SUB_IA), null, "needs the «ia-» id");
  assert.equal(roles.iaDe(SUB), null);
  assert.equal(roles.iaDe(`ia-a_${"00".repeat(16)}`), null);
  // mid-session renewal (a newer pass) replaces the block; an entry without the block clears it
  ahora += 60_000;
  const nuevo = { responde: { comunidad: "La Torre", nombre: "Ana" }, burbuja: { forma: "caja", radio: 3, visible: "nunca" } };
  assert.equal(roles.renovar(1, pase(cargaIA({ iat: AHORA + 60, exp: AHORA + 660, ia: nuevo }))), null);
  assert.deepEqual(roles.iaDe(`ia-${SUB_IA}`), nuevo);
  assert.ok(entra(2, cargaIA({ iat: AHORA + 61, exp: AHORA + 661 })));
  assert.equal(roles.iaDe(`ia-${SUB_IA}`), null, "a pass without the block means none");
  assert.ok(entra(3, carga()));
  assert.equal(roles.iaDe(SUB), null);
});
