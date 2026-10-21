// pase (H3b): the world pass numinia.com hands a browser, checked here. The contract is the header of numinia-web
// apps/store/src/lib/world-pass.ts (numinia-web #144): a compact JWS `header.payload.signature`, EdDSA (Ed25519), header
// {alg:"EdDSA", typ:"numinia-world-pass", kid}, payload {v:1, iss:"numinia.com", aud, sub, org, perm, height, roles, name?,
// iat, exp} with exactly those fields; an organization's AI agent adds kind:"agent", state:"activa"|"dormida" and a sub a_<32 hex>
// (all three together, never on a person's pass; ia-organizacion SPEC) and may add an optional `ia` block (how the AI looks and is
// called in the world: body, bubble, call, who answers for it; `leerIA` below, only on an AI's pass). Pure: node:crypto only, the clock is passed in, nothing throws. A person's
// roles in the world come from the pass (roles-mundo.ts maps them into the same `puede` the chat orders use).
// Config (read at start, `configPase`): MOTOR_PASE_CLAVE = numinia.com's public key (raw 32 bytes base64url, or the JSON of
// /.well-known/world-pass-key.json), MOTOR_PASE_MUNDO = this world's id (the pass's `aud`), MOTOR_PASE_ORG = optional.
import { createHash, createPublicKey, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";
import type { Result } from "../../core/src/index.ts";
import { MARCA_IA } from "../../instance/src/identidad.ts";
import { PERMISOS } from "./roles.ts";
import type { Permiso } from "./roles.ts";

export const SKEW_S = 60;            // how far ahead of this clock a pass may have been issued
export const ROLES_PASE_MAX = 5;     // numinia.com sends up to five visible roles
export const NOMBRE_PASE_MAX = 40;   // characters, for a person's name and a role's name
const DONDE = "Entra al mundo desde numinia.com para recibir un pase nuevo.";
const SUB = /^p_[0-9a-f]{32}$/;
const SUB_IA = /^a_[0-9a-f]{32}$/;   // an organization's AI agent (HMAC of org + agent id; numinia.com keeps the secret)
const COLOR = /^#[0-9a-f]{6}$/;
const MUNDO_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const B64URL = /^[A-Za-z0-9_-]*$/;

/** numinia.com's public key: the raw 32 bytes, its `kid` (first 8 hex digits of their SHA-256) and the key object. */
export type ClavePase = { kid: string; key: KeyObject };
/** What the engine keeps from a pass. `dueno`: numinia.com's owner height (Number.MAX_VALUE; JSON cannot say Infinity). */
export type EstadoIA = "activa" | "dormida";
/** How an organization AI is shown and called in a world (ia-visible S1; decisions D-082, D-083, D-084). Parsed from the signed pass's
 * optional `ia` block, kept by the world (roles-mundo `iaDe`) and not used yet: later stories read it. Every field is already clean. */
export const FORMAS_BURBUJA = ["esfera", "cupula", "cilindro", "caja"] as const;
export const VISIBLES_BURBUJA = ["siempre", "al-acercarte", "nunca"] as const;
export const QUEDARSE_H = [0, 1, 4, 24] as const;
export const RADIO_DEFECTO_M = 4;                  // an AI whose pass carries no bubble gets the house one: a sphere of 4 m, shown when you come close (features/burbuja)
export const RADIO_MIN_M = 2, RADIO_MAX_M = 12;      // metres of the action bubble (design §3; 4 by default when the block has no bubble)
export const CUERPO_MODELO_MAX = 999;                // same ceiling as features/avatar MODELO_MAX (a packages file does not import features/)
export const FRASE_MAX = 40;                         // characters of the call phrase
export const RESPONDE_MAX = 40;                      // characters of the community's and the person's name
export type FormaBurbuja = (typeof FORMAS_BURBUJA)[number];
export type VisibleBurbuja = (typeof VISIBLES_BURBUJA)[number];
export type IABloque = {
  /** A house avatar (`modelo` = its index, like the avatar feature's `tipo: "casa"`). No block / no body = the house robot (S2). An uploaded .vrm is a file of one server, so it cannot travel in a pass. */
  cuerpo?: { tipo: "casa"; modelo: number };
  burbuja?: { forma: FormaBurbuja; radio: number; visible: VisibleBurbuja };
  /** `nombre`: by its name in the chat; `barra`: `/nombre …`; `boton`: «Hablar con ella» and E; `solo_dentro`: only from inside its bubble; `frase`: an optional key phrase. */
  llamada?: { nombre: boolean; barra: boolean; frase?: string; boton: boolean; solo_dentro: boolean };
  /** D-084: who answers for it, shown to everybody: the community and the person's name or, without one, the short wallet (`0x12…ab`).
   * The pass carries the full address; only its short form is kept here, so the engine can never show more than D-084 allows. */
  responde: { comunidad: string; nombre?: string; cartera?: string };
  /** D-082: hours its body stays in the world when nobody uses it (0 = leaves as today, after 10 minutes). Informational for the world. */
  quedarse_h?: (typeof QUEDARSE_H)[number];
};
/** `kind`/`state` only exist on an organization AI's pass (`kind: "agent"`, `sub` a_…); a person's pass has neither. */
export type Pase = {
  sub: string; aud: string; org: string; permisos: Permiso[]; altura: number; dueno: boolean; kind?: "agent"; state?: EstadoIA;
  roles: { nombre: string; color: string | null }[]; nombre?: string; iat: number; exp: number;
  /** w5: the versions of the texts this person already accepted on numinia.com, per layer (`casa`). Only what the signature vouches for. */
  acepto?: Record<string, string>;
  /** ia-visible S1: only on an AI's pass (`kind: "agent"`); a pass without it is read exactly as before. */
  ia?: IABloque;
};
export type MotivoPase = "forma" | "cabecera" | "clave" | "firma" | "contenido" | "caducado" | "adelantado" | "mundo" | "organizacion";
/** `texto` is what the person reads (Spanish, like the roles' answers): it says how to fix it, never what the pass held. */
export type VeredictoPase = { ok: true; pase: Pase } | { ok: false; motivo: MotivoPase; texto: string };
export type ConfigPase = { clave: ClavePase; mundo: string; org?: string };

const TEXTOS: Record<MotivoPase, string> = {
  forma: `Tu pase de numinia.com no se entiende (¿se cortó al copiarlo?). ${DONDE}`,
  cabecera: `Tu pase no es un pase de mundo de numinia.com. ${DONDE}`,
  clave: `Tu pase está firmado con otra clave que la que este mundo espera. ${DONDE} Si sigue igual, avisa a quien lleva el mundo: su clave de numinia.com (MOTOR_PASE_CLAVE) puede estar vieja.`,
  firma: `Tu pase de numinia.com no es auténtico (la firma no cuadra). ${DONDE}`,
  contenido: `Tu pase de numinia.com tiene un formato que este mundo no conoce. ${DONDE} Si sigue igual, avisa a quien lleva el mundo: el motor puede estar viejo.`,
  caducado: `Tu pase de numinia.com ha caducado (dura 10 minutos). ${DONDE}`,
  adelantado: `Tu pase de numinia.com viene con la fecha adelantada: revisa la hora de tu dispositivo. ${DONDE}`,
  mundo: `Tu pase de numinia.com es de otro mundo. ${DONDE}`,
  organizacion: `Tu pase de numinia.com es de otra organización que la de este mundo. ${DONDE}`,
};
const no = (motivo: MotivoPase): VeredictoPase => ({ ok: false, motivo, texto: TEXTOS[motivo] });

const issue = (path: string, message: string): Result<never> => ({ ok: false, issues: [{ path, message }] });

/** Bytes of base64url text; null when it is not that. */
function decodificar(texto: string): Buffer | null {
  if (!B64URL.test(texto) || texto.length % 4 === 1) return null;
  return Buffer.from(texto, "base64url");
}

/** The key from MOTOR_PASE_CLAVE: raw base64url, or the JSON document numinia.com publishes. Says what to fix. */
export function leerClave(texto: string): Result<ClavePase> {
  const t = texto.trim();
  let crudo = t, kidDicho: string | undefined;
  if (t.startsWith("{")) {
    let doc: unknown;
    try { doc = JSON.parse(t); } catch { return issue("MOTOR_PASE_CLAVE", "parece el JSON de /.well-known/world-pass-key.json pero no es JSON válido: copia el documento entero, o solo el campo publicKey"); }
    const d = doc as Record<string, unknown> | null;
    if (!d || typeof d !== "object" || d.alg !== "Ed25519" || typeof d.publicKey !== "string") return issue("MOTOR_PASE_CLAVE", "el documento debe ser {alg: \"Ed25519\", kid, publicKey}, como lo publica numinia.com en /.well-known/world-pass-key.json");
    crudo = d.publicKey.trim();
    if (typeof d.kid === "string") kidDicho = d.kid;
  }
  const bytes = decodificar(crudo);
  if (!bytes || bytes.length !== 32) return issue("MOTOR_PASE_CLAVE", "la clave pública debe ser de 32 bytes en base64url (43 caracteres): copia el campo publicKey de https://numinia.com/.well-known/world-pass-key.json");
  const kid = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  if (kidDicho !== undefined && kidDicho !== kid) return issue("MOTOR_PASE_CLAVE", `el kid del documento (${kidDicho.slice(0, 16)}) no es el de su clave (${kid}): se copió mal; vuelve a bajar el documento de numinia.com`);
  try { return { ok: true, value: { kid, key: createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: bytes.toString("base64url") }, format: "jwk" }) } }; }
  catch { return issue("MOTOR_PASE_CLAVE", "esos 32 bytes no son una clave Ed25519 válida: copia el campo publicKey de numinia.com"); }
}

