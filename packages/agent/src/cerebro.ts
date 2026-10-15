// cerebro (P5a): what lets an inhabitant think with a language model — and nothing more. It is the puente of the
// Hyperfy agent (work/procyon-hyp/bridge/core.mjs: the key kept apart, Claude's native API, a daily cap, the rules of
// the world first and every untrusted text inside ONE <material> block, short replies, gestures from a list) moved
// INTO the inhabitants' service: no HTTP hop, no second server, the key only in this process (D2, D7).
//   - The key comes from the environment (the installer keeps it in /opt/numinia-engine/cerebro.env, 0640, read
//     by systemd); it never reaches a log, an error, the world or git.
//   - The model only PROPOSES: its answer is text plus calls to the tools offered (D4). Policy is code: mente.ts
//     checks every call against the catalog, the world's permission and the caps, then the body does it as a person
//     would, and the server checks it again.
//   - Caps (D8): calls per minute per inhabitant, per person per minute, and per UTC day for the whole service. Over a
//     cap, or with the model down, the inhabitant answers with its script (E0): it never goes silent.
// The echo brain (`cerebroEco`) answers without any provider: tests and light QA never call a model.
export type Rol = "user" | "assistant";
export type Mensaje = { role: Rol; content: string };
export type Herramienta = { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean } };
export type Llamada = { nombre: string; entrada: Record<string, unknown> };
export type Pensado = { texto: string; acciones: Llamada[]; uso: { entrada: number; salida: number; cache: number } };
export type Peticion = { sistema: string; mensajes: Mensaje[]; herramientas: Herramienta[] };

export interface Cerebro {
  readonly nombre: string;  // what the service log says («claude claude-sonnet-5», «eco»); never the key
  pensar(p: Peticion, signal?: AbortSignal): Promise<Pensado>;
}

export const CLAUDE_URL = "https://api.anthropic.com/v1";
export const MODELO_POR_DEFECTO = "claude-sonnet-5";  // overrideable: the installer offers the account's live list
export const MAX_TOKENS = 700;                          // a short reply plus a dozen tool calls
export const ESPERA_MS = 20_000;                        // longer than this, the script answers

/** Claude's Messages API with tools (docs read 2026-10-15: tools = {name, description, input_schema}; the answer is
 * content blocks of type text and tool_use). The rules and the tools are cached (they repeat on every call). */
