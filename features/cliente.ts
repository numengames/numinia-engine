// The game features the PAGE knows how to show and use. One line per feature; delete a line to remove it.
// Imported by apps/plaza/main.ts. A feature the server lacks just stays quiet. Recipe: docs/EXTENDER.md.
import type { ClientPart } from "../packages/feature/src/index.ts";
import gestos from "./gestos/client.ts";
import despertar from "./despertar/client.ts";

const funciones: ClientPart[] = [gestos, despertar];
export default funciones;
