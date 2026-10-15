// chat — what the server does with text people write (J3). Pure functions: tested in test/chat.test.ts.
// Untrusted text: one line, no control characters (C0, DEL, C1), no invisible direction tricks (bidi overrides,
// as in "Trojan Source"), spaces collapsed, trimmed, cut in UTF-8 bytes on a character boundary.
import { TEXTO_MAX } from "./feature.ts";
import type { Rate } from "../../packages/feature/src/index.ts";

const RARO = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const utf8 = new TextEncoder();

/** UTF-8 bytes of a text. */
export const bytesDe = (t: string): number => utf8.encode(t).length;

/** At most `max` UTF-8 bytes, never cutting a character in two. */
export function cortar(t: string, max: number): string {
  if (bytesDe(t) <= max) return t;
  let out = "", n = 0;
  for (const ch of t) { const b = bytesDe(ch); if (n + b > max) break; out += ch; n += b; }
  return out;
}

/** The text as the server publishes it: "" means "nothing to say" (refused). */
export function limpiar(t: string, max = TEXTO_MAX): string {
  const una = String(t ?? "").toWellFormed().replace(RARO, " ").replace(/\s+/g, " ").trim();
  return cortar(una, max).trim();
}

/** A bucket of `burst` tokens refilled at `perSecond`, counted in ticks of the simulation (20 Hz). */
export class Cubo {
  private tokens: number;
  private tick = -1;
  private readonly rate: Rate;
  constructor(rate: Rate) { this.rate = rate; this.tokens = rate.burst; }
  /** Take one token at this tick; false = too fast. */
  tomar(now: number): boolean {
    if (this.tick >= 0) this.tokens = Math.min(this.rate.burst, this.tokens + ((now - this.tick) * this.rate.perSecond) / 20);
    this.tick = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
