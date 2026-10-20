// espacio-base — server part (H2). Stores and sends what the world's espacio-base.json says, already validated (esquema.ts, read by
// features/mundo.ts `conMundo`); every page draws the same mesh from it and the instance builds the same collision mesh. A world without
// the file publishes nothing (the page draws exactly what it drew before).
import { serverPart } from "../../packages/feature/src/index.ts";
import { espacioBase, MUNDO } from "./feature.ts";
import type { EspacioBaseMundo } from "./esquema.ts";

export const crearEspacioBase = (mundo: EspacioBaseMundo | null = null) => serverPart(espacioBase, (api) => {
  if (!mundo) return;
  api.state.set(MUNDO, { ...mundo });
  api.log(`espacio base: ${mundo.activa ? "encendido" : "apagado"} (semilla ${mundo.semilla})`);
});

export default crearEspacioBase();