/** The pass settings from the environment. null = no key set: passes are ignored. A key that is set but wrong is an error. */
export function configPase(env: Record<string, string | undefined>): { ok: true; pase: ConfigPase | null } | { ok: false; error: string } {
  const texto = env.MOTOR_PASE_CLAVE?.trim();
  if (!texto) return { ok: true, pase: null };
  const mundo = env.MOTOR_PASE_MUNDO?.trim();
  if (!mundo) return { ok: false, error: "MOTOR_PASE_CLAVE está puesta pero falta MOTOR_PASE_MUNDO: el id de este mundo en numinia.com (el `aud` de sus pases, por ejemplo agora-plaza)" };
  if (!MUNDO_ID.test(mundo)) return { ok: false, error: "MOTOR_PASE_MUNDO debe ser el id del mundo en numinia.com: letras, cifras, punto, guion y guion bajo, hasta 64 (sin espacios)" };
  const k = leerClave(texto);
  if (!k.ok) return { ok: false, error: `${k.issues[0].path}: ${k.issues[0].message}` };
  const org = env.MOTOR_PASE_ORG?.trim();
  return { ok: true, pase: { clave: k.value, mundo, ...(org ? { org } : {}) } };
}

const esTexto = (v: unknown): v is string => typeof v === "string";
const REQUERIDOS = ["v", "iss", "aud", "sub", "org", "perm", "height", "roles", "iat", "exp"];
const OPCIONALES = ["name", "kind", "state", "acepto", "ia"];
export const ACEPTO_MAX = 80;        // characters of one accepted version («terms@1.0.1+privacy@2.1.0»)
const ACEPTO_CAPAS = ["casa", "comunidad"]; // the layers of condiciones@1; any other key in `acepto` is ignored (numinia.com may add some)

