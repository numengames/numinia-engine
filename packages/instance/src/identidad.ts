// identidad (I1): who a guest is, without an account or any personal data. The server hands out a signed
// token; the page keeps it (localStorage) and shows it on the next visit, so the same person gets the same
// guest id (features key inventories and "who claimed what" by it). Pure functions: the signer and the clock
// are passed in. Linking a phone to a PC is NOT here (I2, parked by Pablo on 15-10).
//   token = "g1.<id>.<day issued>.<signature>"   id: 12 characters a-z2-7 · day: days since 1970 (UTC)

export const TOKEN_DAYS = 180;      // a token older than this is not accepted: a new guest id is given
export const RENEW_AFTER_DAYS = 30; // an older (still valid) token is replaced by a fresh one for the same id
export const TOKEN_MAX = 120;
export type Who = { id: string; nombre: string };
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

/** A fresh id from 12 random values in [0, 32) (the server passes crypto randomness). */
export function nuevoId(random: () => number): string {
  const abc = "abcdefghijklmnopqrstuvwxyz234567";
  let s = "";
  for (let i = 0; i < 12; i++) s += abc[Math.floor(random() * 32) & 31];
  return s;
}
