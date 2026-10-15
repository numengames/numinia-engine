// The game features this SERVER runs. One line per feature; delete a line to remove a feature.
// Imported by the composition roots (packages/server/src/main.ts, packages/cli/src/describe.ts). Recipe: docs/EXTENDER.md.
import type { ServerPart } from "../packages/feature/src/index.ts";
import gestos from "./gestos/server.ts";

const funciones: ServerPart[] = [gestos];
export default funciones;
