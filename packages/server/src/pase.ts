// pase (H3b): the world pass numinia.com hands a browser, checked here. The contract is the header of numinia-web
// apps/store/src/lib/world-pass.ts (numinia-web #144): a compact JWS `header.payload.signature`, EdDSA (Ed25519), header
// {alg:"EdDSA", typ:"numinia-world-pass", kid}, payload {v:1, iss:"numinia.com", aud, sub, org, perm, height, roles, name?,
// iat, exp} with exactly those fields; an organization's AI agent adds kind:"agent", state:"activa"|"dormida" and a sub a_<32 hex>
// (all three together, never on a person's pass; ia-organizacion SPEC). Pure: node:crypto only, the clock is passed in, nothing throws. A person's
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
/** `kind`/`state` only exist on an organization AI's pass (`kind: "agent"`, `sub` a_…); a person's pass has neither. */
export type Pase = {
  sub: string; aud: string; org: string; permisos: Permiso[]; altura: number; dueno: boolean; kind?: "agent"; state?: EstadoIA;
  roles: { nombre: string; color: string | null }[]; nombre?: string; iat: number; exp: number;
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
const OPCIONALES = ["name", "kind", "state"];

/** A name shown to everybody: no control characters, one line, short, and never one that says «· IA» (that mark is the server's). */
function limpiar(texto: string, max: number): string {
  let s = texto.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  while (s.endsWith(MARCA_IA.trim())) s = s.slice(0, -MARCA_IA.trim().length).trim();
  return [...s].slice(0, max).join("").trim();
}

function leerCarga(json: unknown): Pase | null {
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
  // permissions this engine does not know are dropped (numinia.com may add some), like roles.ts
  const permisos = PERMISOS.filter((p) => (r.perm as string[]).includes(p));
  const dueno = r.height >= Number.MAX_VALUE && !ia; // an AI is never an owner, whatever its height says
  return { sub: r.sub, aud: r.aud, org: r.org, permisos, altura: dueno ? Number.POSITIVE_INFINITY : r.height, dueno, roles, ...(nombre ? { nombre } : {}), ...(ia ? { kind: "agent" as const, state: r.state as EstadoIA } : {}), iat: r.iat, exp: r.exp };
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
  const pase = leerCarga(json(cuerpo));
  if (!pase) return no("contenido");
  if (en.now > pase.exp) return no("caducado");
  if (en.now < pase.iat - SKEW_S) return no("adelantado");
  if (pase.aud !== en.aud) return no("mundo");
  if (en.org !== undefined && pase.org !== en.org) return no("organizacion");
  return { ok: true, pase };
}

