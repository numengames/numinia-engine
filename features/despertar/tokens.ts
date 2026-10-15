// despertar — signed tokens. token = "<id>.<24 hex>", where the hex is the engine's api.sign(id) (HMAC with the
// server secret, env MOTOR_SECRET; never in the repository). Pure functions: the signer is passed in.
export type Punto = { id: string; nombre: string; x: number; z: number; texto: string; ms: number };
export type Sign = (text: string) => string;

/** The token for a point; "" when the server has no secret. */
export const firmar = (sign: Sign, id: string): string => { const s = sign(id); return s ? `${id}.${s}` : ""; };

/** The point id inside a valid token, or null (forged, malformed, wrong secret, no secret). */
export function verificar(sign: Sign, token: string): string | null {
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const want = firmar(sign, token.slice(0, i));
  if (!want || want.length !== token.length) return null;
  let diff = 0;
  for (let k = 0; k < want.length; k++) diff |= want.charCodeAt(k) ^ token.charCodeAt(k); // no early exit
  return diff === 0 ? token.slice(0, i) : null;
}

/** Checks the contents of enlaces.json. Returns the points or the list of problems (never throws). */
export function leerPuntos(raw: unknown): { ok: true; puntos: Punto[] } | { ok: false; problemas: string[] } {
  const p: string[] = [], out: Punto[] = [];
  const lista = (raw as { puntos?: unknown })?.puntos;
  if ((raw as { schema?: unknown })?.schema !== "numinia-engine/enlaces@1") p.push("schema: debe ser 'numinia-engine/enlaces@1'");
  if (!Array.isArray(lista)) p.push("puntos: debe ser una lista");
  else lista.forEach((q: Record<string, unknown>, i) => {
    const w = `puntos[${i}]`;
    if (typeof q?.id !== "string" || !/^[a-z0-9_-]{1,32}$/.test(q.id)) p.push(`${w}.id: 1-32 caracteres a-z 0-9 _ -`);
    if (typeof q?.nombre !== "string" || !q.nombre) p.push(`${w}.nombre: texto no vacío`);
    if (typeof q?.texto !== "string" || !q.texto || new TextEncoder().encode(q.texto).length > 96) p.push(`${w}.texto: 1-96 bytes`);
    for (const k of ["x", "z"]) if (typeof q?.[k] !== "number" || Math.abs(q[k] as number) > 2000) p.push(`${w}.${k}: número entre -2000 y 2000`);
    if (!Number.isInteger(q?.ms) || (q.ms as number) < 500 || (q.ms as number) > 60000) p.push(`${w}.ms: entero entre 500 y 60000`);
    if (out.some((o) => o.id === q?.id)) p.push(`${w}.id: repetido`);
    out.push(q as unknown as Punto);
  });
  return p.length ? { ok: false, problemas: p } : { ok: true, puntos: out };
}
