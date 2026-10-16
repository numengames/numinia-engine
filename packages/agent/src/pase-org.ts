// pase-org (ia-organizacion): how an organization's AI asks numinia.com for its world pass. The AI belongs to an organization
// of numinia.com, not to a world: every ~8 minutes the bridge signs a short request with the agent's own key and numinia.com
// answers a pass (10 min, Ed25519 JWS, pase.ts) for the world named in `aud`, or says why not («apagada» = switched off).
//   POST {NUMINIA_URL}/api/agents/pass   body {org, agent, aud, t, sig}   -> {pass, exp} | {error, texto}
//   sig = Ed25519 over the ASCII bytes `numinia-agent-pass:<org>:<agent>:<aud>:<t>`   (t = seconds; numinia.com accepts ± 60 s)
// The fetcher is injected (`PedirPase`) so the bridge is tested without a network; `pedirPaseHttp` is the real one.
import { sign } from "node:crypto";
import type { KeyObject } from "node:crypto";

export const PREFIJO_PASE = "numinia-agent-pass";
export const PEDIR_PASE_MS = 8000;            // how long the request may take before the bridge gives up and tries again
export type RespuestaPase =
  | { ok: true; pase: string; exp: number }   // exp: seconds since epoch, as in the pass
  | { ok: false; motivo: "apagada" | "rechazado" | "red"; texto: string };
/** Asks for a pass to enter the world `aud` (its id in numinia.com). Never throws. */
export type PedirPase = (aud: string) => Promise<RespuestaPase>;

/** The exact bytes the agent signs (ASCII). */
export const mensajePase = (org: string, agente: string, aud: string, t: number): string => `${PREFIJO_PASE}:${org}:${agente}:${aud}:${t}`;

export function pedirPaseHttp(o: {
  numiniaUrl: string; org: string; agente: string; privada: KeyObject; ahora?: () => number; fetcher?: typeof fetch;
}): PedirPase {
  const ahora = o.ahora ?? Date.now, f = o.fetcher ?? fetch;
  const base = o.numiniaUrl.replace(/\/+$/, "");
  return async (aud) => {
    const t = Math.floor(ahora() / 1000);
    const sig = sign(null, Buffer.from(mensajePase(o.org, o.agente, aud, t), "ascii"), o.privada).toString("base64url");
    let r: Response, j: unknown;
    try {
      r = await f(`${base}/api/agents/pass`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ org: o.org, agent: o.agente, aud, t, sig }), signal: AbortSignal.timeout(PEDIR_PASE_MS) });
      j = await r.json().catch(() => null);
    } catch (e) { return { ok: false, motivo: "red", texto: `no llego a numinia.com (${(e as Error).name === "TimeoutError" ? "tarda demasiado" : (e as Error).message})` }; }
    const d = (j && typeof j === "object" ? j : {}) as Record<string, unknown>;
    if (r.ok && typeof d.pass === "string" && d.pass.length <= 4096 && typeof d.exp === "number" && Number.isFinite(d.exp)) return { ok: true, pase: d.pass, exp: d.exp };
    const texto = typeof d.texto === "string" ? d.texto.slice(0, 300) : `numinia.com contestó ${r.status}`;
    return { ok: false, motivo: d.error === "apagada" ? "apagada" : "rechazado", texto };
  };
}

/** The `state` inside our own pass (read, not verified: the world verifies it). null when it is not an AI's pass. */
export function estadoDelPase(pase: string): "activa" | "dormida" | null {
  try {
    const p = JSON.parse(Buffer.from(pase.split(".")[1] ?? "", "base64url").toString("utf8")) as { state?: unknown };
    return p.state === "activa" || p.state === "dormida" ? p.state : null;
  } catch { return null; }
}
