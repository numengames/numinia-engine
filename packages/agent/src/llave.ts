// llave (ADR-080): an outside agent's own key. The agent makes an Ed25519 pair where it runs; the PRIVATE key never
// leaves that machine (a PKCS#8 PEM file, mode 600: tools/agente.ts nuevo); the world lists only the PUBLIC key, in
// aventura/agentes/<id>.json (agente@1), written as
//   "ed25519:" + base64url of the raw 32 bytes of the public key (no padding: 43 characters)
// To enter, the agent signs mensajeAgente(world, id, ms, nonce) (instance/identidad.ts) and shows the a2 ticket.
// node:crypto only, no dependency.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { AGENTE_ID, mensajeAgente } from "../../instance/src/identidad.ts";

export const PREFIJO_CLAVE = "ed25519:";
export const CLAVE_PUBLICA = /^ed25519:[A-Za-z0-9_-]{43}$/;

/** The public key as the world writes it, from a key object (public or private). */
export function textoClave(k: KeyObject): string {
  const jwk = (k.type === "private" ? createPublicKey(k) : k).export({ format: "jwk" }) as { crv?: string; x?: string };
  if (jwk.crv !== "Ed25519" || !jwk.x) throw new Error("no es una clave Ed25519");
  return `${PREFIJO_CLAVE}${jwk.x}`;
}

/** The public key object behind "ed25519:<43>", or null when the text is not exactly one (never throws). */
export function clavePublica(texto: unknown): KeyObject | null {
  if (typeof texto !== "string" || !CLAVE_PUBLICA.test(texto)) return null;
  const x = texto.slice(PREFIJO_CLAVE.length);
  if (Buffer.from(x, "base64url").length !== 32 || Buffer.from(x, "base64url").toString("base64url") !== x) return null;
  try { return createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x }, format: "jwk" }); } catch { return null; }
}

/** A new pair: the private key as PKCS#8 PEM (for the agent's file) and the public one as the world writes it. */
export function nuevaPareja(): { privadaPem: string; publica: string } {
  const { privateKey } = generateKeyPairSync("ed25519");
  return { privadaPem: privateKey.export({ format: "pem", type: "pkcs8" }) as string, publica: textoClave(privateKey) };
}

/** The private key from its PEM file's text (throws with a Spanish message when it is not an Ed25519 private key). */
export function clavePrivada(pem: string): KeyObject {
  let k: KeyObject;
  try { k = createPrivateKey(pem); } catch { throw new Error("ese fichero no es una clave privada (PEM PKCS#8)"); }
  if (k.asymmetricKeyType !== "ed25519") throw new Error("la clave no es Ed25519");
  return k;
}

/** An a2 ticket for entering `mundo` (its host, identidad.ts mundoDeUrl) as agent `id`, made now: one per connection. */
export function firmarBillete(o: { id: string; privada: KeyObject; mundo: string; ahora?: number; nonce?: string }): string {
  if (!AGENTE_ID.test(o.id)) throw new Error(`id de agente «${o.id}» no vale (2–24: a-z, 0-9 y guion, empieza por letra)`);
  const ms = Math.floor(o.ahora ?? Date.now()), nonce = o.nonce ?? randomBytes(16).toString("base64url");
  const firma = sign(null, Buffer.from(mensajeAgente(o.mundo, o.id, ms, nonce)), o.privada).toString("base64url");
  return `a2.${o.id}.${ms}.${nonce}.${firma}`;
}

/** Does `firma` (base64url) sign `mensaje` with this public key? Never throws. */
export function firmaValida(publica: KeyObject, mensaje: string, firma: string): boolean {
  try { return verify(null, Buffer.from(mensaje), publica, Buffer.from(firma, "base64url")); } catch { return false; }
}
