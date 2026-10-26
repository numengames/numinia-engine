// ia — server part (ia-visible S3). Publishes the public card of each AI as shared state (see feature.ts). Two sources, one
// entry per AI entity: this part itself, at identify (an «ia-…» identity gets the minimal entry: it is an AI, active), and the
// roles feature's server-only event «ia», which knows the pass (state, who answers, whether it builds) and says it again when a
// fresh pass changes it. Third source (S12): the AI's intent `atenta` — the bridge says its brain just used its listening tools; `atenta` is
// true for ATENTA_S (90) seconds after the last report, and a fresh pass does not reset it. People never get an entry: nothing here runs for an identity without the «ia-» prefix.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { ATENTA_TICKS, ia } from "./feature.ts";
import { tamanoDeHabitante } from "./ojos.ts";

const esIA = (id: string | undefined): boolean => !!id && id.startsWith("ia-"); // identidad.ts agenteDe

/** The size class the roles feature's event carries: an inhabitant says its escalón (+ the model of its file); anything else (an organization's AI, an outside agent) says nothing, so the eyes are the honest «no sabemos». The model's name stops here: only the class is published. */
const tamano = (m: Record<string, unknown>) => (typeof m.escalon === "number" && m.escalon >= 0 ? tamanoDeHabitante({ escalon: m.escalon, modelo: typeof m.modelo === "string" && m.modelo ? m.modelo : undefined }) : "desconocido");

function setup(api: ServerApi): void {
  const poner = (entity: number, v: Record<string, unknown>) => api.state.set(String(entity), v);
  const hasta = new Map<number, number>(); // AI entity → tick at which its «attentive» ends (S12); only AIs that reported are here
  api.onIdentify((entity, who) => {
    hasta.delete(entity);
    if (esIA(who.id)) poner(entity, { estado: "activa", comunidad: "", nombre: "", cartera: "", construye: false, atenta: false, tamano: "desconocido" });
  });
  api.onLeave((entity) => { hasta.delete(entity); api.state.delete(String(entity)); });
  // S12: the bridge says its brain is listening (every `llamadas` / `esperar_llamada`). The public flag is true for ATENTA_S seconds
  // after the last report. The state changes only when the flag flips, so a brain that reports all day sends nothing to the pages.
  api.on("atenta", (from) => {
    if (!esIA(api.who(from)?.id)) return; // a person's report changes nothing
    const actual = api.state.get(String(from));
    if (!actual) return;
    hasta.set(from, api.tick() + ATENTA_TICKS);
    if (actual.atenta !== true) poner(from, { ...actual, atenta: true });
  });
  api.onTick((t) => {
    if (hasta.size === 0) return; // no AI reported: no work
    for (const [entity, fin] of hasta) {
      if (t < fin) continue;
      hasta.delete(entity);
      const actual = api.state.get(String(entity));
      if (actual && actual.atenta === true) poner(entity, { ...actual, atenta: false });
    }
  });
  api.listen("roles", "ia", (m) => {
    const entity = Number(m.quien);
    if (!esIA(api.who(entity)?.id)) return false; // only an AI's entry; a stray event for a person changes nothing
    poner(entity, { estado: m.estado === "dormida" ? "dormida" : "activa", comunidad: String(m.comunidad ?? ""), nombre: String(m.nombre ?? ""), cartera: String(m.cartera ?? ""), construye: m.construye === true, atenta: (hasta.get(entity) ?? 0) > api.tick(), tamano: tamano(m) }); // a fresh pass keeps «attentive» as it was
    return true;
  });
}

export default serverPart(ia, setup);