/** A name shown to everybody: no control characters, one line, short, and never one that says «· IA» (that mark is the server's). */
function limpiar(texto: string, max: number): string {
  let s = texto.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  while (s.endsWith(MARCA_IA.trim())) s = s.slice(0, -MARCA_IA.trim().length).trim();
  return [...s].slice(0, max).join("").trim();
}

const CARTERA = /^0x[0-9a-fA-F]{40}$/;
const MAL_TEXTO = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/; // control, line separators, zero-width and bidi marks
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** The first key of `o` that is not in `permitidas`, or null. */
const sobra = (o: Record<string, unknown>, permitidas: readonly string[]): string | null => Object.keys(o).find((k) => !permitidas.includes(k)) ?? null;
/** The wallet as everybody may see it: `0x12…ab` (first and last byte), lowercase. */
export const carteraCorta = (c: string): string => `${c.slice(0, 4)}…${c.slice(-2)}`.toLowerCase();

/** The `ia` block of an AI's pass, strictly: an unknown field at any level, a wrong type or a value out of range is refused with a
 * short sentence that names the field (`razon`), never the value. Pure; the caller turns a refusal into the pass's `contenido` answer. */
export function leerIA(x: unknown): { ok: true; ia: IABloque } | { ok: false; razon: string } {
  const no = (razon: string) => ({ ok: false as const, razon });
  if (!esObjeto(x)) return no("ia debe ser un objeto");
  const fuera = sobra(x, ["cuerpo", "burbuja", "llamada", "responde", "quedarse_h"]);
  if (fuera) return no(`ia.${fuera} no existe (admite cuerpo, burbuja, llamada, responde y quedarse_h; el estado va en el pase, no en ia)`);
  const ia: Partial<IABloque> = {};
  if (x.cuerpo !== undefined) {
    const c = x.cuerpo;
    if (!esObjeto(c)) return no("ia.cuerpo debe ser un objeto {tipo: \"casa\", modelo}");
    const f = sobra(c, ["tipo", "modelo"]);
    if (f) return no(`ia.cuerpo.${f} no existe (admite tipo y modelo)`);
    if (c.tipo !== "casa") return no("ia.cuerpo.tipo debe ser «casa»: un .vrm subido es de un servidor y no viaja en el pase");
    if (!Number.isInteger(c.modelo) || (c.modelo as number) < 0 || (c.modelo as number) > CUERPO_MODELO_MAX) return no(`ia.cuerpo.modelo debe ser un entero de 0 a ${CUERPO_MODELO_MAX}`);
    ia.cuerpo = { tipo: "casa", modelo: c.modelo as number };
  }
  if (x.burbuja !== undefined) {
    const b = x.burbuja;
    if (!esObjeto(b)) return no("ia.burbuja debe ser un objeto {forma, radio, visible}");
    const f = sobra(b, ["forma", "radio", "visible"]);
    if (f) return no(`ia.burbuja.${f} no existe (admite forma, radio y visible)`);
    if (!FORMAS_BURBUJA.includes(b.forma as FormaBurbuja)) return no(`ia.burbuja.forma debe ser ${FORMAS_BURBUJA.join(", ")}`);
    if (!Number.isInteger(b.radio) || (b.radio as number) < RADIO_MIN_M || (b.radio as number) > RADIO_MAX_M) return no(`ia.burbuja.radio debe ser un entero de ${RADIO_MIN_M} a ${RADIO_MAX_M} (metros)`);
    if (!VISIBLES_BURBUJA.includes(b.visible as VisibleBurbuja)) return no(`ia.burbuja.visible debe ser ${VISIBLES_BURBUJA.join(", ")}`);
    ia.burbuja = { forma: b.forma as FormaBurbuja, radio: b.radio as number, visible: b.visible as VisibleBurbuja };
  }
  if (x.llamada !== undefined) {
    const l = x.llamada;
    if (!esObjeto(l)) return no("ia.llamada debe ser un objeto {nombre, barra, boton, solo_dentro, frase?}");
    const f = sobra(l, ["nombre", "barra", "frase", "boton", "solo_dentro"]);
    if (f) return no(`ia.llamada.${f} no existe (admite nombre, barra, frase, boton y solo_dentro)`);
    for (const k of ["nombre", "barra", "boton", "solo_dentro"] as const) if (typeof l[k] !== "boolean") return no(`ia.llamada.${k} debe ser true o false`);
    let frase: string | undefined;
    if (l.frase !== undefined) {
      if (!esTexto(l.frase) || MAL_TEXTO.test(l.frase)) return no("ia.llamada.frase debe ser un texto de una línea, sin caracteres de control");
      frase = l.frase.trim();
      if (frase === "" || [...frase].length > FRASE_MAX) return no(`ia.llamada.frase debe tener de 1 a ${FRASE_MAX} caracteres`);
    }
    ia.llamada = { nombre: l.nombre as boolean, barra: l.barra as boolean, ...(frase ? { frase } : {}), boton: l.boton as boolean, solo_dentro: l.solo_dentro as boolean };
  }
  const r = x.responde;
  if (!esObjeto(r)) return no("ia.responde es obligatorio: {comunidad, nombre?, cartera?}, quién responde por la IA");
  const f = sobra(r, ["comunidad", "nombre", "cartera"]);
  if (f) return no(`ia.responde.${f} no existe (admite comunidad, nombre y cartera)`);
  const texto = (k: "comunidad" | "nombre", obligatorio: boolean): string | null | undefined => {
    const v = r[k];
    if (v === undefined && !obligatorio) return undefined;
    if (!esTexto(v)) return null;
    const limpio = limpiar(v, RESPONDE_MAX);
    return limpio === "" ? null : limpio; // a longer text is cut to RESPONDE_MAX, like a person's name
  };
  const comunidad = texto("comunidad", true), nombre = texto("nombre", false);
  if (!comunidad) return no(`ia.responde.comunidad debe ser un texto de 1 a ${RESPONDE_MAX} caracteres`);
  if (nombre === null) return no(`ia.responde.nombre debe ser un texto de 1 a ${RESPONDE_MAX} caracteres`);
  let cartera: string | undefined;
  if (r.cartera !== undefined) {
    if (!esTexto(r.cartera) || !CARTERA.test(r.cartera)) return no("ia.responde.cartera debe ser una dirección 0x seguida de 40 cifras hexadecimales");
    cartera = carteraCorta(r.cartera);
  }
  if (!nombre && !cartera) return no("ia.responde necesita nombre o cartera: la marca de IA dice quién responde por ella (D-084)");
  ia.responde = { comunidad, ...(nombre ? { nombre } : {}), ...(cartera ? { cartera } : {}) };
  if (x.quedarse_h !== undefined) {
    if (!QUEDARSE_H.includes(x.quedarse_h as (typeof QUEDARSE_H)[number])) return no(`ia.quedarse_h debe ser ${QUEDARSE_H.join(", ")} (horas)`);
    ia.quedarse_h = x.quedarse_h as (typeof QUEDARSE_H)[number];
  }
  return { ok: true, ia: ia as IABloque };
}

