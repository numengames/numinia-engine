// suelo — server part (D-045). The instance keeps the safe spots and orders the returns (packages/instance); here the
// world's values are published (state «mundo»), each return becomes a «vuelta» event for the person (importance 2: it is
// read aloud) and the verb `volver` (the cable's «vuelve_a_seguro») asks the instance on purpose. A world without `sueloMinimo` still answers
// the verb (back to where you last stood), but never moves anyone on its own.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { suelo, MUNDO } from "./feature.ts";

/** What a world may say (entorno.json `sueloMinimo` + `vuelta`; read by features/mundo.ts, given to the instance too). */
export type SueloMundo = { minimo: number; vuelta?: { x: number; y: number; z: number; siempre?: boolean } | null } | null;

export const crearSuelo = (mundo: SueloMundo = null) => serverPart(suelo, (api: ServerApi) => {
  api.state.set(MUNDO, { activo: mundo !== null, minimo: mundo?.minimo ?? -500 });
  if (mundo) api.log(`suelo: bajo ${mundo.minimo} m se vuelve a la última posición segura${mundo.vuelta ? ` (punto de vuelta ${mundo.vuelta.x}, ${mundo.vuelta.y}, ${mundo.vuelta.z}${mundo.vuelta.siempre ? ", siempre" : ""})` : ""}`);
  api.onVuelta((v) => { api.emit("vuelta", { quien: v.entity, x: v.x, y: v.y, z: v.z, motivo: v.motivo }, { to: v.entity }); });
  api.on("volver", (from) => { api.volverASeguro(from); });
});

export default crearSuelo();
