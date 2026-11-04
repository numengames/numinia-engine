// espejo — server part (mundo-hermes, v1). The server owns the mirror: the outside source (through the seam `enlace`, which the local
// link of packages/server hangs its socket on) publishes alta / cambio / baja / lote; every thing is checked against the world's
// espejo.json (its zones, its function switches) and, if it passes, put in the world with `at` and its card. A thing of a function
// that is switched OFF is rejected and nothing is put. The same file decides what is on, so the link can tell the source
// (`hola.funciones`) what to publish and what not to even ask Hermes for. Without the file this part is inert.
// A package cannot import features/, so the seam is hung on the part itself (`enlace`, as `funciones` does) and the server finds it in the list of parts.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi, ServerPart } from "../../packages/feature/src/index.ts";
import { espejo as decl, ALCANCE_M, CADUCA_S, PETICIONES_MAX, PETICIONES_POR_PERSONA, RADIO_USO_M } from "./feature.ts";
import { LIMITES, SOLO_LEER, VERBOS, funcionesEncendidas, leerObjeto, limpiar, tiposEncendidos } from "./esquema.ts";
import type { Espejo, Estado, Funcion, Objeto, Seguridad, Tipo, Verbo } from "./esquema.ts";

/** The key of a thing in the shared state: «<tipo>/<id>» (≤ 11 + 1 + 32 bytes, inside the engine's 64). */
export const claveDe = (tipo: string, id: string): string => `${tipo}/${id}`;

/** What the outside source may do through the seam. Every method returns a result that says why (never throws); texts are untrusted. */
export type Resultado = { ok: true; puestas?: number; quitadas?: number } | { ok: false; motivo: string; problemas?: { path: string; message: string }[] };
/** A request on its way out: the server forwards it and the source answers with `resultado(id, …)` (or it expires). */
export type Peticion = { id: string; objeto: string; verbo: Verbo; seguridad: Seguridad; quien: { entidad: number; id: string; nombre: string }; caduca: number };
export type EnlaceEspejo = {
  /** The functions that are on, in F0 order: what the engine tells the source in `hola.funciones`. [] when the mirror is off. */
  funciones(): Funcion[];
  /** The mirror's own config (null = this world has no espejo.json or it is off). */
  config(): Espejo | null;
  alta(objeto: unknown): Resultado;
  cambio(objeto: unknown): Resultado;
  baja(ref: { tipo: string; id: string }): Resultado;
  /** The full list again (on connecting, and after a reconnection): replaces EVERYTHING the source had published. */
  lote(objetos: unknown[]): Resultado;
  /** The source came or went: told to every page; while it is away, requests are refused. */
  conectada(si: boolean): void;
  /** The source answers a request it was sent. `false` = nobody was waiting for it (unknown or expired id). */
  resultado(peticion: string, ok: boolean, texto: string): boolean;
  /** Where requests go: the link sets one function; none = no source, so every `pedir` is refused with a reason. */
  alPedir(fn: ((p: Peticion) => void) | null): void;
  /** For tests and the link's pulse: how many requests wait. */
  esperando(): number;
};
export type ParteConEspejo = ServerPart & { enlace: EnlaceEspejo };
export const conEspejo = (p: ServerPart): p is ParteConEspejo => p.feature.id === "espejo" && typeof (p as Partial<ParteConEspejo>).enlace?.alta === "function";

export type OpcionesEspejo = { espejo?: Espejo | null };

const TEXTO_ESTADO: Record<Estado, string> = { activo: "activo", programado: "programado", pausado: "en pausa", fallo: "con fallo", apagado: "apagado", desconocido: "sin estado conocido" };
const minuscula = (t: string): string => (t ? t[0].toLowerCase() + t.slice(1) : t);