export function cerebroClaude(o: { clave: string; modelo?: string; url?: string; fetch?: typeof fetch; maxTokens?: number }): Cerebro {
  const modelo = o.modelo || MODELO_POR_DEFECTO, url = (o.url || CLAUDE_URL).replace(/\/+$/, ""), f = o.fetch ?? fetch;
  if (!o.clave || o.clave.length < 20) throw new Error("falta la clave del cerebro (CEREBRO_CLAVE)");
  return {
    nombre: `claude ${modelo}`,
    async pensar(p, signal) {
      const tools = p.herramientas.map((t, i) => (i === p.herramientas.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t));
      const res = await f(`${url}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": o.clave, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: modelo, max_tokens: o.maxTokens ?? MAX_TOKENS, system: [{ type: "text", text: p.sistema, cache_control: { type: "ephemeral" } }], tools, messages: alternar(p.mensajes) }),
        signal,
      });
      if (!res.ok) throw new Error(`el proveedor contestó HTTP ${res.status}`); // never the body: it may echo what we sent
      const data = await res.json() as { content?: { type: string; text?: string; name?: string; input?: unknown }[]; usage?: Record<string, number> };
      const bloques = data.content ?? [];
      const u = data.usage ?? {};
      return {
        texto: bloques.filter((b) => b.type === "text").map((b) => b.text ?? "").join(" ").trim(),
        acciones: bloques.filter((b) => b.type === "tool_use" && typeof b.name === "string").map((b) => ({ nombre: b.name!, entrada: (b.input && typeof b.input === "object" ? b.input : {}) as Record<string, unknown> })),
        uso: { entrada: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), salida: u.output_tokens ?? 0, cache: u.cache_read_input_tokens ?? 0 },
      };
    },
  };
}

/** The API wants turns that alternate and start with a person: merge neighbours with the same role. */
export function alternar(m: readonly Mensaje[]): Mensaje[] {
  const out: Mensaje[] = [];
  for (const x of m) {
    if (!x.content.trim()) continue;
    const last = out[out.length - 1];
    if (last && last.role === x.role) last.content += `\n\n${x.content}`;
    else out.push({ role: x.role, content: x.content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** A brain with no provider, for tests and QA. It reads the last message (after the material) and answers «eco: …»;
 * an `[accion: nombre {json}]` inside it becomes that tool call, so a test can drive any action without a model. */
export function cerebroEco(): Cerebro & { vistas: Peticion[] } {
  const vistas: Peticion[] = [];
  return {
    nombre: "eco", vistas,
    async pensar(p) {
      vistas.push(p);
      const ultimo = p.mensajes[p.mensajes.length - 1]?.content ?? "";
      const pregunta = ultimo.split("</material>").pop()!.trim();
      const acciones: Llamada[] = [];
      for (const m of pregunta.matchAll(/\[accion:\s*([a-z_]+)\s*(\{[^\]]*\})?\s*\]/gi)) {
        let entrada: Record<string, unknown> = {};
        try { entrada = m[2] ? JSON.parse(m[2]) : {}; } catch { /* a broken one stays empty */ }
        acciones.push({ nombre: m[1], entrada });
      }
      return { texto: `eco: ${pregunta.replace(/\[accion:[^\]]*\]/gi, "").trim()}`.slice(0, 300), acciones, uso: { entrada: 0, salida: 0, cache: 0 } };
    },
  };
}

/** Caps on calls (D8). Counts only what was asked of the provider; the script costs nothing. */
export class Topes {
  readonly porMinuto: number; readonly porPersonaMinuto: number; readonly alDia: number;
  readonly uso = { llamadas: 0, entrada: 0, salida: 0, cache: 0, negadas: 0 };
  private dia = ""; private hoy = 0;
  private readonly ventanas = new Map<string, number[]>();
  constructor(o: { porMinuto?: number; porPersonaMinuto?: number; alDia?: number } = {}) {
    this.porMinuto = o.porMinuto ?? 6; this.porPersonaMinuto = o.porPersonaMinuto ?? 3; this.alDia = o.alDia ?? 300;
  }
  /** May `habitante` call the model now for `persona`? If yes, it is counted. `ahora` in ms. */
  pedir(habitante: string, persona: string, ahora = Date.now()): { ok: true } | { ok: false; porque: string } {
    const d = new Date(ahora).toISOString().slice(0, 10);
    if (d !== this.dia) { this.dia = d; this.hoy = 0; }
    const ventana = (k: string, max: number) => {
      const v = (this.ventanas.get(k) ?? []).filter((t) => ahora - t < 60_000);
      this.ventanas.set(k, v);
      return v.length < max ? v : null;
    };
    const no = (porque: string) => { this.uso.negadas++; return { ok: false as const, porque }; };
    if (this.hoy >= this.alDia) return no(`tope del día (${this.alDia} llamadas entre todos)`);
    const h = ventana(`h:${habitante}`, this.porMinuto);
    if (!h) return no(`tope por minuto (${this.porMinuto})`);
    const p = ventana(`p:${habitante}:${persona}`, this.porPersonaMinuto);
    if (!p) return no(`tope por persona (${this.porPersonaMinuto} por minuto)`);
    h.push(ahora); p.push(ahora); this.hoy++; this.uso.llamadas++;
    return { ok: true };
  }
  gastado(u: Pensado["uso"]): void { this.uso.entrada += u.entrada; this.uso.salida += u.salida; this.uso.cache += u.cache; }
  get llamadasHoy(): number { return this.hoy; }
}

/** What goes to the chat: one or two short lines, no links, no markdown, nothing that looks like a tag. */
export function limpiarRespuesta(t: string, max = 190): string {
  let s = String(t).replace(/```[\s\S]*?```/g, " ").replace(/https?:\/\/\S+/g, "").replace(/[*_#`>]+/g, "").replace(/\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\s+/g, " ").trim();
  if (new TextEncoder().encode(s).length > max) {
    const corte = s.slice(0, max).lastIndexOf(". ");
    s = (corte > 60 ? s.slice(0, corte + 1) : s.slice(0, max - 1).trimEnd() + "…");
    while (new TextEncoder().encode(s).length > max) s = s.slice(0, -2) + "…";
  }
  return s;
}
