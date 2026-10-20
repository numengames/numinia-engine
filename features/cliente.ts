// The game features the PAGE knows how to show and use. One line per feature; delete a line to remove it.
// Imported by apps/plaza/main.ts. A feature the server lacks just stays quiet. Recipe: docs/EXTENDER.md.
import type { ClientPart } from "../packages/feature/src/index.ts";
import gestos from "./gestos/client.ts";
import despertar from "./despertar/client.ts";
import objetos from "./objetos/client.ts";
import avatar from "./avatar/client.ts"; // H10: your avatar — house or uploaded .vrm, saved with your identity
import chat from "./chat/client.ts";
import misiones from "./misiones/client.ts"; // J5: two features: people (pnj) and quests (misiones)
import entorno from "./entorno/client.ts";
import director from "./director/client.ts"; // N6: the Game Director (the panel and the cards: apps/plaza/director.ts)
import elementos from "./elementos/client.ts";
import pesca from "./pesca/client.ts"; // v1: fishing (rod, float and the big «Recoger» button live in apps/plaza/pesca.ts)
import dardos from "./dardos/client.ts"; // v1: darts (the throwing view lives in apps/plaza/dardos.ts; the board on your wall in AR)
import bienes from "./bienes/client.ts";
import dados from "./dados/client.ts"; // v1: dice the server rolls (the dice card and the tower's buttons: apps/plaza/dados.ts) // N10: digital goods — a chest's «objeto» becomes yours (signed receipt, inventory)

import teletransporte from "./teletransporte/client.ts"; // N16: «Gente» and the light of the trip (apps/plaza/gente.ts; packages/render/src/teletransporte.ts)
import web from "./web/client.ts";
import puertas from "./puertas/client.ts"; // J4: the slab on its hinge
import botones from "./botones/client.ts"; // J4: the cap on its post
import cogibles from "./cogibles/client.ts"; // J4: on the floor or in a hand (view.lleva); «Soltar» = Q
import naturaleza from "./naturaleza/client.ts"; // N4: relief, trees and grass (built by packages/render/src/naturaleza/naturaleza.ts)
import espacioBase from "./espaciobase/client.ts"; // H2: the espacio base — an empty night world whose ground is a luminous line mesh (packages/render/src/espacio-base/)
import suelo from "./suelo/client.ts"; // D-045: the fade when the server puts you back on a safe spot
import contadores from "./contadores/client.ts"; // D-044: timers and counters (the sign is a label sprite; the panel lives in apps/plaza/contadores.ts)
import disparadores from "./disparadores/client.ts"; // D-041: the cable — a button on its post; the page only asks `pulsar`
import cerradura from "./cerradura/client.ts"; // D-042: the lock's data and its keypad (apps/plaza/cerradura.ts)
import movedores from "./movedores/client.ts"; // D-043: the model wherever the server says, right now (`view.place`)
import lucha from "./lucha/client.ts"; // L1: creatures drawn as the house block through view.place; «E: golpear»
import ancestros from "./ancestros/client.ts"; // v1: the Salón de los Ancestros (3D: packages/render/src/ancestros.ts; panel: apps/plaza/ancestros.ts)
import inventario from "./inventario/client.ts"; // Y1: the Reserva (panel in apps/plaza/inventario.ts)
import sonido from "./sonido/client.ts"; // S6: the sounds of the house — the server says what sounds and with what seed; the page only mixes (view.sonido)
const funciones: ClientPart[] = [gestos, despertar, objetos, avatar, chat, ...misiones, entorno, elementos, pesca, lucha, bienes, dardos, dados, director, teletransporte, web, puertas, botones, cogibles, suelo, naturaleza, espacioBase, contadores, disparadores, cerradura, movedores, inventario, ancestros, sonido];
export default funciones;
