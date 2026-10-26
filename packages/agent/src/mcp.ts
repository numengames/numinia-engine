// mcp (ADR-080): the small part of the Model Context Protocol an agent's tools need, by hand (no dependency): JSON-RPC
// 2.0 over newline-delimited JSON (stdin → requests, stdout → answers; logs only to stderr). Methods: resources/list + resources/read
// (only when the server was given resources), initialize (echoes
// a protocol version we speak, capabilities {tools: {}}, serverInfo, instructions), notifications/initialized, ping,
// tools/list, tools/call. A tool that fails answers a result with isError: true and a short text — it never crashes
// the server; an unknown tool or bad arguments are JSON-RPC errors (-32602), an unknown method -32601.
import type { Readable, Writable } from "node:stream";

export const VERSIONES_MCP = ["2025-06-18", "2025-03-26", "2024-11-05"] as const; // newest first
export const LINEA_MAX = 1 << 20; // bytes of one request line

type Esquema = { type: "object"; properties: Record<string, Record<string, unknown>>; required?: string[]; additionalProperties?: boolean };
/** A readable thing the server offers besides tools (MCP `resources`): a text with a stable uri. */
export type RecursoMcp = { uri: string; name: string; description: string; mimeType: string; leer: () => Promise<string> | string };
export type HerramientaMcp = {
  name: string; description: string; inputSchema: Esquema;
  ejecutar: (args: Record<string, unknown>) => Promise<string> | string; // throw = an isError result with the message
};

/** Arguments against a tool's schema (the subset we write: number/integer/string/boolean, enum, minimum/maximum,
 * maxLength, required, additionalProperties false). null = fine; otherwise what is wrong, in Spanish. */
export function comprobar(e: Esquema, args: unknown): string | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "los argumentos van en un objeto JSON";
  const a = args as Record<string, unknown>;
  for (const r of e.required ?? []) if (a[r] === undefined) return `falta «${r}»`;
  for (const [k, v] of Object.entries(a)) {
    const p = e.properties[k];
    if (!p) { if (e.additionalProperties === false) return `«${k}» no es un argumento de esta herramienta (son: ${Object.keys(e.properties).join(", ") || "ninguno"})`; continue; }
    if (v === undefined || v === null) continue;
    const t = p.type;
    if ((t === "number" || t === "integer") && (typeof v !== "number" || !Number.isFinite(v) || (t === "integer" && !Number.isInteger(v)))) return `«${k}» tiene que ser un ${t === "integer" ? "entero" : "número"}`;
    if (t === "string" && typeof v !== "string") return `«${k}» tiene que ser un texto`;
    if (t === "boolean" && typeof v !== "boolean") return `«${k}» tiene que ser true o false`;
    if (Array.isArray(p.enum) && !p.enum.includes(v)) return `«${k}» tiene que ser uno de: ${p.enum.join(", ")}`;
    if (typeof v === "number" && typeof p.minimum === "number" && v < p.minimum) return `«${k}» va de ${p.minimum}${typeof p.maximum === "number" ? ` a ${p.maximum}` : " en adelante"}`;
    if (typeof v === "number" && typeof p.maximum === "number" && v > p.maximum) return `«${k}» va hasta ${p.maximum}`;
    if (typeof v === "string" && typeof p.maxLength === "number" && [...v].length > p.maxLength) return `«${k}»: como mucho ${p.maxLength} caracteres`;
  }
  return null;
}

