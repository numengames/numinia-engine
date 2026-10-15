// The game features this SERVER runs. One line per feature; delete a line to remove a feature.
// Imported by the composition roots (packages/server/src/main.ts, packages/cli/src/describe.ts). Recipe: docs/EXTENDER.md.
import type { ServerPart } from "../packages/feature/src/index.ts";
import gestos from "./gestos/server.ts";
import despertar from "./despertar/server.ts";
import objetos from "./objetos/server.ts";
import chat from "./chat/server.ts";
import misiones from "./misiones/server.ts"; // J5: two features, one engine: people (pnj) and quests (misiones)
import entorno from "./entorno/server.ts";
import elementos from "./elementos/server.ts";

const funciones: ServerPart[] = [gestos, despertar, objetos, chat, ...misiones, entorno, elementos];
export default funciones;
