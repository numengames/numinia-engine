// identidad (I1): who a guest is, without an account or any personal data. The server hands out a signed
// token; the page keeps it (localStorage) and shows it on the next visit, so the same person gets the same
// guest id (features key inventories and "who claimed what" by it). Pure functions: the signer and the clock
// are passed in. Linking a phone to a PC is NOT here (I2, parked by Pablo on 15-10).
//   token = "g1.<id>.<day issued>.<signature>"   id: 12 characters a-z2-7 · day: days since 1970 (UTC)

export const TOKEN_DAYS = 180;      // a token older than this is not accepted: a new guest id is given
export const RENEW_AFTER_DAYS = 30; // an older (still valid) token is replaced by a fresh one for the same id
export const TOKEN_MAX = 120;
export type Who = { id: string; nombre: string; ia?: true }; // ia: an AI inhabitant (P4), never a person
type Sign = (text: string) => string;

const ID = /^[a-z2-7]{12}$/;
export const today = (now = Date.now()): number => Math.floor(now / 86_400_000);

/** The default name people see: "Invitado" + the id's last four characters, upper case. */
export const nombreDe = (id: string): string => `Invitado ${id.slice(-4).toUpperCase()}`;

/** A token for this id, issued on `day`; "" when there is no signer. */
export function emitir(sign: Sign, id: string, day: number): string {
  const body = `g1.${id}.${day}`;
  const s = sign(body);
  return s ? `${body}.${s}` : "";
}

/** The id inside a valid, unexpired token, and whether it should be renewed; null otherwise. Never throws. */
export function verificar(sign: Sign, token: string, day: number): { id: string; renovar: boolean } | null {
  if (typeof token !== "string" || token.length > TOKEN_MAX) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "g1" || !ID.test(parts[1]) || !/^\d{1,6}$/.test(parts[2])) return null;
  const issued = Number(parts[2]);
  if (issued > day + 1 || day - issued > TOKEN_DAYS) return null;
  const want = emitir(sign, parts[1], issued);
  if (!want || want.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i); // no early exit
  return diff === 0 ? { id: parts[1], renovar: day - issued > RENEW_AFTER_DAYS } : null;
}

// ---------- P4: agent tickets (an AI inhabitant is a player with an identity that says it is an AI) ----------
// ticket = "a1.<agent id>.<day issued>.<signature>"  agent id: the inhabitant's id in its adventure (habitante@1).
// Signed with a SEPARATE secret (MOTOR_AGENTES_SECRET) that only the engine and the inhabitants' service hold: the
// service can make agent identities, never guest ones; a guest token is never accepted as an agent's and vice versa.
export const AGENTE_ID = /^[a-z][a-z0-9-]{1,23}$/;
export const AGENTE_DAYS = 2;        // a ticket is made at each connection: an old one is not accepted
export const MARCA_IA = " · IA";     // AGW-007: the name everybody sees says it is an AI; put by the server, never by the agent
export type Agente = { id: string; nombre: string; ia: true };

/** An agent ticket for this inhabitant id; "" without a signer or with a malformed id. */
export function emitirAgente(sign: Sign, id: string, day: number): string {
  if (!AGENTE_ID.test(id)) return "";
  const body = `a1.${id}.${day}`;
  const s = sign(body);
  return s ? `${body}.${s}` : "";
}

/** The inhabitant id inside a valid, recent agent ticket; null otherwise. Never throws. */
export function verificarAgente(sign: Sign, token: string, day: number): string | null {
  if (typeof token !== "string" || token.length > TOKEN_MAX) return null;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "a1" || !AGENTE_ID.test(parts[1]) || !/^\d{1,6}$/.test(parts[2])) return null;
  const issued = Number(parts[2]);
  if (issued > day + 1 || day - issued > AGENTE_DAYS) return null;
  const want = emitirAgente(sign, parts[1], issued);
  if (!want || want.length !== token.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0 ? parts[1] : null;
}

// ---------- ADR-080: outside agents (one door: its own Ed25519 key, the world lists its PUBLIC key) ----------
// ticket = "a2.<agent id>.<utc ms>.<nonce>.<signature>"   nonce: 16 random bytes, base64url (22) · signature: Ed25519,
// base64url (86), over mensajeAgente(): a fixed, domain-separated text with the world's name (the host the agent dials,
// «motor.ejemplo.com» or «127.0.0.1:8790»), so a ticket made for one world never opens another. Pure here: the signer
// and the verifier (node:crypto) live with the agent (packages/agent/src/llave.ts) and the server (server/puerta.ts).
export const BILLETE2_MAX = 200;           // characters of an a2 ticket (the identity request carries up to IDENTIDAD_MAX)
export const BILLETE2_VENTANA_MS = 120_000; // a ticket is accepted within ± 2 min of the server's clock, once
export const NONCE = /^[A-Za-z0-9_-]{22}$/, FIRMA = /^[A-Za-z0-9_-]{86}$/;
export type Billete2 = { id: string; ms: number; nonce: string; firma: string };

/** What an outside agent signs to enter one world: never reused for anything else (the first line says what it is). */
export const mensajeAgente = (mundo: string, id: string, ms: number, nonce: string): string =>
  `numinia-engine/agente@1 entrar\nmundo ${mundo.toLowerCase()}\nid ${id}\nms ${ms}\nnonce ${nonce}`;

/** The parts of an a2 ticket, or null when it is not one (shape only: the signature is checked by the server). */
export function leerBillete2(token: string): Billete2 | null {
  if (typeof token !== "string" || token.length > BILLETE2_MAX) return null;
  const p = token.split(".");
  if (p.length !== 5 || p[0] !== "a2" || !AGENTE_ID.test(p[1]) || !/^\d{13}$/.test(p[2]) || !NONCE.test(p[3]) || !FIRMA.test(p[4])) return null;
  return { id: p[1], ms: Number(p[2]), nonce: p[3], firma: p[4] };
}

/** The world's name inside a ws/wss/http(s) URL: its host (and port when it has one), lower case; "" if it is no URL. */
export function mundoDeUrl(url: string): string {
  try { return new URL(url).host.toLowerCase(); } catch { return ""; }
}

/** The identity an inhabitant gets: id "ia-<id>" (never a guest id: those have no dash) and its name + « · IA». */
export const agenteDe = (id: string, nombre: string): Agente => ({ id: `ia-${id}`, nombre: `${nombre}${MARCA_IA}`, ia: true });

/** A fresh id from 12 random values in [0, 32) (the server passes crypto randomness). */
export function nuevoId(random: () => number): string {
  const abc = "abcdefghijklmnopqrstuvwxyz234567";
  let s = "";
  for (let i = 0; i < 12; i++) s += abc[Math.floor(random() * 32) & 31];
  return s;
}
