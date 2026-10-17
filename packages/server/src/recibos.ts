// recibos (N10, bienes digitales): the world's signed proof that a digital good belongs to someone. No chain, no
// wallet, no money: the world server signs, with an Ed25519 key of its own, a small JSON that says WHAT (the good: id,
// name, model, licence), WHO it belongs to (the guest id this world knows), WHERE it came from (world, quest) and WHEN.
// Anyone can check it offline with the public key written inside (`emisor`), so the receipt travels with its owner as
// a file; a later step can lazy-mint it as an ERC-721 on a testnet (cadena.ts: the metadata and the voucher's shape).
//
//   token = "nb1." + base64url(canonical JSON of the payload) + "." + base64url(Ed25519 signature of the ASCII bytes
//           of "nb1." + base64url(payload))                                  (≈ 500–900 characters)
//   payload = { v: 1, tipo: "bien", id, objeto: { id, nombre, descripcion, modelo, licencia }, dueno, mundo, mision,
//               instante, emisor: "ed25519:<43 base64url>" }               (canonical = keys sorted, no spaces)
//
// The key: derived from the world's secret (MOTOR_SECRET, HKDF-SHA256, info "numinia-recibos-ed25519-v1"), so there is
// no new file to keep or to leak in a world's zip, and a world without a secret signs nothing (as api.sign). Change the
// secret and the world signs as someone new: old receipts still verify (their key is inside) but no longer say «this
// world». Nothing here touches a blockchain key: those are Pablo's decision (work/noche-20261018/N10-bienes-digitales.md).
import { createHash, createPrivateKey, createPublicKey, hkdfSync, sign as firmarBytes, verify as verificarBytes } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { MIN_SECRET } from "./secret.ts";

export const PREFIJO_RECIBO = "nb1.";
export const RECIBO_MAX = 1400;                       // characters of a token (the feature's wire field allows this)
export const CLAVE_EMISOR = /^ed25519:[A-Za-z0-9_-]{43}$/;
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex"); // DER head of an Ed25519 PKCS#8 key; + 32-byte seed

/** What a feature asks the world to sign (the world adds v, tipo, mundo and emisor). */
export type DatosBien = { id: string; objeto: { id: string; nombre: string; descripcion: string; modelo: string; licencia: string }; dueno: string; mision: string; instante: string };
export type Recibo = DatosBien & { v: 1; tipo: "bien"; mundo: string; emisor: string };
export type Leido = { ok: true; recibo: Recibo; huella: string } | { ok: false; motivo: string };

const b64 = (b: Buffer): string => b.toString("base64url");
/** JSON with its object keys sorted at every level and no spaces: one text per value, so one signature per value. */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
/** The public key as the engine writes Ed25519 keys elsewhere (agent/llave.ts): "ed25519:" + base64url of its 32 bytes. */
export const textoClave = (k: KeyObject): string => `ed25519:${(k.export({ format: "jwk" }) as { x: string }).x}`;
/** The key object behind "ed25519:<43>", or null. */
export function claveDe(texto: string): KeyObject | null {
  if (!CLAVE_EMISOR.test(texto)) return null;
  try { return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: texto.slice(8) }, format: "jwk" }); } catch { return null; }
}
/** The world's receipt key from its secret (deterministic), or null when the secret is missing or short. */
export function llaveDelMundo(secret: string | undefined): KeyObject | null {
  if (!secret || secret.length < MIN_SECRET) return null;
  const semilla = Buffer.from(hkdfSync("sha256", secret, "numinia-engine", "numinia-recibos-ed25519-v1", 32));
  return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, semilla]), format: "der", type: "pkcs8" });
}
/** sha256 of the token, 64 hex: what a list, a log or a chain may name instead of the receipt itself. */
export const huellaDe = (token: string): string => createHash("sha256").update(token).digest("hex");

const texto = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
/** Is this a receipt's payload (shape only; the signature is checked apart)? */
function esRecibo(v: unknown): v is Recibo {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>, o = r.objeto as Record<string, unknown> | undefined;
  return r.v === 1 && r.tipo === "bien" && texto(r.id, 64) && /^[0-9a-f]{24}$/.test(r.id as string) && texto(r.dueno, 64) && texto(r.mundo, 120) && texto(r.mision, 64) && texto(r.instante, 40) && typeof r.emisor === "string" && CLAVE_EMISOR.test(r.emisor)
    && !!o && typeof o === "object" && texto(o.id, 64) && texto(o.nombre, 120) && texto(o.descripcion, 400) && texto(o.modelo, 64) && texto(o.licencia, 64);
}

/** Sign a good for its owner. `mundo` = the world's public name (its domain) or "local". */
export function firmarRecibo(llave: KeyObject, mundo: string, d: DatosBien): string {
  const r: Recibo = { v: 1, tipo: "bien", id: d.id, objeto: { ...d.objeto }, dueno: d.dueno, mundo, mision: d.mision, instante: d.instante, emisor: textoClave(createPublicKey(llave)) };
  const cuerpo = PREFIJO_RECIBO + b64(Buffer.from(canonico(r)));
  return `${cuerpo}.${b64(firmarBytes(null, Buffer.from(cuerpo), llave))}`;
}

/** Read and check a receipt: its shape, its canonical form and its signature by the key written inside. Never throws.
 * Whether that key is a world you trust is the caller's question (`emisor`). */
export function leerRecibo(token: unknown): Leido {
  if (typeof token !== "string" || !token.startsWith(PREFIJO_RECIBO)) return { ok: false, motivo: "no es un recibo de Numinia (empieza por «nb1.»)" };
  if (token.length > RECIBO_MAX) return { ok: false, motivo: `demasiado largo (más de ${RECIBO_MAX} caracteres)` };
  const partes = token.split(".");
  if (partes.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(partes[1]) || !/^[A-Za-z0-9_-]{86}$/.test(partes[2])) return { ok: false, motivo: "recibo roto (faltan partes)" };
  let r: unknown, json = "";
  try { json = Buffer.from(partes[1], "base64url").toString("utf8"); r = JSON.parse(json); } catch { return { ok: false, motivo: "recibo roto (no se lee)" }; }
  if (!esRecibo(r)) return { ok: false, motivo: "recibo con campos que no son los de un bien" };
  if (canonico(r) !== json) return { ok: false, motivo: "recibo no canónico (alguien lo reescribió)" };
  const k = claveDe(r.emisor);
  if (!k) return { ok: false, motivo: "la clave del emisor no se lee" };
  let bien = false;
  try { bien = verificarBytes(null, Buffer.from(`${partes[0]}.${partes[1]}`), k, Buffer.from(partes[2], "base64url")); } catch { bien = false; }
  return bien ? { ok: true, recibo: r, huella: huellaDe(token) } : { ok: false, motivo: "la firma no cuadra: el recibo se cambió o no lo firmó ese mundo" };
}

/** What the server hands the features (api.recibo / api.verificarRecibo), or null when the world has no secret. */
export function crearRecibos(secret: string | undefined, mundo: string): { emisor: string; firmar(d: DatosBien): string; verificar(token: string): Leido & { nuestro?: boolean } } | null {
  const llave = llaveDelMundo(secret);
  if (!llave) return null;
  const emisor = textoClave(createPublicKey(llave));
  return {
    emisor,
    firmar: (d) => firmarRecibo(llave, mundo, d),
    verificar: (token) => { const l = leerRecibo(token); return l.ok ? { ...l, nuestro: l.recibo.emisor === emisor } : l; },
  };
}
