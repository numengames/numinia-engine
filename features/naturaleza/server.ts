// naturaleza — server part (N4). The server only stores and sends what the world's naturaleza.json says, already validated
// (esquema.ts, read by features/mundo.ts `conMundo`); every page builds the same landscape from it. No intents, no events, nothing
// in the simulation. A world without the file never reaches `crearNaturaleza`: the default part below publishes nothing.
import { serverPart } from "../../packages/feature/src/index.ts";
import { naturaleza, MUNDO } from "./feature.ts";
import type { NaturalezaMundo } from "./esquema.ts";

export const crearNaturaleza = (mundo: NaturalezaMundo | null = null) => serverPart(naturaleza, (api) => {
  if (!mundo) return;
  api.state.set(MUNDO, { ...mundo });
  api.log(`naturaleza: ${mundo.activa ? "encendida" : "apagada"} (semilla ${mundo.semilla}, ${mundo.tamano} m, plaza ${mundo.plaza} m, árboles ${mundo.arboles}, hierba ${mundo.hierba}, ${mundo.estanque ? "con" : "sin"} estanque, paleta ${mundo.paleta})`);
});

export default crearNaturaleza();
