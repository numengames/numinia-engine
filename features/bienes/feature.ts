// bienes — declaration (N10, digital goods). A thing that is YOURS: it comes out of a chest at the end of an adventure
// (a quest's «objeto» reward, features/misiones), the world signs a receipt of ownership (Ed25519, no chain, no wallet:
// packages/server/src/recibos.ts) and it waits in your inventory (the player sheet, key I). The receipt is a file you
// can take away; any page, world or tool checks its signature with the key written inside (comprobar.ts, POST
// /bienes/comprobar, npm run bienes -- verificar). Minting it on a chain is a later, optional
// step (Pablo's decision: work/noche-20261018/N10-bienes-digitales.md); cadena.ts already turns a receipt into ERC-721
// metadata and a lazy-mint voucher's shape. Recipe: docs/EXTENDER.md «Bienes digitales».
// v2 (N18): a good with a model can be WORN — in your hand or on your head — and everyone near sees it (state `p:<entity>`,
// view.lleva); the inventory comes from a per-owner index (`d:<guest>`), not from walking every good of the world; and a
// receipt from ANOTHER world can be brought here (intent `traer`, in pieces): it is always checked, and it becomes yours
// here only when this world trusts whoever signed it (its file `<aventura>/bienes/confianza.json`, empty by default).
import { defineFeature } from "../../packages/feature/src/index.ts";

/** A receipt rides in three text fields of the `bien` event (the wire's text fields hold 512 bytes; a receipt is ≈ 0.7–1.1
 * kB, at most 1,400). It never goes page → server (those messages keep under 1 kB): a page checks receipts itself
 * (comprobar.ts, WebCrypto Ed25519) and tools use the route POST /bienes/comprobar. */
export const TROZO = 512, TROZOS = 3;
const R = { kind: "text", maxBytes: TROZO, default: "" } as const;
const ID = { kind: "text", maxBytes: 32 } as const;
const NOMBRE = { kind: "text", maxBytes: 60 } as const;
/** N18: where a good is worn ("" in `llevar` = take it off). */
export const DONDE = ["mano", "cabeza"] as const;
export type Donde = (typeof DONDE)[number];
/** N18: a receipt brought from elsewhere travels page → server in pieces (a frame holds 1 kB; a receipt ≤ 1,400 chars). */
export const PIEZA = 480, PIEZAS = 3;

