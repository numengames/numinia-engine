// The server's secret and what it is for: signing text (QR URLs, tokens) so nobody can forge them.
import { createHmac } from "node:crypto";

export const MIN_SECRET = 16;
/** Shortest administration code the engine takes (/mundo, /dueño): the fleet's machines make 12 or 16 hex
 * (numinia-assets reconcile.py), the bare installer 48. Shorter = no administration. */
export const ADMIN_MIN = 12;

/** HMAC-SHA256 of the text, first 24 hex characters; always "" when the secret is missing or too short. */
export function signer(secret: string | undefined): (text: string) => string {
  if (!secret || secret.length < MIN_SECRET) return () => "";
  return (text) => createHmac("sha256", secret).update(text).digest("hex").slice(0, 24);
}
