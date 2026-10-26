// gestos — the moves a player can make (J7b, the movement wheel): pure data, shared by the server (the closed list it
// accepts), the page (the wheel and which clip plays) and any agent (the catalog's enum). Each move names the house
// clips it plays (activos/animaciones/<clip>.vrma, Quaternius UAL1, CC0; tools/vrma/convertir.mjs makes them).
//
// modo: "una" = the clips once, then back to standing; "bucle" = the last clip loops; "quedarse" = the last clip once and
// its last pose held. Every move ends when the player walks or jumps, picks another, says «parar», or after `hastaS`.
// viva: true = the body keeps moving (a dance), so the page draws at full rate while it plays; calm moves (sitting,
// guard poses) draw at the idle rate, like standing still (docs/MOVIL-FRIO.md: cold phones).

export type Modo = "una" | "bucle" | "quedarse";
export type Movimiento = {
  id: string; nombre: string; grupo: GrupoId; describe: string;
  clips: readonly string[]; modo: Modo; hastaS: number; viva: boolean;
  /** what a capsule shows over its head when there is no VRM to play the move */
  etiqueta: string;
  /** a word over the head even when the VRM plays it (the wave says «¡Hola!») */
  dice?: string;
  /** a posture with the feet on the floor (sitting, crouching): the page plants them whatever the avatar's leg proportions (avatares-politica apoyoDePies) */
  apoya?: boolean;
};
export type GrupoId = "social" | "acciones" | "combate" | "reacciones";
export const GRUPOS: readonly { id: GrupoId; nombre: string }[] = [
  { id: "social", nombre: "Social" },
  { id: "acciones", nombre: "Acciones" },
  { id: "combate", nombre: "Combate" },
  { id: "reacciones", nombre: "Reacciones" },
];
/** A loop that nobody stops ends on its own after this (s); calm postures last longer. */
export const BUCLE_MAX_S = 60, POSTURA_MAX_S = 600;

const m = (id: string, nombre: string, grupo: GrupoId, describe: string, clips: string[], modo: Modo, viva: boolean, etiqueta = nombre, hastaS = modo === "una" ? 30 : viva ? BUCLE_MAX_S : POSTURA_MAX_S): Movimiento =>
  ({ id, nombre, grupo, describe, clips, modo, hastaS, viva, etiqueta });

/** In wheel order: each group fills one ring of eight, clockwise from the top. */
export const MOVIMIENTOS: readonly Movimiento[] = [
  // social
  { ...m("saludar", "Saludar", "social", "Saluda con la mano", ["saludar"], "una", true, "¡Hola!"), dice: "¡Hola!" },
  m("hablar", "Hablar", "social", "Habla con las manos", ["hablar"], "bucle", false),
  m("bailar", "Bailar", "social", "Baila sin parar", ["bailar"], "bucle", true, "♪ ♪ ♪"),
  { ...m("sentarse", "Sentarse", "social", "Se sienta y se queda sentado", ["sentarse", "sentado"], "bucle", false), apoya: true },
  { ...m("charlar-sentado", "Charlar sentado", "social", "Se sienta y habla", ["sentarse", "sentado-hablar"], "bucle", false), apoya: true },
  { ...m("agacharse", "Agacharse", "social", "Se queda en cuclillas", ["agachado"], "bucle", false), apoya: true },
  m("conducir", "Conducir", "social", "Hace que conduce", ["conducir"], "bucle", false),
  m("antorcha", "Alzar la antorcha", "social", "Levanta una antorcha imaginaria", ["antorcha"], "bucle", false),
  // acciones
  m("usar", "Usar", "acciones", "Toca algo que tiene delante", ["usar"], "una", true),
  m("coger", "Coger", "acciones", "Coge algo de una mesa", ["coger"], "una", true),
  m("arreglar", "Arreglar", "acciones", "Se arrodilla y arregla algo", ["arreglar"], "una", true),
  m("empujar", "Empujar", "acciones", "Empuja algo pesado", ["empujar"], "bucle", true),
  m("rodar", "Rodar", "acciones", "Una voltereta en el sitio", ["rodar"], "una", true),
  m("flotar", "Flotar", "acciones", "Nada en el aire, sin moverse", ["flotar"], "bucle", false),
  m("conjurar", "Conjurar", "acciones", "Prepara un hechizo y lo sostiene", ["hechizo-preparar", "hechizo-sostener"], "bucle", false),
  m("lanzar-hechizo", "Lanzar hechizo", "acciones", "Lanza un hechizo", ["hechizo-lanzar"], "una", true),
  // combate
  m("jab", "Jab", "combate", "Un golpe rápido", ["jab"], "una", true),
  m("directo", "Directo", "combate", "Un golpe fuerte", ["directo"], "una", true),
  m("tajo", "Tajo", "combate", "Un golpe de espada", ["espada-tajo"], "una", true),
  m("en-guardia", "En guardia", "combate", "Espada en guardia", ["espada-guardia"], "bucle", false),
  m("apuntar", "Apuntar", "combate", "Apunta con las dos manos", ["pistola-guardia"], "bucle", false),
  m("disparar", "Disparar", "combate", "Dispara una vez", ["pistola-disparar"], "una", true),
  m("recargar", "Recargar", "combate", "Recarga", ["pistola-recargar"], "una", true),
  // reacciones
  // the four non-verbal answers of an AI's body (packages/agent/src/gesto-ia.ts), a person may make them too: one short move each
  m("asentir", "Asentir", "reacciones", "Dice que sí con la cabeza", ["asentir"], "una", false, "Sí"),
  m("negar", "Negar", "reacciones", "Dice que no con la cabeza", ["negar"], "una", false, "No"),
  m("pensar", "Pensar", "reacciones", "Se lleva la mano a la barbilla y piensa", ["pensar"], "una", false, "Hmm…"),
  m("senalar", "Señalar", "reacciones", "Señala lo que tiene delante", ["senalar"], "una", false, "☞"),
  m("ay", "¡Ay!", "reacciones", "Un golpe en la cabeza", ["golpe-cabeza"], "una", true),
  m("encajar", "Encajar", "reacciones", "Un golpe en el pecho", ["golpe-pecho"], "una", true),
  m("manos-arriba", "Manos arriba", "reacciones", "Levanta las manos y las deja arriba", ["pistola-arriba"], "quedarse", false),
  m("hacerse-el-muerto", "Hacerse el muerto", "reacciones", "Cae al suelo y se queda", ["caer-muerto"], "quedarse", false),
];
/** Stop the move you are making (the centre of the wheel). Not a move: no clip. */
export const PARAR = "parar";
/** The closed list the server accepts (the enum of `hacer`). saludar and bailar keep their place from J7. */
export const GESTOS: readonly string[] = [...MOVIMIENTOS.map((x) => x.id), PARAR];
/** The first ring until the player chooses their own (eight, the most used in the games we read: ../movimientos/LISTA.md). */
export const FAVORITOS_INICIALES: readonly string[] = ["saludar", "bailar", "hablar", "sentarse", "agacharse", "conjurar", "manos-arriba", "hacerse-el-muerto"];

const POR_ID = new Map(MOVIMIENTOS.map((x) => [x.id, x]));
export const movimiento = (id: string): Movimiento | undefined => POR_ID.get(id);
/** Every clip some move plays (the files the page may fetch, one by one, when someone plays them). */
export const CLIPS_DE_MOVIMIENTOS: readonly string[] = [...new Set(MOVIMIENTOS.flatMap((x) => x.clips))];
