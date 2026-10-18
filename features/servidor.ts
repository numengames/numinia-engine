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
import web from "./web/server.ts";
import puertas from "./puertas/server.ts"; // J4: doors the server opens and closes (a button may open one)
import botones from "./botones/server.ts"; // J4: buttons the server counts; a server-only `senal` other features hear
import cogibles from "./cogibles/server.ts"; // J4: things anyone picks up and puts down; drawn in the carrier's hand
import naturaleza from "./naturaleza/server.ts"; // N4: relief, trees and grass from a seed (the world's naturaleza.json; the page builds it)
import suelo from "./suelo/server.ts"; // D-045: back to the last safe spot after a fall (the instance does it; this tells the page)
import contadores from "./contadores/server.ts"; // D-044: timers and counters everyone sees (the server keeps the clock, publishes once a second to the zone)
import disparadores from "./disparadores/server.ts"; // D-041: the cable — zone and button triggers a world wires in disparadores.json; one server-only `accion` per receiver
import cerradura from "./cerradura/server.ts"; // D-042: a lock that opens with a code (keypad, HTML too) or a key; the server decides
import movedores from "./movedores/server.ts"; // D-043: things the server moves and rotates with a duration, same for everyone (platform, sliding door, lift)
import lucha from "./lucha/server.ts"; // L1: creatures with coherence and a solid box; one melee blow (the server decides reach, cooldown, damage)
import inventario from "./inventario/server.ts"; // Y1: what each person owns; after misiones, whose `otorga` it listens to
const funciones: ServerPart[] = [gestos, despertar, objetos, chat, ...misiones, entorno, elementos, pesca, lucha, bienes, dardos, dados, director, teletransporte, web, puertas, botones, cogibles, suelo, naturaleza, contadores, disparadores, cerradura, movedores, inventario];
export default funciones;
