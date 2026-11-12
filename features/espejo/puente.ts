// puente — the postMessage bridge of the embed mode (mundo-hermes M7), pure: no DOM, no network, no clock of its own. The world page runs inside a sandboxed
// frame of a host app (Hermes Desktop); its parent window is the host's plugin page. Contract (docs/extender/espejo.md), every message `{ v: 1, kind, … }`:
//   parent → world   snapshot { objetos[] }                       ≡ the local link's `lote` (replaces everything published)
//                    event { evento: "alta"|"cambio"|"baja", objeto }  ≡ alta / cambio / baja
//                    event { evento: "resultado", peticion, ok, texto } ≡ resultado (the answer to a `peticion`)
//                    funciones { funciones[] }                    what the source publishes; INFORMATION only: the world's own switches decide, and it
//                                                                 answers `ack { en: "funciones", ignoradas }` with the ones the world has off
//   world → parent   listo · hola { funciones, acciones } · peticion { id, objeto, verbo, seguridad, quien, caduca } · funciones { funciones } ·
//                    ack { en, … } (only when something was left out) · error { en, motivo }
// What is checked here, in this order: the sender is the parent window (`event.source`, never `event.origin`: the parent's origin is unknowable from an opaque
// origin and a frame cannot prove it), a plain object, ≤ 16 KB, `v` is 1, at most RITMO messages a second (burst RAFAGA), the kind is known and its fields have the
// right shape. A message from anyone else is dropped SILENTLY (no answer: nobody learns anything). Everything else that passes is checked AGAIN by the server
// with the same schema as the local link (features/espejo/esquema.ts): this is a courier, not an authority. Authenticity comes from the embed credential
// in the URL fragment (embed-espejo.ts), which the courier sends with every call.
export const MAX_MENSAJE = 16 * 1024, RITMO = 20, RAFAGA = 40, OBJETOS_MAX = 200;
export type Respuesta = { ok: boolean; en?: string; motivo?: string; problemas?: unknown[]; descartadas?: unknown[]; puestas?: number; quitadas?: number };
export type OpcionesPuente = {
  /** The window we answer to (the parent). */
  padre: { postMessage(m: unknown, target: string): void };
  /** The only window whose messages count: `event.source` must be this very object. */
  fuente: unknown;
  /** Hands one link-shaped frame (`{ v: 1, t: "lote", … }`) to the server; resolves with its answer. Never rejects: a network failure is `{ ok: false, motivo }`. */
  enviar(trama: Record<string, unknown>): Promise<Respuesta>;
  reloj?: () => number;
};
const EVENTOS = ["alta", "cambio", "baja", "resultado"] as const;
const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const lista = (x: unknown, n: number, largo: number): x is string[] => Array.isArray(x) && x.length <= n && x.every((t) => typeof t === "string" && t.length > 0 && t.length <= largo);
const partir = (t: unknown): string[] => (typeof t === "string" ? t.split(" ").filter(Boolean) : []);