export function crearEspejo(opts: OpcionesEspejo = {}): ParteConEspejo {
  const cfg = opts.espejo && opts.espejo.activa ? opts.espejo : null;
  const enlace: Partial<EnlaceEspejo> = {};
  const parte = serverPart(decl, (api: ServerApi) => {
    // ---- inert without a (valid, active) espejo.json: the seam still answers, saying why, so a source that connects anyway is told ----
    const apagado = (): Resultado => ({ ok: false, motivo: "este mundo no tiene el espejo encendido (entorno/espejo.json)" });
    if (!cfg) {
      Object.assign(enlace, { funciones: () => [], config: () => null, alta: apagado, cambio: apagado, baja: apagado, lote: apagado, conectada: () => {}, resultado: () => false, alPedir: () => {}, esperando: () => 0 } satisfies EnlaceEspejo);
      return;
    }
    const encendidos = new Set<string>(tiposEncendidos(cfg));
    const puestas = new Map<string, Objeto>(); // key → what the source published (the truth is outside; this is only what we put)
    const lugar = (o: Objeto) => ({ at: { x: o.x, z: o.z } });
    const valor = (o: Objeto): Msg => ({ titulo: o.titulo, subtitulo: o.subtitulo, estado: o.estado, zona: o.zona, x: o.x, z: o.z, luz: o.luz, acciones: o.acciones.join(" ") });
    const cercaDe = (o: Objeto) => ({ near: { x: o.x, z: o.z }, radius: ALCANCE_M });

    /** Check one thing against the world's file AND its switch; return it or why not. Off-switch rejects: nothing is placed. */
    const admitir = (crudo: unknown, path = "objeto"): { ok: true; o: Objeto } | { ok: false; r: Resultado } => {
      const l = leerObjeto(crudo, cfg, path);
      if (!l.ok) return { ok: false, r: { ok: false, motivo: `${l.issues[0].path}: ${l.issues[0].message}`, problemas: l.issues } };
      if (!encendidos.has(l.value.tipo)) return { ok: false, r: { ok: false, motivo: `la función de «${l.value.tipo}» está apagada en este mundo (entorno/espejo.json → funciones)`, problemas: [{ path: `${path}.tipo`, message: "función apagada" }] } };
      return { ok: true, o: l.value };
    };
    const poner = (o: Objeto): boolean => {
      const k = claveDe(o.tipo, o.id);
      if (!api.state.set(k, valor(o), lugar(o))) return false;
      puestas.set(k, o);
      return true;
    };
    const decirCambio = (antes: Objeto | undefined, o: Objeto) => {
      if (antes && antes.estado === o.estado && antes.titulo === o.titulo) return; // only a real change is spoken
      const texto = limpiar(`${antes ? "" : "Nuevo: "}${o.tipo === "cron" ? "Tarea" : minuscula(o.tipo)} «${o.titulo}»: ${TEXTO_ESTADO[o.estado]}`, 160);
      api.emit("cambiado", { objeto: claveDe(o.tipo, o.id), texto }, cercaDe(o));
    };
    const quitar = (k: string): boolean => {
      if (!puestas.delete(k)) return false;
      api.state.delete(k);
      return true;
    };

    const e: EnlaceEspejo = {
      funciones: () => funcionesEncendidas(cfg),
      config: () => cfg,
      alta(crudo) {
        const a = admitir(crudo); if (!a.ok) return a.r;
        if (!puestas.has(claveDe(a.o.tipo, a.o.id)) && [...puestas.values()].filter((x) => x.zona === a.o.zona).length >= LIMITES.objetosPorZona) return { ok: false, motivo: `la zona «${a.o.zona}» ya tiene ${LIMITES.objetosPorZona} cosas (el tope): quite alguna o pagine en la fuente` };
        const antes = puestas.get(claveDe(a.o.tipo, a.o.id));
        if (!poner(a.o)) return { ok: false, motivo: "el servidor no pudo poner la cosa (más en su registro)" };
        decirCambio(antes, a.o);
        return { ok: true, puestas: 1 };
      },
      cambio(crudo) {
        const a = admitir(crudo); if (!a.ok) return a.r;
        const k = claveDe(a.o.tipo, a.o.id), antes = puestas.get(k);
        if (!antes) return { ok: false, motivo: `no hay ninguna cosa «${k}» que cambiar (use alta o lote primero)` };
        if (!poner(a.o)) return { ok: false, motivo: "el servidor no pudo poner la cosa (más en su registro)" };
        decirCambio(antes, a.o);
        return { ok: true, puestas: 1 };
      },
      baja(ref) {
        const t = String(ref?.tipo ?? ""), id = String(ref?.id ?? "");
        if (!quitar(claveDe(t, id))) return { ok: false, motivo: `no hay ninguna cosa «${limpiar(claveDe(t, id), 48)}» que quitar` };
        return { ok: true, quitadas: 1 };
      },
      lote(objetos) {
        if (!Array.isArray(objetos)) return { ok: false, motivo: "un lote es una lista de cosas" };
        if (objetos.length > LIMITES.objetosPorLote) return { ok: false, motivo: `un lote lleva como mucho ${LIMITES.objetosPorLote} cosas (lleva ${objetos.length}); mande menos o pagine` };
        // all or nothing for the CHECK (one bad thing says which, and the world keeps what it had); then replace everything
        const nuevos: Objeto[] = [], problemas: { path: string; message: string }[] = [], vistos = new Set<string>(), porZona = new Map<string, number>();
        objetos.forEach((c, i) => {
          const a = admitir(c, `lote[${i}]`);
          if (!a.ok) { problemas.push(...(a.r.ok ? [] : a.r.problemas ?? [{ path: `lote[${i}]`, message: a.r.motivo }])); return; }
          const k = claveDe(a.o.tipo, a.o.id);
          if (vistos.has(k)) { problemas.push({ path: `lote[${i}]`, message: `«${k}» está repetida en el lote` }); return; }
          vistos.add(k);
          const n = (porZona.get(a.o.zona) ?? 0) + 1; porZona.set(a.o.zona, n);
          if (n > LIMITES.objetosPorZona) { problemas.push({ path: `lote[${i}]`, message: `la zona «${a.o.zona}» pasa de ${LIMITES.objetosPorZona} cosas` }); return; }
          nuevos.push(a.o);
        });
        if (problemas.length) return { ok: false, motivo: `${problemas[0].path}: ${problemas[0].message}${problemas.length > 1 ? ` (y ${problemas.length - 1} más)` : ""}`, problemas };
        let quitadas = 0;
        for (const k of [...puestas.keys()]) if (!vistos.has(k)) { quitar(k); quitadas++; }
        let n = 0;
        for (const o of nuevos) { const antes = puestas.get(claveDe(o.tipo, o.id)); if (poner(o)) { n++; if (antes) decirCambio(antes, o); } }
        return { ok: true, puestas: n, quitadas };
      },
      conectada: () => {}, // story 5 (the link) fills these three in; kept on the seam so story 3's tests can drive the same API
      resultado: () => false,
      alPedir: () => {},
      esperando: () => 0,
    };
    Object.assign(enlace, e);
    api.log(`espejo: encendido (${funcionesEncendidas(cfg).join(", ") || "ninguna función"}; ${cfg.zonas.length} zona(s))`);
  });
  return Object.assign(parte, { enlace: enlace as EnlaceEspejo });
}

/** Re-exports the tests and the link use. */
export { CADUCA_S, PETICIONES_MAX, PETICIONES_POR_PERSONA, RADIO_USO_M, SOLO_LEER, VERBOS };
export type { Tipo };
export default crearEspejo();
