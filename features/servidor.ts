// The game features this SERVER runs. One line per feature; delete a line to remove a feature.
// Imported by the composition roots (packages/server/src/main.ts, packages/cli/src/describe.ts). Recipe: docs/EXTENDER.md.
import type { ServerPart } from "../packages/feature/src/index.ts";
import gestos from "./gestos/server.ts";
import despertar from "./despertar/server.ts";
import objetos from "./objetos/server.ts";
import chat from "./chat/server.ts";
import misiones from "./misiones/server.ts"; // J5: two features, one engine: people (pnj) and quests (misiones)
import entorno from "./entorno/server.ts";
import director from "./director/server.ts"; // N6: the Game Director (scenes, narration, summons)
import elementos from "./elementos/server.ts";
import pesca from "./pesca/server.ts"; // v1: fishing (the server decides the bite, the fish and the catch)
import dardos from "./dardos/server.ts"; // v1: darts (the page sends aim + strength; the server decides where it lands and the score)
import bienes from "./bienes/server.ts";
import dados from "./dados/server.ts"; // v1: dice the server rolls (a tower is a thing of the world; /tirar 2d6 in the chat); everyone near sees the same // N10: digital goods — a chest's «objeto» becomes yours (signed receipt, inventory)

import teletransporte from "./teletransporte/server.ts"; // N16: go next to someone connected now; a photo's place, if the world allows it
import web from "./web/server.ts"; // N17: web screens (an iframe in the world on PC and phone; a card and «Abrir fuera» in VR)
const funciones: ServerPart[] = [gestos, despertar, objetos, chat, ...misiones, entorno, elementos, pesca, bienes, dardos, dados, director, teletransporte, web];
export default funciones;
