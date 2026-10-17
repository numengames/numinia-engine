// bienes — checking a receipt anywhere (N10): in the page, in an agent, in a test. The same rules as the server's
// packages/server/src/recibos.ts leerRecibo (shape, canonical JSON, Ed25519 by the key written inside), with WebCrypto
// (`crypto.subtle`, Ed25519: Chrome 137+, Firefox 129+, Safari 17+, Node 22+) so the page needs no server to say whether
// a receipt is real. Whether the signer is a world you trust is a separate question: `nuestro` compares it with the key
// this world signs with (the `inventario` event's `emisor`).
export type ReciboPagina = { v: 1; tipo: "bien"; id: string; objeto: { id: string; nombre: string; descripcion: string; modelo: string; licencia: string }; dueno: string; mundo: string; mision: string; instante: string; emisor: string };
export type Comprobado = { ok: true; recibo: ReciboPagina } | { ok: false; motivo: string };
export const RECIBO_MAX = 1400;

/** JSON with keys sorted at every level and no spaces (the receipts' canonical form; same as recibos.ts canonico). */
export function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
const deB64 = (s: string): Uint8Array => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const t = (v: unknown, max: number): boolean => typeof v === "string" && v.length <= max;
function forma(v: unknown): v is ReciboPagina {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>, o = r.objeto as Record<string, unknown> | undefined;
  return r.v === 1 && r.tipo === "bien" && typeof r.id === "string" && /^[0-9a-f]{24}$/.test(r.id) && t(r.dueno, 64) && t(r.mundo, 120) && t(r.mision, 64) && t(r.instante, 40) && typeof r.emisor === "string" && /^ed25519:[A-Za-z0-9_-]{43}$/.test(r.emisor)
    && !!o && typeof o === "object" && t(o.id, 64) && t(o.nombre, 120) && t(o.descripcion, 400) && t(o.modelo, 64) && t(o.licencia, 64);
}

/** Is this receipt real? Never throws; `sutil` is for tests (defaults to globalThis.crypto.subtle). */
export async function comprobar(token: string, sutil: SubtleCrypto | null = globalThis.crypto?.subtle ?? null): Promise<Comprobado> {
  if (typeof token !== "string" || !token.startsWith("nb1.")) return { ok: false, motivo: "no es un recibo de Numinia (empieza por «nb1.»)" };
  if (token.length > RECIBO_MAX) return { ok: false, motivo: "demasiado largo" };
  const p = token.split(".");
  if (p.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(p[1]) || !/^[A-Za-z0-9_-]{86}$/.test(p[2])) return { ok: false, motivo: "recibo roto (faltan partes)" };
  let json = "", r: unknown;
  try { json = new TextDecoder("utf-8", { fatal: true }).decode(deB64(p[1])); r = JSON.parse(json); } catch { return { ok: false, motivo: "recibo roto (no se lee)" }; }
  if (!forma(r)) return { ok: false, motivo: "recibo con campos que no son los de un bien" };
  if (canonico(r) !== json) return { ok: false, motivo: "recibo no canónico (alguien lo reescribió)" };
  if (!sutil) return { ok: false, motivo: "este navegador no sabe comprobar firmas Ed25519" };
  try {
    const k = await sutil.importKey("raw", deB64(r.emisor.slice(8)), { name: "Ed25519" }, false, ["verify"]);
    const bien = await sutil.verify({ name: "Ed25519" }, k, deB64(p[2]), new TextEncoder().encode(`${p[0]}.${p[1]}`));
    return bien ? { ok: true, recibo: r } : { ok: false, motivo: "la firma no cuadra: el recibo se cambió o no lo firmó ese mundo" };
  } catch { return { ok: false, motivo: "este navegador no sabe comprobar firmas Ed25519" }; }
}