type Peticion = { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
const error = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export class ServidorMcp {
  readonly nombre: string; readonly version: string; readonly instrucciones: string;
  private readonly herramientas: () => readonly HerramientaMcp[];
  private readonly recursos: (() => readonly RecursoMcp[]) | null;
  private readonly log: (l: string) => void;
  constructor(o: { nombre: string; version: string; herramientas: () => readonly HerramientaMcp[]; recursos?: () => readonly RecursoMcp[]; instrucciones?: string; log?: (l: string) => void }) {
    this.nombre = o.nombre; this.version = o.version; this.herramientas = o.herramientas; this.recursos = o.recursos ?? null; this.instrucciones = o.instrucciones ?? "";
    this.log = o.log ?? (() => {});
  }

  /** One parsed message → its answer (null for a notification). Never throws. */
  async atender(m: unknown): Promise<unknown> {
    if (Array.isArray(m)) { const r = (await Promise.all(m.map((x) => this.atender(x)))).filter((x) => x !== null); return r.length ? r : null; }
    if (!m || typeof m !== "object") return error(null, -32600, "petición JSON-RPC no válida");
    const p = m as Peticion, esNotificacion = !("id" in p);
    if (p.jsonrpc !== "2.0" || typeof p.method !== "string") return esNotificacion ? null : error(p.id, -32600, "petición JSON-RPC 2.0 no válida");
    const params = (p.params && typeof p.params === "object" ? p.params : {}) as Record<string, unknown>;
    if (esNotificacion) return null; // notifications/initialized, notifications/cancelled…: nothing to answer
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id: p.id, result });
    switch (p.method) {
      case "initialize": {
        const pedida = String(params.protocolVersion ?? "");
        const version = (VERSIONES_MCP as readonly string[]).includes(pedida) ? pedida : VERSIONES_MCP[0];
        return ok({ protocolVersion: version, capabilities: { tools: {}, ...(this.recursos ? { resources: {} } : {}) }, serverInfo: { name: this.nombre, version: this.version }, ...(this.instrucciones ? { instructions: this.instrucciones } : {}) });
      }
      case "ping": return ok({});
      case "tools/list": return ok({ tools: this.herramientas().map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "resources/list": return this.recursos ? ok({ resources: this.recursos().map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType })) }) : error(p.id, -32601, "este servidor no ofrece recursos");
      case "resources/read": {
        const r = this.recursos?.().find((x) => x.uri === params.uri);
        if (!r) return error(p.id, -32602, `no hay ningún recurso «${String(params.uri).slice(0, 80)}»; resources/list los dice`);
        try { return ok({ contents: [{ uri: r.uri, mimeType: r.mimeType, text: await r.leer() }] }); } catch (e) { return error(p.id, -32603, String((e as Error)?.message ?? e).slice(0, 300)); }
      }
      case "tools/call": {
        const h = this.herramientas().find((x) => x.name === params.name);
        if (!h) return error(p.id, -32602, `no hay ninguna herramienta «${String(params.name).slice(0, 40)}»; tools/list las dice`);
        const args = (params.arguments ?? {}) as Record<string, unknown>;
        const mal = comprobar(h.inputSchema, args);
        if (mal) return ok({ content: [{ type: "text", text: `No lo hago: ${mal}.` }], isError: true });
        try {
          return ok({ content: [{ type: "text", text: await h.ejecutar(args) }] });
        } catch (e) {
          const texto = String((e as Error)?.message ?? e).slice(0, 500);
          if (!(e instanceof ErrorHerramienta)) this.log(`[mcp] ${h.name}: fallo inesperado: ${texto}`);
          return ok({ content: [{ type: "text", text: texto }], isError: true });
        }
      }
      default: return error(p.id, -32601, `método desconocido «${p.method.slice(0, 40)}»`);
    }
  }

  /** Newline-delimited JSON on `entrada`, answers on `salida` (one line each, in the order they finish). */
  escuchar(entrada: Readable, salida: Writable): void {
    let resto = "";
    const escribir = (r: unknown) => { if (r !== null) salida.write(JSON.stringify(r) + "\n"); };
    entrada.setEncoding("utf8");
    entrada.on("data", (trozo: string) => {
      resto += trozo;
      if (resto.length > LINEA_MAX && !resto.includes("\n")) { resto = ""; escribir(error(null, -32700, "línea demasiado larga")); return; }
      let i: number;
      while ((i = resto.indexOf("\n")) >= 0) {
        const linea = resto.slice(0, i).trim(); resto = resto.slice(i + 1);
        if (!linea) continue;
        let m: unknown;
        try { m = JSON.parse(linea); } catch { escribir(error(null, -32700, "eso no es JSON")); continue; }
        void this.atender(m).then(escribir, (e) => this.log(`[mcp] ${String(e)}`));
      }
    });
  }
}

/** A tool's failure that is the world's answer (isError, logged nowhere): «no veo ese objeto», «el mundo no te deja». */
export class ErrorHerramienta extends Error {}