export const bienes = defineFeature({
  id: "bienes",
  version: 2,
  level: "base",
  describe: "Bienes digitales: objetos que son tuyos. Salen de un cofre al acabar una aventura (recompensa «objeto» de una misión); el mundo firma un recibo de propiedad (Ed25519, sin cadena ni cartera) y el objeto queda en tu inventario, guardado por invitado. El recibo se puede descargar y enseñar en otro mundo, que comprueba la firma. Un objeto con modelo 3D se puede llevar en la mano o sobre la cabeza, y los demás lo ven. Un recibo de otro mundo se comprueba siempre y solo es tuyo aquí si este mundo confía en quien lo firmó.",
  store: { describe: "Cada bien dado en este mundo (`b:<id>`, id = 24 hex únicos por mundo) o traído de otro en el que este confía (`f:<24 hex de la huella del recibo>`): su recibo firmado («nb1.…»), su dueño (id de invitado), el objeto, la misión y el instante. Solo le llega a su dueño. El índice por dueño (`d:<invitado>`, `d:<invitado>~2`…) y lo que cada uno lleva puesto (`l:<invitado>`). `npm run bienes -- <carpeta del mundo>` los lista y comprueba." },
  state: { describe: "Lo que lleva puesto cada persona (`p:<entidad>`): el modelo de uno de sus bienes, en la mano o sobre la cabeza, para que todos lo vean.", fields: { ent: { kind: "int", min: 0, max: 1_000_000 }, modelo: { kind: "text", maxBytes: 64 }, donde: { kind: "enum", values: [...DONDE] }, nombre: NOMBRE } },
  intents: {
    ver: { describe: "Pedir tu inventario: llegan tus bienes de este mundo, uno a uno, con su recibo.", spoken: "ver mi inventario", fields: {}, rate: { perSecond: 1, burst: 3 } },
    llevar: { describe: "Llevar puesto uno de tus bienes con modelo 3D (id del bien; donde = mano o cabeza; vacío = quitártelo). Los demás lo ven.", spoken: "llevar un objeto", fields: { id: { kind: "text", maxBytes: 24, default: "" }, donde: { kind: "enum", values: ["", ...DONDE] } }, rate: { perSecond: 2, burst: 4 } },
    traer: { describe: "Traer un recibo de otro mundo, en trozos (parte de partes, cada uno de hasta 480 caracteres). El servidor lo comprueba y solo lo hace tuyo aquí si este mundo confía en quien lo firmó.", spoken: "traer un recibo de otro mundo", fields: { parte: { kind: "int", min: 0, max: PIEZAS - 1 }, partes: { kind: "int", min: 1, max: PIEZAS }, t: { kind: "text", maxBytes: PIEZA } }, rate: { perSecond: 6, burst: 6 } },
  },
  events: {
    inventario: { describe: "Llega tu inventario entero: olvida el anterior; detrás vienen sus bienes (evento bien). emisor = la clave pública con la que este mundo firma sus recibos («ed25519:…»; vacía = este mundo no da bienes).", fields: { n: { kind: "int", min: 0, max: 1000 }, emisor: { kind: "text", maxBytes: 51, default: "" } }, announce: "silent" },
    bien: {
      describe: "Un bien tuyo: id, nombre, descripción, modelo (sha256 de un .glb; vacío = ninguno), licencia de su arte, mundo y misión de donde salió, instante, su recibo firmado en tres trozos (r1+r2+r3), si viene de otro mundo (ajeno) y si este servidor tiene su modelo (verse).",
      fields: { id: { kind: "text", maxBytes: 24 }, ajeno: { kind: "bool" }, verse: { kind: "bool" }, objeto: ID, nombre: NOMBRE, descripcion: { kind: "text", maxBytes: 140, default: "" }, modelo: { kind: "text", maxBytes: 64, default: "" }, licencia: { kind: "text", maxBytes: 40, default: "" }, mundo: { kind: "text", maxBytes: 120 }, mision: ID, instante: { kind: "text", maxBytes: 32 }, r1: R, r2: R, r3: R },
      announce: "silent",
    },
    recibido: { describe: "Acabas de recibir un bien: ya es tuyo y está en tu inventario.", fields: { nombre: NOMBRE }, announce: { text: "Es tuyo: {nombre}. Está en tu inventario (tecla I).", sound: "magia", importance: 2 } },
    traido: { describe: "Lo que el servidor vio en el recibo que trajiste de otro mundo: si es auténtico, qué es, de qué mundo, si este mundo confía en quien lo firmó, si ahora es tuyo aquí, y una frase para leer.", fields: { ok: { kind: "bool" }, nombre: { kind: "text", maxBytes: 60, default: "" }, mundo: { kind: "text", maxBytes: 120, default: "" }, confia: { kind: "bool" }, dado: { kind: "bool" }, motivo: { kind: "text", maxBytes: 300 } }, announce: "silent" },
    aviso: { describe: "Algo que pediste no se pudo (llevar un objeto que no es tuyo o que no tiene modelo aquí).", fields: { texto: { kind: "text", maxBytes: 200 } }, announce: { text: "{texto}", sound: "aviso", importance: 1 } },
  },
});

/** Cut a receipt into the wire's three fields (r1, r2, r3) and put it back together. Receipts are ASCII. */
export const partir = (token: string): { r1: string; r2: string; r3: string } => ({ r1: token.slice(0, TROZO), r2: token.slice(TROZO, 2 * TROZO), r3: token.slice(2 * TROZO, 3 * TROZO) });
export const unir = (m: Record<string, unknown>): string => `${String(m.r1 ?? "")}${String(m.r2 ?? "")}${String(m.r3 ?? "")}`;
