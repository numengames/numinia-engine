// The game features the PAGE knows how to show and use. One line per feature; delete a line to remove it.
// Imported by apps/plaza/main.ts. A feature the server lacks just stays quiet. Recipe: docs/EXTENDER.md.
import type { ClientPart } from "../packages/feature/src/index.ts";
import gestos from "./gestos/client.ts";
import despertar from "./despertar/client.ts";
import objetos from "./objetos/client.ts";
import chat from "./chat/client.ts";
import misiones from "./misiones/client.ts"; // J5: two features: people (pnj) and quests (misiones)
import entorno from "./entorno/client.ts";
import elementos from "./elementos/client.ts";
import pesca from "./pesca/client.ts"; // v1: fishing (rod, float and the big «Recoger» button live in apps/plaza/pesca.ts)
import bienes from "./bienes/client.ts"; // N10: digital goods — a chest's «objeto» becomes yours (signed receipt, inventory)

const funciones: ClientPart[] = [gestos, despertar, objetos, chat, ...misiones, entorno, elementos, pesca, bienes];
export default funciones;
