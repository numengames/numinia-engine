// pantallas (M18 trozo 3): the server's rules for «a person shows their screen on a video screen of the world». Pure: the instance hands it
// the world (where the screens are, where people stand, who may do what, how to send) and it decides, so test/pantalla-red.test.ts runs it
// with no sockets. Nothing here opens a frame: pieces go through as bytes, never decoded and never stored (the voice's rule, U10).
//
// Rules (the server decides, no client is trusted):
//  - one share per screen and one per person; the second to ask for a busy screen is refused («ocupada»); asking for another screen
//    while sharing moves the share;
//  - to start you must stand within PANTALLA_EMITIR_M of that screen, which must exist; the world's gate and visits-by-link are the
//    instance's business (`puedeEmitir`);
//  - anyone may stop their own; who may stop another's is `puedeParar` (the world's roles: dirigir or mandar);
//  - the sharer leaving, going far from the screen, or the screen being deleted ends the share and every viewer is told;
//  - viewers are the people within PANTALLA_VER_M of the screen (with hysteresis) that `puedeVer` allows (private bubbles, blocks);
//    far away they get nothing — not the state, not a byte;
//  - bandwidth guard: PANTALLA_BYTES_S per share (a bucket of 1.5 s); a frame that does not fit is dropped whole, and so is every delta
//    after it until the next key frame, which the sharer is asked for (once a second at most). A viewer that arrives mid-stream is sent
//    nothing until the next key frame, which the sharer is asked for too.
import {
  PANTALLA_TIPO, PANTALLA_EMPEZAR, PANTALLA_PARAR, PANTALLA_TRAMA_SUBIDA, PANTALLA_MOTIVO, PANTALLA_EMITIR_M, PANTALLA_VER_M, PANTALLA_BYTES_S, PANTALLA_FPS, PANTALLA_FRAGMENTO,
  leerPantallaEmpezar, leerPantallaParar, leerPantallaTramaSubida, bajarPantallaTrama, codificarPantallaEstado, codificarPantallaPideClave,
} from "../../net/src/index.ts";

export type PantallaMundo = { key: string; x: number; z: number };
export type MundoPantallas = {
  /** The video screens of the world and where they stand (metres). */
  pantallas(): readonly PantallaMundo[];
  /** Where an entity stands (metres), or null when it is gone. */
  posicion(entidad: number): { x: number; z: number } | null;
  /** Everybody connected (entity numbers): the candidates to see. */
  entidades(): Iterable<number>;
  puedeEmitir(entidad: number): boolean;
  /** May `entidad` stop somebody else's share? (dirigir or mandar in the world's roles.) */
  puedeParar(entidad: number): boolean;
  /** May `espectador` receive what `emisor` shows? (private bubbles, personal blocks.) */
  puedeVer(emisor: number, espectador: number): boolean;
  enviar(entidad: number, bytes: Uint8Array): void;
};
type Espectador = { esperaClave: boolean };
type Emision = {
  id: number; key: string; emisor: number; codec: number; ancho: number; alto: number;
  espectadores: Map<number, Espectador>;
  cubo: number;                 // bytes allowed right now
  actual: number;               // sequence of the frame whose pieces are being relayed (-1: none)
  sigIdx: number;               // next piece expected of it
  descartando: boolean;         // the frame in flight is being dropped
  esperaClave: boolean;         // a frame was dropped: deltas are dropped until a key frame
  ventana: { desde: number; piezas: number; cuadros: number }; // pieces and frames this second
  pedidaClave: number;          // tick of the last key-frame request
  desde: number;
};

export const CUBO_S = 1.5;            // the bucket holds this many seconds of PANTALLA_BYTES_S
const TICKS_S = 20, REVISION = 10;    // the instance ticks at 20 Hz; viewers are looked at every half second
const HISTERESIS_M = 5, EMISOR_LEJOS_M = PANTALLA_EMITIR_M * 1.5;
const PANTALLA_PIEZAS_S = 400;        // pieces a second one sharer may send, whatever their size (a flood of tiny ones)
const PANTALLA_CUADROS_MAX = Math.round(PANTALLA_FPS * 1.5); // frames a second (the page sends PANTALLA_FPS)

export class Pantallas {
  private readonly m: MundoPantallas;
  private readonly porId = new Map<number, Emision>();
  private idSig = 0;
  /** For the server's /status and the tests. */
  readonly stats = { empezadas: 0, rechazadas: 0, paradas: 0, tramas: 0, bajadas: 0, descartadas: 0, bytesEntrada: 0, bytesSalida: 0, clavesPedidas: 0 };
  constructor(m: MundoPantallas) { this.m = m; }

  /** Live shares now (for tests and /status). */
  vivas(): { id: number; key: string; emisor: number; espectadores: number[] }[] {
    return [...this.porId.values()].map((e) => ({ id: e.id, key: e.key, emisor: e.emisor, espectadores: [...e.espectadores.keys()] }));
  }
  de(emisor: number): Emision | undefined { for (const e of this.porId.values()) if (e.emisor === emisor) return e; return undefined; }
  deClave(key: string): Emision | undefined { for (const e of this.porId.values()) if (e.key === key) return e; return undefined; }

