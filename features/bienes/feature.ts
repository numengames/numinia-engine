// bienes — declaration (N10, digital goods). A thing that is YOURS: it comes out of a chest at the end of an adventure
// (a quest's «objeto» reward, features/misiones), the world signs a receipt of ownership (Ed25519, no chain, no wallet:
// packages/server/src/recibos.ts) and it waits in your inventory (the player sheet, key I). The receipt is a file you
// can take away; any page, world or tool checks its signature with the key written inside (comprobar.ts, POST
// /bienes/comprobar, npm run bienes -- verificar). Minting it on a chain is a later, optional
// step (Pablo's decision: work/noche-20261018/N10-bienes-digitales.md); cadena.ts already turns a receipt into ERC-721
// metadata and a lazy-mint voucher's shape. Recipe: docs/EXTENDER.md «Bienes digitales».
import { defineFeature } from "../../packages/feature/src/index.ts";

/** A receipt rides in three text fields of the `bien` event (the wire's text fields hold 512 bytes; a receipt is ≈ 0.7–1.1
 * kB, at most 1,400). It never goes page → server (those messages keep under 1 kB): a page checks receipts itself
 * (comprobar.ts, WebCrypto Ed25519) and tools use the route POST /bienes/comprobar. */
export const TROZO = 512, TROZOS = 3;
const R = { kind: "text", maxBytes: TROZO, default: "" } as const;
const ID = { kind: "text", maxBytes: 32 } as const;
const NOMBRE = { kind: "text", maxBytes: 60 } as const;

export const bienes = defineFeature({
  id: "bienes",
  version: 1,
  level: "base",
  describe: "Bienes digitales: objetos que son tuyos. Salen de un cofre al acabar una aventura (recompensa «objeto» de una misión); el mundo firma un recibo de propiedad (Ed25519, sin cadena ni cartera) y el objeto queda en tu inventario, guardado por invitado. El recibo se puede descargar y enseñar en otro mundo, que comprueba la firma.",
  store: { describe: "Cada bien dado en este mundo (`b:<id>`, id = 24 hex únicos por mundo): su recibo firmado («nb1.…»), su dueño (id de invitado), el objeto, la misión y el instante. Solo le llega a su dueño. `npm run bienes -- <carpeta del mundo>` los lista y comprueba." },
  intents: {
    ver: { describe: "Pedir tu inventario: llegan tus bienes de este mundo, uno a uno, con su recibo.", spoken: "ver mi inventario", fields: {}, rate: { perSecond: 1, burst: 3 } },
  },
  events: {
    inventario: { describe: "Llega tu inventario entero: olvida el anterior; detrás vienen sus bienes (evento bien). emisor = la clave pública con la que este mundo firma sus recibos («ed25519:…»; vacía = este mundo no da bienes).", fields: { n: { kind: "int", min: 0, max: 1000 }, emisor: { kind: "text", maxBytes: 51, default: "" } }, announce: "silent" },
    bien: {
      describe: "Un bien tuyo: id, nombre, descripción, modelo (sha256 de un .glb; vacío = ninguno), licencia de su arte, mundo y misión de donde salió, instante, y su recibo firmado en tres trozos (r1+r2+r3).",
      fields: { id: { kind: "text", maxBytes: 24 }, objeto: ID, nombre: NOMBRE, descripcion: { kind: "text", maxBytes: 140, default: "" }, modelo: { kind: "text", maxBytes: 64, default: "" }, licencia: { kind: "text", maxBytes: 40, default: "" }, mundo: { kind: "text", maxBytes: 120 }, mision: ID, instante: { kind: "text", maxBytes: 32 }, r1: R, r2: R, r3: R },
      announce: "silent",
    },
    recibido: { describe: "Acabas de recibir un bien: ya es tuyo y está en tu inventario.", fields: { nombre: NOMBRE }, announce: { text: "Es tuyo: {nombre}. Está en tu inventario (tecla I).", sound: "magia", importance: 2 } },
  },
});

/** Cut a receipt into the wire's three fields (r1, r2, r3) and put it back together. Receipts are ASCII. */
export const partir = (token: string): { r1: string; r2: string; r3: string } => ({ r1: token.slice(0, TROZO), r2: token.slice(TROZO, 2 * TROZO), r3: token.slice(2 * TROZO, 3 * TROZO) });
export const unir = (m: Record<string, unknown>): string => `${String(m.r1 ?? "")}${String(m.r2 ?? "")}${String(m.r3 ?? "")}`;