/** A pass's payload, read: the pass, or why a well-signed payload still is not one (`ia`: the block's own reason), or null (unknown shape). */
type Carga = { pase: Pase } | { ia: string } | null;

function leerCarga(json: unknown): Carga {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const r = json as Record<string, unknown>, claves = Object.keys(r);
  if (!REQUERIDOS.every((k) => claves.includes(k)) || !claves.every((k) => REQUERIDOS.includes(k) || OPCIONALES.includes(k))) return null;
  // an AI's pass: kind "agent" + sub a_… + state, all three together; a person's pass has none of them
  const ia = r.kind !== undefined;
  if (ia ? r.kind !== "agent" || !esTexto(r.sub) || !SUB_IA.test(r.sub) || (r.state !== "activa" && r.state !== "dormida") : r.state !== undefined || (esTexto(r.sub) && SUB_IA.test(r.sub))) return null;
  if (r.v !== 1 || r.iss !== "numinia.com" || !esTexto(r.aud) || !esTexto(r.sub) || !(ia || SUB.test(r.sub)) || !esTexto(r.org) || r.org === "") return null;
  if (!Array.isArray(r.perm) || !r.perm.every(esTexto)) return null;
  if (typeof r.height !== "number" || !(r.height >= 0) || typeof r.iat !== "number" || typeof r.exp !== "number" || !Number.isFinite(r.iat) || !Number.isFinite(r.exp)) return null;
  if (!Array.isArray(r.roles) || r.roles.length > ROLES_PASE_MAX) return null;
  const roles: Pase["roles"] = [];
  for (const x of r.roles as unknown[]) {
    const o = x as Record<string, unknown> | null;
    if (typeof o !== "object" || o === null || !esTexto(o.name) || !(o.color === null || esTexto(o.color))) return null;
    roles.push({ nombre: limpiar(o.name, NOMBRE_PASE_MAX), color: esTexto(o.color) && COLOR.test(o.color) ? o.color : null });
  }
  if (r.name !== undefined && !esTexto(r.name)) return null;
  const nombre = esTexto(r.name) ? limpiar(r.name, NOMBRE_PASE_MAX) : "";
  // w5: what the person already accepted on numinia.com. A person's pass only (an AI accepts nothing); the field is a plain object, and a
  // version that is not a short text of printable characters counts as «not accepted», never as a refused pass.
  let acepto: Record<string, string> | undefined;
  if (r.acepto !== undefined) {
    const a = r.acepto as Record<string, unknown> | null;
    if (ia || typeof a !== "object" || a === null || Array.isArray(a)) return null;
    for (const capa of ACEPTO_CAPAS) { const v = a[capa]; if (esTexto(v) && v.length > 0 && v.length <= ACEPTO_MAX && !/[\u0000-\u001f\u007f-\u009f]/.test(v)) (acepto ??= {})[capa] = v; }
  }
  // ia-visible S1: how this AI looks and is called. An AI's pass only; a bad block refuses the pass saying which field.
  let bloque: IABloque | undefined;
  if (r.ia !== undefined) {
    if (!ia) return { ia: "ia solo existe en el pase de una IA (kind \"agent\")" };
    const l = leerIA(r.ia);
    if (!l.ok) return { ia: l.razon };
    bloque = l.ia;
  }
  // permissions this engine does not know are dropped (numinia.com may add some), like roles.ts
  const permisos = PERMISOS.filter((p) => (r.perm as string[]).includes(p));
  const dueno = r.height >= Number.MAX_VALUE && !ia; // an AI is never an owner, whatever its height says
  return { pase: { sub: r.sub, aud: r.aud, org: r.org, permisos, altura: dueno ? Number.POSITIVE_INFINITY : r.height, dueno, roles, ...(nombre ? { nombre } : {}), ...(acepto ? { acepto } : {}), ...(ia ? { kind: "agent" as const, state: r.state as EstadoIA } : {}), ...(bloque ? { ia: bloque } : {}), iat: r.iat, exp: r.exp } };
}

