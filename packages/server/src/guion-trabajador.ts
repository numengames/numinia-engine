// Worker side of a world script (M20). Copies the Hyperfy-2 idea of apps whose script sees ONLY a public
// `app` object (Apps.js in the fork) and transforms it to our constraints: the script runs in an SES Compartment
// inside a worker thread, so the host can kill it on a CPU overrun (worker.terminate) and cap its heap
// (resourceLimits), neither of which an in-thread sandbox can do.
import "ses";
import { parentPort } from "node:worker_threads";

declare const lockdown: (opciones?: Record<string, unknown>) => void;
declare const Compartment: new (globals?: Record<string, unknown>) => { evaluate(codigo: string): unknown };

lockdown({ errorTaming: "unsafe", consoleTaming: "unsafe", overrideTaming: "severe", stackFiltering: "verbose" });

const puerto = parentPort!;
const manejadores = new Map<string, (datos: unknown) => unknown>();
const texto = (v: unknown) => String(v).slice(0, 500);

// The whole public surface of a script. Add to this object only; nothing else is visible to it.
const app = Object.freeze({
  on: (nombre: unknown, fn: unknown) => {
    if (typeof nombre === "string" && typeof fn === "function") manejadores.set(nombre, fn as (d: unknown) => unknown);
  },
  off: (nombre: unknown) => { manejadores.delete(texto(nombre)); },
  log: (...partes: unknown[]) => { puerto.postMessage({ t: "log", texto: partes.map(texto).join(" ") }); },
  emit: (nombre: unknown, datos?: unknown) => { puerto.postMessage({ t: "emitir", nombre: texto(nombre), datos: JSON.parse(JSON.stringify(datos ?? null)) }); },
});

puerto.on("message", (m: { t: string; codigo?: string; id?: number; nombre?: string; datos?: unknown }) => {
  if (m.t === "cargar") {
    try {
      new Compartment({ app }).evaluate(String(m.codigo));
      puerto.postMessage({ t: "listo" });
    } catch (e) { puerto.postMessage({ t: "fallo", id: 0, detalle: texto((e as Error)?.message ?? e) }); }
  } else if (m.t === "evento") {
    const fn = manejadores.get(String(m.nombre));
    if (!fn) { puerto.postMessage({ t: "fin", id: m.id, valor: null, atendido: false }); return; }
    try {
      const valor = fn(m.datos);
      puerto.postMessage({ t: "fin", id: m.id, valor: valor === undefined ? null : JSON.parse(JSON.stringify(valor)), atendido: true });
    } catch (e) { puerto.postMessage({ t: "fallo", id: m.id, detalle: texto((e as Error)?.message ?? e) }); }
  }
});
