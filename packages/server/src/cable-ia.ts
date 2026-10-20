// cable-ia — plugs the world's AI into the cable's «Decirlo» (D-041, historia D «cable sin JSON»). It reuses the SAME
// brain and the SAME key as the inhabitants (packages/agent/src/cerebro.ts, CEREBRO_CLAVE / ANTHROPIC_API_KEY,
// CEREBRO_MODELO): no second place for a key. The key is read here, on the server, and lives only in the closure of the
// brain; features/disparadores gets a function `pensar` and never sees it; no message, state, log line or error carries it.
//   CEREBRO_CLAVE|ANTHROPIC_API_KEY  the provider key (installed: cerebro.env, made by `instalar-motor.sh --clave-ia`)
//   CEREBRO_MODELO                   the model · CABLE_DIA_MAX asks a day for the whole world (100) · CABLE_MINUTO asks a minute per person (3)
//   CEREBRO_ECO=1                    QA only (like the inhabitants'): no provider, no key. With CABLE_ECO_RESPUESTAS=<file.json>
//                                    ({"<frase>": <input of proponer_cable>}) the echo brain answers those sentences; any other gets no cable.
import { readFileSync } from "node:fs";
import { cerebroClaude, cerebroEco } from "../../agent/src/cerebro.ts";
import type { Cerebro } from "../../agent/src/cerebro.ts";

type Pedido = { sistema: string; usuario: string; herramienta: { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean } } };
export type Pensar = (p: Pedido, signal?: AbortSignal) => Promise<Record<string, unknown> | null>;

/** The brain → the one closed answer (the tool's input) or null when it called no tool. */
export const pensarConCerebro = (c: Cerebro): Pensar => async (p, signal) => {
  const r = await c.pensar({ sistema: p.sistema, mensajes: [{ role: "user", content: p.usuario }], herramientas: [p.herramienta], forzar: p.herramienta.name }, signal);
  return r.acciones.find((a) => a.nombre === p.herramienta.name)?.entrada ?? null;
};

export function pensadorDeCable(env: NodeJS.ProcessEnv, log: (l: string) => void, o: { fetch?: typeof fetch } = {}): { pensar: Pensar | null; alDia: number; porPersonaMinuto: number } {
  const topes = { alDia: Number(env.CABLE_DIA_MAX ?? 100) || 100, porPersonaMinuto: Number(env.CABLE_MINUTO ?? 3) || 3 };
  if (env.CEREBRO_ECO === "1") {
    let guion: Record<string, Record<string, unknown>> = {};
    if (env.CABLE_ECO_RESPUESTAS) { try { guion = JSON.parse(readFileSync(env.CABLE_ECO_RESPUESTAS, "utf8")); } catch (e) { log(`[cable] CABLE_ECO_RESPUESTAS no se lee: ${(e as Error).message}`); } }
    const eco = cerebroEco(), base = pensarConCerebro(eco);
    log("[cable] «Decirlo» con el cerebro eco (solo para pruebas: ninguna IA de verdad)");
    return { ...topes, pensar: async (p, signal) => {
      const frase = /<frase>([\s\S]*)<\/frase>/.exec(p.usuario)?.[1]?.trim() ?? "";
      return Object.prototype.hasOwnProperty.call(guion, frase) ? guion[frase]! : base(p, signal);
    } };
  }
  const clave = env.CEREBRO_CLAVE ?? env.ANTHROPIC_API_KEY ?? "";
  if (clave.length < 20) { log("[cable] «Decirlo» apagado: sin clave de IA (CEREBRO_CLAVE)"); return { ...topes, pensar: null }; }
  try {
    const c = cerebroClaude({ clave, modelo: env.CEREBRO_MODELO || undefined, fetch: o.fetch, maxTokens: 900 });
    log(`[cable] «Decirlo» con ${c.nombre} (tope ${topes.alDia} al día, ${topes.porPersonaMinuto} por minuto y persona)`);
    const pensar = pensarConCerebro(c);
    // belt and braces: whatever goes wrong, the error that leaves here never carries the key (the log line of the piece prints it)
    return { ...topes, pensar: async (p, signal) => { try { return await pensar(p, signal); } catch (e) { throw new Error(String((e as Error)?.message ?? "error").split(clave).join("[clave]").slice(0, 120)); } } };
  } catch (e) { log(`[cable] «Decirlo» apagado: ${(e as Error).message}`); return { ...topes, pensar: null }; }
}
