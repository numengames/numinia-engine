// puerta (numinia-archive ADR-080): the ONE door for an AI that lives outside the engine (Hermes on a PC, on a VPS,
// any brain). The engine never knows where it runs nor which model it uses; it knows three things:
//   1. its PUBLIC key, listed in the world's files: aventura/agentes/<id>.json (agente@1, aventura.ts). The private key
//      never leaves where the agent runs (tools/agente.ts nuevo makes the pair there).
//   2. the tools it uses are a person's verbs (packages/agent: Cuerpo; the MCP bridge tools/mcp-mundo.ts), checked by
//      the same `puede()` as anyone's — and an AI only ever enters and builds (roles-mundo.ts).
//   3. the agent opens the connection (wss to the world); nothing ever connects to the agent.
// To enter it shows an a2 ticket (instance/identidad.ts): its id, the time, a nonce and an Ed25519 signature over the
// world's name + those. Accepted only when the id is listed here, the signature is that file's key, the time is within
// ± 2 min of this server's clock and the nonce was not seen in that window (kept in memory). The identity is the same
// as an inhabitant's: «ia-<id>», its name + « · IA». A refusal gives no identity and one log line (never the ticket).
// The world's name: MOTOR_DOMINIO (comma-separated public names, e.g. «motor.ejemplo.com») when set — then a ticket made
// for another world can never be replayed here; without it, the host the connection asked for (enough on a PC; the
// log says it once). Owners add and remove agents from inside the world: /agente añadir|quitar (roles-mundo.ts), which
// writes or deletes the file (tmp + rename) and reads the list again, no restart.
import { mkdirSync, renameSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { KeyObject } from "node:crypto";
import { BILLETE2_VENTANA_MS, leerBillete2, mensajeAgente } from "../../instance/src/identidad.ts";
import { clavePublica, firmaValida } from "../../agent/src/llave.ts";
import { AGENTES_CARPETA, leerAgentes, lectorAventura, validarAgente } from "./aventura.ts";
import type { AgenteExterno } from "./aventura.ts";

export const VISTOS_MAX = 10_000; // nonces kept at once (± 2 min of tickets); beyond, new tickets wait

export type OpcionesPuerta = {
  aventura: string | null;                 // the adventure folder (its agentes/ is read and written)
  habitantes?: () => ReadonlySet<string>;  // the inhabitants' ids (an id is one kind of AI only)
  dominios?: readonly string[];            // the world's public names (MOTOR_DOMINIO); none = the host each connection asked for
  ahora?: () => number;                    // the clock (ms); default Date.now
  log?: (l: string) => void;
};

export type Puerta = ReturnType<typeof crearPuerta>;

export function crearPuerta(o: OpcionesPuerta) {
  const ahora = o.ahora ?? Date.now, log = o.log ?? (() => {});
  const dominios = (o.dominios ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean);
  const habitantes = o.habitantes ?? (() => new Set<string>());
  let lista = new Map<string, { a: AgenteExterno; k: KeyObject }>();
  const vistos = new Map<string, number>(); // "<id>.<nonce>" -> until (ms)
  let dichoSinDominio = false;
  const no = (porque: string) => { log(`[agentes] billete de agente de fuera rechazado (${porque})`); return null; };

  /** Read aventura/agentes/ again (at start and after an order): what loads and, in the log, what does not. */
  const leer = (): number => {
    const r = leerAgentes(lectorAventura(o.aventura, log)(AGENTES_CARPETA), habitantes());
    for (const p of r.problemas) log(`[agentes] no se carga: ${p}`);
    const nueva = new Map<string, { a: AgenteExterno; k: KeyObject }>();
    for (const a of r.agentes) { const k = clavePublica(a.clave); if (k) nueva.set(a.id, { a, k }); }
    lista = nueva;
    return lista.size;
  };

  /** The agent behind an a2 ticket shown on a connection that asked for `anfitrion`, or null (and one log line). */
  const verificar = (ticket: string, anfitrion: string | undefined): { id: string; nombre: string } | null => {
    const b = leerBillete2(ticket);
    if (!b) return no("mal formado");
    const ag = lista.get(b.id);
    if (!ag) return no(`«${b.id}» no está en aventura/agentes/ de este mundo`);
    const t = ahora(), desfase = b.ms - t;
    if (Math.abs(desfase) > BILLETE2_VENTANA_MS) return no(`«${b.id}»: hora fuera de ± ${BILLETE2_VENTANA_MS / 60000} min (su reloj va ${Math.round(desfase / 1000)} s ${desfase > 0 ? "adelantado" : "atrasado"})`);
    const nombres = dominios.length ? dominios : anfitrion ? [anfitrion.toLowerCase()] : [];
    if (!dominios.length && !dichoSinDominio && anfitrion) { dichoSinDominio = true; log("[agentes] sin MOTOR_DOMINIO: el nombre del mundo que firma cada agente es el host al que se conecta (bien en un PC; en un servidor público pon MOTOR_DOMINIO)"); }
    if (!nombres.some((n) => firmaValida(ag.k, mensajeAgente(n, b.id, b.ms, b.nonce), b.firma))) return no(`«${b.id}»: la firma no es de su clave o es para otro mundo`);
    for (const [k, hasta] of vistos) if (hasta <= t) vistos.delete(k); // insertion order ≈ time order; small map
    const clave = `${b.id}.${b.nonce}`;
    if (vistos.has(clave)) return no(`«${b.id}»: billete ya usado`);
    if (vistos.size >= VISTOS_MAX) return no("demasiados billetes en 2 minutos; que vuelva a probar");
    vistos.set(clave, Math.max(t, b.ms) + BILLETE2_VENTANA_MS);
    return { id: b.id, nombre: ag.a.nombre };
  };

  const fichero = (id: string) => (o.aventura ? join(o.aventura, AGENTES_CARPETA, `${id}.json`) : null);

  /** Write a new agent's file (whole or nothing) and read the list again. null = done; otherwise why not, in Spanish. */
  const anadir = (a: AgenteExterno): string | null => {
    const f = fichero(a.id);
    if (!f || !o.aventura) return "Este mundo no tiene carpeta de aventura donde guardar agentes.";
    const r = validarAgente(a, `${AGENTES_CARPETA}/${a.id}.json`);
    if (!r.ok) return r.issues.map((i) => `${i.path.split(".").slice(2).join(".") || i.path}: ${i.message}`).join("; ");
    if (habitantes().has(a.id)) return `«${a.id}» es un habitante de este mundo: un agente de fuera necesita otro id.`;
    if (lista.has(a.id) || existsSync(f)) return `Ya hay un agente «${a.id}» (o su fichero): /agente quitar ${a.id} antes.`;
    try {
      mkdirSync(join(o.aventura, AGENTES_CARPETA), { recursive: true });
      const tmp = `${f}.tmp-${process.pid}`;
      writeFileSync(tmp, JSON.stringify(r.value, null, 2) + "\n");
      renameSync(tmp, f);
    } catch (e) { log(`[agentes] no puedo escribir ${f}: ${(e as Error).message}`); return "No he podido guardar el fichero del agente (mira el registro del servidor)."; }
    leer();
    return lista.has(a.id) ? null : "El fichero se guardó pero no se carga (mira el registro del servidor).";
  };

  /** Delete an agent's file and read the list again. null = done; otherwise why not. */
  const quitar = (id: string): string | null => {
    const f = fichero(id);
    if (!f || !lista.has(id)) return `No hay ningún agente de fuera «${id}» en este mundo.`;
    try { unlinkSync(f); } catch (e) { log(`[agentes] no puedo borrar ${f}: ${(e as Error).message}`); return "No he podido borrar el fichero del agente (mira el registro del servidor)."; }
    leer();
    return null;
  };

  return {
    leer, verificar, anadir, quitar,
    /** The agent listed with this id (without «ia-»), or null. */
    agente: (id: string): AgenteExterno | null => lista.get(id)?.a ?? null,
    esHabitante: (id: string): boolean => habitantes().has(id),
    get agentes(): AgenteExterno[] { return [...lista.values()].map((x) => x.a); },
    get dominios(): readonly string[] { return dominios; },
  };
}
