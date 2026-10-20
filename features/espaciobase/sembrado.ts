// espacio-base: everything the espacio base plants ONCE as ordinary objects, in order: the logo (H5, `objeto`), then the moñonis (H6, `agentes`).
// One list, one mark (`sembrado`, features/objetos/server.ts): a world that was already planted never gets any of it again.
import type { Sembrado } from "../objetos/server.ts";
import type { EspacioBaseMundo } from "./esquema.ts";
import { LOGO } from "./logo.ts";
import { bolitas } from "./bolitas.ts";

export const sembradoBase = (m: EspacioBaseMundo): Sembrado[] => [...(m.objeto === LOGO.modelo ? [LOGO] : []), ...bolitas(m.semilla, m.agentes)];
