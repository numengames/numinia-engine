// fauna-casa — the house fauna table (`fauna.json`, numinia-engine/fauna@1) parsed once: hex strings become ints, every row checked by
// packages/relieve/src/fauna.ts `validarTabla`. A world's own fauna.json replaces it (features/mundo.ts). The page gets it through the
// composition root (apps/plaza/main.ts may import features/), never from render/ (render imports only relieve).
import crudo from "./fauna.json" with { type: "json" };
import { validarTabla } from "../../packages/relieve/src/fauna.ts";
import type { TablaFauna } from "../../packages/relieve/src/fauna.ts";

const leida = validarTabla(crudo);
if (!leida.ok) throw new Error(`features/naturaleza/fauna.json está mal: ${leida.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
/** The house table, validated. */
export const FAUNA_CASA: TablaFauna = leida.value;