function json(bytes: Buffer): unknown {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return null; }
}

/** Checks a pass against numinia.com's public key, this world's id (and organization, if the config names one). */
export function verificarPase(token: string, clave: ClavePase, en: { aud: string; now: number; org?: string }): VeredictoPase {
  if (typeof token !== "string" || token.length > 4096) return no("forma");
  const partes = token.split(".");
  const dec = partes.map(decodificar);
  if (partes.length !== 3 || dec.some((p) => p === null)) return no("forma");
  const [cab, cuerpo, firma] = dec as [Buffer, Buffer, Buffer];
  const h = json(cab) as Record<string, unknown> | null;
  if (!h || typeof h !== "object" || h.alg !== "EdDSA" || h.typ !== "numinia-world-pass" || !esTexto(h.kid)) return no("cabecera");
  if (h.kid !== clave.kid) return no("clave");
  let firmada = false;
  try { firmada = firma.length === 64 && verify(null, Buffer.from(`${partes[0]}.${partes[1]}`), clave.key, firma); } catch { firmada = false; }
  if (!firmada) return no("firma");
  const carga = leerCarga(json(cuerpo));
  if (!carga) return no("contenido");
  if ("ia" in carga) return { ok: false, motivo: "contenido", texto: `Tu pase de numinia.com trae un bloque «ia» que este mundo no acepta: ${carga.ia}. ${DONDE} Si sigue igual, avisa a quien lleva el mundo: el motor puede estar viejo.` };
  const pase = carga.pase;
  if (en.now > pase.exp) return no("caducado");
  if (en.now < pase.iat - SKEW_S) return no("adelantado");
  if (pase.aud !== en.aud) return no("mundo");
  if (en.org !== undefined && pase.org !== en.org) return no("organizacion");
  return { ok: true, pase };
}