export function crearPuente(o: OpcionesPuente) {
  const ahora = o.reloj ?? Date.now;
  let fichas = RAFAGA, recarga = ahora(), encendidas: string[] | null = null; // encendidas = what the world said is ON (hola / funciones), null = not yet told
  const stats = { aceptados: 0, descartados: 0, rechazados: 0 };
  const decir = (m: Record<string, unknown>): void => o.padre.postMessage({ v: 1, ...m }, "*");
  const error = (en: string, motivo: string): void => { stats.rechazados++; decir({ kind: "error", en, motivo }); };
  const tras = (en: string, p: Promise<Respuesta>): void => {
    void p.then((r) => {
      if (!r.ok) decir({ kind: "error", en, motivo: String(r.motivo ?? "no"), problemas: (r.problemas ?? []).slice(0, 5) });
      else if (r.descartadas?.length) decir({ kind: "ack", en, puestas: r.puestas ?? 0, quitadas: r.quitadas ?? 0, descartadas: r.descartadas.slice(0, 20) });
    });
  };
  return {
    stats,
    /** The funciones the world told us are on (null until `hola`). */
    encendidas: (): string[] | null => (encendidas ? [...encendidas] : null),
    /** The `message` event of the page's window. */
    alMensaje(ev: { source: unknown; data: unknown }): void {
      if (ev.source !== o.fuente || ev.source === null || ev.source === undefined) { stats.descartados++; return; } // not the parent: silence
      let tam = 0; try { tam = JSON.stringify(ev.data)?.length ?? 0; } catch { return error("embed", "el mensaje no es JSON"); }
      if (tam > MAX_MENSAJE) return error("embed", "mensaje de más de 16 KB");
      const m = ev.data;
      if (!objeto(m)) return error("embed", "un mensaje es un objeto { v: 1, kind, … }");
      if (m.v !== 1) return error("embed", "versión no admitida (se habla la 1)");
      const t = ahora(); fichas = Math.min(RAFAGA, fichas + ((t - recarga) / 1000) * RITMO); recarga = t;
      if (fichas < 1) return error("embed", "demasiado rápido");
      fichas -= 1;
      switch (m.kind) {
        case "snapshot":
          if (!Array.isArray(m.objetos) || m.objetos.length > OBJETOS_MAX) return error("snapshot", `un snapshot lleva { objetos: [...] } de hasta ${OBJETOS_MAX} cosas`);
          stats.aceptados++; return tras("snapshot", o.enviar({ v: 1, t: "lote", objetos: m.objetos }));
        case "event": {
          const e = m.evento;
          if (!(EVENTOS as readonly unknown[]).includes(e)) return error("event", `evento desconocido (son: ${EVENTOS.join(", ")})`);
          if (e === "resultado") {
            if (typeof m.peticion !== "string" || m.peticion.length > 40 || typeof m.ok !== "boolean" || (m.texto !== undefined && typeof m.texto !== "string")) return error("event", "resultado necesita { peticion: texto, ok: true|false, texto }");
            stats.aceptados++; return tras("resultado", o.enviar({ v: 1, t: "resultado", peticion: m.peticion, ok: m.ok, texto: m.texto ?? "" }));
          }
          if (!objeto(m.objeto)) return error("event", "falta `objeto`");
          stats.aceptados++; return tras(String(e), o.enviar({ v: 1, t: e as string, objeto: m.objeto }));
        }
        case "funciones": {
          if (!lista(m.funciones, 16, 24)) return error("funciones", "funciones es una lista de hasta 16 nombres");
          stats.aceptados++;
          const ignoradas = encendidas ? m.funciones.filter((f) => !encendidas!.includes(f)) : [];
          if (ignoradas.length) decir({ kind: "ack", en: "funciones", ignoradas }); // the world's switches decide: naming a function that is off changes nothing
          return;
        }
        default: return error("embed", `tipo desconocido «${String(m.kind).slice(0, 24)}» (son: snapshot, event, funciones)`);
      }
    },
    /** An event the server sent to this page as the bound source (`hola`, `peticion`, `lista`): out to the parent. */
    deMundo(evento: string, m: Record<string, unknown>): void {
      if (evento === "hola") { encendidas = partir(m.funciones); decir({ kind: "hola", funciones: [...encendidas], acciones: { ...Object.fromEntries(partir(m.aprobar).map((v) => [v, "aprobar"])), ...Object.fromEntries(partir(m.confirmar).map((v) => [v, "confirmar"])) } }); }
      else if (evento === "lista") { encendidas = partir(m.funciones); decir({ kind: "funciones", funciones: [...encendidas] }); }
      else if (evento === "peticion") decir({ kind: "peticion", id: String(m.id), objeto: String(m.objeto), verbo: String(m.verbo), seguridad: String(m.seguridad), quien: { id: String(m.quienId), nombre: String(m.quienNombre) }, caduca: Number(m.caduca) });
    },
    error,
    listo: (): void => decir({ kind: "listo" }),
  };
}
