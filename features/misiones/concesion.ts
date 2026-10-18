// misiones — a reward granted, recorded once (U14 (6), the TRG26 spec §9: «se registra una concesión única con
// identificador del jugador, misión, instante y estado»; no wallet needed). When a quest with `recompensas` completes for
// someone with identity (I1), server.ts writes ONE record in the misiones store under `c:<quest>:<guest>` — only if the
// key is absent, never over it: pressing again, reconnecting, two tabs of one guest or two players at once leave one
// record each, and a repeatable quest keeps the instant of its FIRST completion. A page without identity (bots, a page
// that never said who it is) gets none: its progress is not kept either. The records are plain JSON inside
// datos/misiones.json + .jsonl; `npm run concesiones -- <world folder>` (packages/server/src/concesiones.ts) lists them
// as CSV for the organizers. Pure: the caller passes the instant; nothing here touches the store.
import { STATE_KEY_BYTES } from "../../packages/feature/src/index.ts";
import { corta, LIM } from "./formato.ts";
import type { Mision } from "./formato.ts";

export const PREFIJO_CONCESION = "c:";
/** The only state today; a later one (an optional NFT minted, a grant taken back) would be a new word here. */
export const CONCEDIDA = "concedida";
/** One grant as the store keeps it (≈ 250 bytes; at most ~700 with 8 rewards of 32-letter ids: the store allows 4,096). */
export type Concesion = { jugador: string; nombre: string; mision: string; recompensas: string[]; instante: string; estado: typeof CONCEDIDA };

/** The store key of one player's grant for one quest. Ids are ASCII; a key past the store's 64 bytes (a 28–32-letter
 * quest id with a numinia.com pass id, `p_` + 32 hex) keeps its first 64: what is left of the id still tells people apart. */
export const claveConcesion = (mision: string, jugador: string): string => `${PREFIJO_CONCESION}${mision}:${jugador}`.slice(0, STATE_KEY_BYTES);

/** The record of `quien` completing `m` at `instante` (ISO 8601 UTC): who (id and the name they had), which quest, the
 * ids of its rewards, when, and its state. */
export const concesion = (m: Mision, quien: { id: string; nombre: string }, instante: string): Concesion =>
  ({ jugador: quien.id, nombre: corta(quien.nombre, LIM.nombre), mision: m.id, recompensas: m.recompensas.map((r) => (r.tipo === "semilla" ? `semilla:${r.color}` : r.id)), instante, estado: CONCEDIDA });
