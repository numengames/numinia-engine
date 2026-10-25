// t_9cb3f636: the page's side of the heartbeat. The SERVER lets go of a page only after a long silence (SILENCIO_MS, 15 s: a phone that
// freezes for a few seconds is not a dead one), so the PLAYER cannot wait for that to learn the connection is gone: this watches the
// server's traffic (snapshots at 10 Hz, a pong every second) and says «silent» after SERVIDOR_CALLADO_MS without any, and «back» the
// moment something arrives. Pure: the caller gives it the clock, so it is tested with a fake one.
import { SERVIDOR_CALLADO_MS } from "../../net/src/index.ts";

/** How often the page should call `barrer`; silence is then noticed within `umbral + BARRIDO_MS` (1.5 s + 0.25 s < 2 s). */
export const BARRIDO_MS = 250;

export class VigiaServidor {
  private oido: number;
  private ultimoBarrido: number;
  private _callado = false;
  private readonly umbral: number;
  constructor(ahora: number, umbral = SERVIDOR_CALLADO_MS) { this.oido = this.ultimoBarrido = ahora; this.umbral = umbral; }

  get callado(): boolean { return this._callado; }
  /** Something arrived from the server at `ahora` (any message). Returns true if this ends a silence. */
  recibido(ahora: number): boolean {
    this.oido = Math.max(this.oido, ahora);
    const volvio = this._callado; this._callado = false;
    return volvio;
  }
  /** Call every BARRIDO_MS. Returns true when the state CHANGED to silent now. Nothing is judged (and the clock restarts) when the
   * page itself was not running — a background tab, or a sweep that came much later than due because the main thread was frozen: the
   * messages that were waiting have not been read yet, and the silence would be ours, not the server's. */
  barrer(ahora: number, oculta = false): boolean {
    const hueco = ahora - this.ultimoBarrido; this.ultimoBarrido = ahora;
    if (oculta || hueco > Math.max(1000, this.umbral * 0.7)) { this.oido = ahora; this._callado = false; return false; }
    if (!this._callado && ahora - this.oido > this.umbral) { this._callado = true; return true; }
    return false;
  }
}
