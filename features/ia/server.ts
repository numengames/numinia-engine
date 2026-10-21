// ia — server part (ia-visible S3). Publishes the public card of each AI as shared state (see feature.ts). Two sources, one
// entry per AI entity: this part itself, at identify (an «ia-…» identity gets the minimal entry: it is an AI, active), and the
// roles feature's server-only event «ia», which knows the pass (state, who answers, whether it builds) and says it again when a
// fresh pass changes it. People never get an entry: nothing here runs for an identity without the «ia-» prefix.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { ia } from "./feature.ts";

const esIA = (id: string | undefined): boolean => !!id && id.startsWith("ia-"); // identidad.ts agenteDe

function setup(api: ServerApi): void {
  const poner = (entity: number, v: Record<string, unknown>) => api.state.set(String(entity), v);
  api.onIdentify((entity, who) => {
    if (esIA(who.id)) poner(entity, { estado: "activa", comunidad: "", nombre: "", cartera: "", construye: false, atenta: false });
  });
  api.onLeave((entity) => api.state.delete(String(entity)));
  api.listen("roles", "ia", (m) => {
    const entity = Number(m.quien);
    if (!esIA(api.who(entity)?.id)) return false; // only an AI's entry; a stray event for a person changes nothing
    poner(entity, { estado: m.estado === "dormida" ? "dormida" : "activa", comunidad: String(m.comunidad ?? ""), nombre: String(m.nombre ?? ""), cartera: String(m.cartera ?? ""), construye: m.construye === true, atenta: false });
    return true;
  });
}

export default serverPart(ia, setup);