  /** A PANTALLA message from `entidad`. False when it was malformed (the instance counts it as «bad»). */
  recibir(entidad: number, b: Uint8Array, tick: number): boolean {
    if (b[0] !== PANTALLA_TIPO) return false;
    if (b[1] === PANTALLA_TRAMA_SUBIDA) { const t = leerPantallaTramaSubida(b); if (!t) return false; this.trama(entidad, b, t, tick); return true; }
    if (b[1] === PANTALLA_EMPEZAR) { const e = leerPantallaEmpezar(b); if (!e) return false; this.empezar(entidad, e, tick); return true; }
    if (b[1] === PANTALLA_PARAR) { const k = leerPantallaParar(b); if (k === null) return false; this.parar(entidad, k); return true; }
    return false;
  }

  private rechazo(entidad: number, key: string, motivo: number): void {
    this.stats.rechazadas++;
    this.m.enviar(entidad, codificarPantallaEstado({ id: 0, vivo: false, motivo, emisor: entidad, codec: 0, ancho: 0, alto: 0, puedeParar: false, key }));
  }

  empezar(entidad: number, p: { codec: number; ancho: number; alto: number; key: string }, tick: number): void {
    const pantalla = this.m.pantallas().find((q) => q.key === p.key);
    if (!pantalla) return this.rechazo(entidad, p.key, PANTALLA_MOTIVO.noExiste);
    if (!this.m.puedeEmitir(entidad)) return this.rechazo(entidad, p.key, PANTALLA_MOTIVO.noPermitido);
    const yo = this.m.posicion(entidad);
    if (!yo || Math.hypot(yo.x - pantalla.x, yo.z - pantalla.z) > PANTALLA_EMITIR_M) return this.rechazo(entidad, p.key, PANTALLA_MOTIVO.lejos);
    const suya = this.de(entidad);
    if (suya && suya.key === p.key) { // asking again for the same screen: the answer again, nothing changes
      this.m.enviar(entidad, this.estadoDe(suya, entidad)); return;
    }
    const ocupante = this.deClave(p.key);
    if (ocupante) return this.rechazo(entidad, p.key, PANTALLA_MOTIVO.ocupada);
    if (suya) this.terminar(suya, PANTALLA_MOTIVO.fin); // moving the share to another screen
    let id = 0;
    do { this.idSig = (this.idSig % 65535) + 1; id = this.idSig; } while (this.porId.has(id));
    const e: Emision = { id, key: p.key, emisor: entidad, codec: p.codec, ancho: p.ancho, alto: p.alto, espectadores: new Map(), cubo: PANTALLA_BYTES_S * CUBO_S, actual: -1, sigIdx: 0, descartando: false, esperaClave: false, ventana: { desde: tick, piezas: 0, cuadros: 0 }, pedidaClave: tick - TICKS_S, desde: tick };
    this.porId.set(id, e); this.stats.empezadas++;
    this.m.enviar(entidad, this.estadoDe(e, entidad));
    this.revisarEspectadores(e, tick);
  }

  /** `key` = "" is the sender's own share. */
  parar(entidad: number, key: string): void {
    const e = key === "" ? this.de(entidad) : this.deClave(key);
    if (!e) return;
    if (e.emisor === entidad) { this.terminar(e, PANTALLA_MOTIVO.fin); return; }
    if (!this.m.puedeParar(entidad)) { this.stats.rechazadas++; return; }
    this.terminar(e, PANTALLA_MOTIVO.moderacion);
  }

  /** The person (or its connection) is gone: its share ends and it stops being anybody's viewer. */
  salir(entidad: number): void {
    const e = this.de(entidad);
    if (e) this.terminar(e, PANTALLA_MOTIVO.seFue);
    for (const q of this.porId.values()) q.espectadores.delete(entidad);
  }

  /** Called every instance tick. Cheap when nobody shares: a size check. */
  tick(tick: number): void {
    if (this.porId.size === 0 || tick % REVISION !== 0) return;
    const pantallas = this.m.pantallas();
    for (const e of [...this.porId.values()]) {
      const p = pantallas.find((q) => q.key === e.key);
      if (!p) { this.terminar(e, PANTALLA_MOTIVO.borrada); continue; }
      const yo = this.m.posicion(e.emisor);
      if (!yo) { this.terminar(e, PANTALLA_MOTIVO.seFue); continue; }
      if (Math.hypot(yo.x - p.x, yo.z - p.z) > EMISOR_LEJOS_M) { this.terminar(e, PANTALLA_MOTIVO.lejos); continue; }
      e.cubo = Math.min(PANTALLA_BYTES_S * CUBO_S, e.cubo + PANTALLA_BYTES_S * (REVISION / TICKS_S));
      this.revisarEspectadores(e, tick, p);
    }
  }

