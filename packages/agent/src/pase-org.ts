// pase-org (ia-organizacion): how an organization's AI asks numinia.com for its world pass. The AI belongs to an organization
// of numinia.com, not to a world: every ~8 minutes the bridge signs a short request with the agent's own key and numinia.com
// answers a pass (10 min, Ed25519 JWS, pase.ts) for the world named in `aud`, or says why not («apagada» = switched off).
//   POST {NUMINIA_URL}/api/agents/pass   body {org, agent, aud, t, sig}   -> {pass, exp} | {error, texto}
//   sig = Ed25519 over the ASCII bytes `numinia-agent-pass:<org>:<agent>:<aud>:<t>`   (t = seconds; numinia.com accepts ± 60 s)
// TOKEN WAY (corte 2): instead of signing, the bridge sends the agent's access token (`ntk_` + 43 base64url, shown once by the panel):
//   POST {NUMINIA_URL}/api/agents/pass   Authorization: Bearer <token>   body {org, agent, aud}   -> {pass, exp} | {error, texto}
//   Same answers as the key way; a 401 there means «token wrong or renewed» and is FINAL (motivo "token"). The token is never
//   written anywhere (not in logs, errors or texts from numinia.com: an echoed copy is scrubbed).
// The fetcher is injected (`PedirPase`) so the bridge is tested without a network; `pedirPaseHttp` is the real one.
import { sign } from "node:crypto";
import type { KeyObject } from "node:crypto";

export const PREFIJO_PASE = "numinia-agent-pass";
export const PEDIR_PASE_MS = 8000;            // how long the request may take before the bridge gives up and tries again
export type RespuestaPase =
  | { ok: true; pase: string; exp: number }   // exp: seconds since epoch, as in the pass
  | { ok: false; motivo: "apagada" | "rechazado" | "red" | "token"; texto: string };
/** Asks for a pass to enter the world `aud` (its id in numinia.com). Never throws. */
export type PedirPase = (aud: string) => Promise<RespuestaPase>;

/** The exact bytes the agent signs (ASCII). */
export const mensajePase = (org: string, agente: string, aud: string, t: number): string => `${PREFIJO_PASE}:${org}:${agente}:${aud}:${t}`;

export const FORMA_TOKEN = /^ntk_[A-Za-z0-9_-]{43}$/;

/** One POST to /api/agents/pass and the mapping of its answer; `secreto` (the token, if any) is scrubbed from every text. */
async function postPase(f: typeof fetch, base: string, headers: Record<string, string>, body: Record<string, unknown>, tokenFinal: boolean, secreto?: string): Promise<RespuestaPase> {
  const limpio = (x: string): string => (secreto ? x.split(secreto).join("«token»") : x);
  let r: Response, j: unknown;
  try {
    r = await f(`${base}/api/agents/pass`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(PEDIR_PASE_MS) });
    j = await r.json().catch(() => null);
  } catch (e) { return { ok: false, motivo: "red", texto: limpio(`no llego a numinia.com (${(e as Error).name === "TimeoutError" ? "tarda demasiado" : (e as Error).message})`) }; }
  const d = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
  if (r.ok && typeof d.pass === "string" && d.pass.length <= 4096 && typeof d.exp === "number" && Number.isFinite(d.exp)) return { ok: true, pase: d.pass, exp: d.exp };
  const texto = limpio(typeof d.texto === "string" ? d.texto.slice(0, 300) : `numinia.com contestó ${r.status}`);
  if (tokenFinal && r.status === 401) return { ok: false, motivo: "token", texto };
  return { ok: false, motivo: d.error === "apagada" ? "apagada" : "rechazado", texto };
}

export function pedirPaseHttp(o: {
  numiniaUrl: string; org: string; agente: string; privada: KeyObject; ahora?: () => number; fetcher?: typeof fetch;
}): PedirPase {
  const ahora = o.ahora ?? Date.now, f = o.fetcher ?? fetch;
  const base = o.numiniaUrl.replace(/\/+$/, "");
  return async (aud) => {
    const t = Math.floor(ahora() / 1000);
    const sig = sign(null, Buffer.from(mensajePase(o.org, o.agente, aud, t), "ascii"), o.privada).toString("base64url");
    return postPase(f, base, {}, { org: o.org, agent: o.agente, aud, t, sig }, false);
  };
}

/** Token way. Throws (without echoing the token) if the token does not have the right shape: no network call is made. */
export function pedirPaseToken(o: { numiniaUrl: string; org: string; agente: string; token: string; fetcher?: typeof fetch }): PedirPase {
  if (!FORMA_TOKEN.test(o.token)) throw new Error("AGENTE_TOKEN no tiene la forma de un token de acceso (ntk_ y 43 caracteres); cópialo entero del panel «Agentes» de numinia.com");
  const f = o.fetcher ?? fetch, base = o.numiniaUrl.replace(/\/+$/, ""), token = o.token;
  return (aud) => postPase(f, base, { authorization: `Bearer ${token}` }, { org: o.org, agent: o.agente, aud }, true, token);
}

/** The `state` inside our own pass (read, not verified: the world verifies it). null when it is not an AI's pass. */
export function estadoDelPase(pase: string): "activa" | "dormida" | null {
  try {
    const p = JSON.parse(Buffer.from(pase.split(".")[1] ?? "", "base64url").toString("utf8")) as { state?: unknown };
    return p.state === "activa" || p.state === "dormida" ? p.state : null;
  } catch { return null; }
}
