// pase-org-clave (ia-organizacion, Node only): the key way of pase-org.ts with the agent's private key as a node:crypto
// KeyObject. Kept apart so pase-org.ts has no `node:` import and the token way bundles for any runtime (M1).
import { sign } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { pedirPaseFirmado } from "./pase-org.ts";
import type { PedirPase } from "./pase-org.ts";

/** POST /api/agents/pass signed with `privada` (Ed25519 over the ASCII line, base64url). */
export function pedirPaseHttp(o: {
  numiniaUrl: string; org: string; agente: string; privada: KeyObject; ahora?: () => number; fetcher?: typeof fetch;
}): PedirPase {
  const { privada, ...resto } = o;
  return pedirPaseFirmado({ ...resto, firmar: (linea) => sign(null, Buffer.from(linea, "ascii"), privada).toString("base64url") });
}