  private estadoDe(e: Emision, para: number): Uint8Array {
    return codificarPantallaEstado({ id: e.id, vivo: true, motivo: 0, emisor: e.emisor, codec: e.codec, ancho: e.ancho, alto: e.alto, puedeParar: para !== e.emisor && this.m.puedeParar(para), key: e.key });
  }
  private terminar(e: Emision, motivo: number): void {
    this.porId.delete(e.id); this.stats.paradas++;
    const fin = (para: number) => this.m.enviar(para, codificarPantallaEstado({ id: e.id, vivo: false, motivo, emisor: e.emisor, codec: e.codec, ancho: e.ancho, alto: e.alto, puedeParar: false, key: e.key }));
    for (const v of e.espectadores.keys()) fin(v);
    e.espectadores.clear();
    if (motivo !== PANTALLA_MOTIVO.seFue && this.m.posicion(e.emisor)) fin(e.emisor); // the sharer is told too, so a stop by the world's owner stops its page
  }
  private pedirClave(e: Emision, tick: number): void {
    if (tick - e.pedidaClave < TICKS_S) return;
    e.pedidaClave = tick; this.stats.clavesPedidas++;
    this.m.enviar(e.emisor, codificarPantallaPideClave(e.id));
  }
  /** Who is within reach now: newcomers are told and wait for a key frame; those who left (or may no longer see) are told it ended for them. */
  private revisarEspectadores(e: Emision, tick: number, p = this.m.pantallas().find((q) => q.key === e.key)): void {
    if (!p) return;
    let nuevos = 0;
    for (const v of this.m.entidades()) {
      if (v === e.emisor) continue;
      const pos = this.m.posicion(v);
      const dentro = e.espectadores.has(v);
      const d = pos ? Math.hypot(pos.x - p.x, pos.z - p.z) : Infinity;
      const alcance = dentro ? PANTALLA_VER_M + HISTERESIS_M : PANTALLA_VER_M;
      if (pos && d <= alcance && this.m.puedeVer(e.emisor, v)) {
        if (!dentro) { e.espectadores.set(v, { esperaClave: true }); nuevos++; this.m.enviar(v, this.estadoDe(e, v)); }
      } else if (dentro) {
        e.espectadores.delete(v);
        this.m.enviar(v, codificarPantallaEstado({ id: e.id, vivo: false, motivo: PANTALLA_MOTIVO.fueraDeAlcance, emisor: e.emisor, codec: e.codec, ancho: e.ancho, alto: e.alto, puedeParar: false, key: e.key }));
      }
    }
    if (nuevos) this.pedirClave(e, tick);
  }

  /** Any frame dropped breaks the chain of deltas after it: from then on only a key frame is accepted, and the sharer is asked for one. */
  private soltar(e: Emision, tick: number): void {
    e.descartando = true; e.esperaClave = true; this.stats.descartadas++; this.pedirClave(e, tick);
  }
  private trama(entidad: number, b: Uint8Array, t: { seq: number; idx: number; n: number; clave: boolean }, tick: number): void {
    const e = this.de(entidad);
    if (!e) return; // not sharing: nothing to relay (a late piece after a stop)
    this.stats.tramas++; this.stats.bytesEntrada += b.length;
    const w = e.ventana;
    if (tick - w.desde >= TICKS_S) { w.desde = tick; w.piezas = 0; w.cuadros = 0; }
    w.piezas++;
    if (t.idx === 0) { // a new frame: the guards decide for the whole of it
      e.actual = -1; e.descartando = false;
      const caben = e.cubo >= (t.n - 1) * PANTALLA_FRAGMENTO + 1;
      if (++w.cuadros > PANTALLA_CUADROS_MAX || w.piezas > PANTALLA_PIEZAS_S || !caben) { this.soltar(e, tick); return; }
      if (e.esperaClave && !t.clave) { e.descartando = true; this.stats.descartadas++; this.pedirClave(e, tick); return; }
      e.actual = t.seq; e.sigIdx = 0;
      if (t.clave) { e.esperaClave = false; for (const v of e.espectadores.values()) v.esperaClave = false; } // a key frame: the ones who waited start here
    } else if (e.descartando) return; // the rest of a dropped frame
    else if (t.seq !== e.actual || t.idx !== e.sigIdx) { this.soltar(e, tick); return; } // out of order or a hole: the frame is lost
    if (w.piezas > PANTALLA_PIEZAS_S) { this.soltar(e, tick); return; }
    e.sigIdx = t.idx + 1; e.cubo -= b.length;
    let out: Uint8Array | null = null;
    for (const [v, s] of e.espectadores) {
      if (s.esperaClave) continue;
      out ??= bajarPantallaTrama(b, e.id);
      this.m.enviar(v, out); this.stats.bajadas++; this.stats.bytesSalida += out.length;
    }
  }
}

/** The video screens of a world, from the shared state of the objects feature (`objetos:<id>`, tipo «video»). Pure. */
export function pantallasDelEstado(estado: Iterable<[string, Record<string, unknown>]>): PantallaMundo[] {
  const out: PantallaMundo[] = [];
  for (const [k, v] of estado) {
    if (!k.startsWith("objetos:") || v.tipo !== "video") continue;
    const x = Number(v.x), z = Number(v.z);
    if (Number.isFinite(x) && Number.isFinite(z)) out.push({ key: k.slice(8), x, z });
  }
  return out;
}
