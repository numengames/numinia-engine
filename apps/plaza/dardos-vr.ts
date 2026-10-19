// dardos with your hands in VR (loaded by apps/plaza/dardos.ts only where the device has WebXR VR; the 3D side is
// packages/render/src/dardos-vr.ts, the maths of one throw features/dardos/lanzamiento.ts).
// Standing in a turn (the «E: tirar dardos» prompt opened it), a dart is yours to take while you have throws left:
//   · controller: SQUEEZE (grip) takes a dart into that hand; TRIGGER — or letting go of the grip — throws it;
//   · tracked hand: PINCH takes it; opening the pinch throws it.
// The hand's own speed and direction at the release become (x, y, fuerza) on the board — the SAME verb as the mouse HUD
// and the AR wall: `dardos.lanzar(x, y, fuerza, sitio)` — and the server decides where it lands (it re-checks that you
// stand at the throwing line). A gesture that is too slow, backwards or sideways is not a throw: the dart falls from your
// hand and you take another. The OTHER hand may hold anything (a quest thing, the fishing rod): only a hand that holds a
// dart is busy, and a hand over a thing to take or pointing at something keeps its normal verbs.
// Nothing is completed here: the dart flies to where the server says it landed. Sound: only taking the dart is ours
// (`coger-soltar`, local); the throw and the hit are shared, so the SERVER sounds them for everyone (features/sonido).
import { sonar } from "./sonar.ts";
import { DARDOS_TURNO } from "../../features/dardos/client.ts";
import { lanzamiento, velocidadDe, duracionVuelo, FIN_PELLIZCO_MS, V_MIN } from "../../features/dardos/lanzamiento.ts";
import type { Cara, Muestra, V3 } from "../../features/dardos/lanzamiento.ts";

type Lado = "izq" | "der";
type Res = { ok: true } | { ok: false; why: string };
type Dardo = { quien: number; sitio: string; numero: number; x: number; y: number };
type Estado = { sitio: string; dardos: number; aviso: string };
type Controlador = { estado(): Readonly<Estado>; clavados(sitio?: string): Dardo[]; lanzar(x: number, y: number, fuerza: number, sitio?: string): Res; alCambiar(fn: (que: "estado" | "sitios" | "clavados") => void): () => void };
type Vuelo = { resolver(como: "clavado" | "caido", donde?: V3): void };
type Vista = {
  vr: { active: boolean; nota?(t: string): void };
  ar?: { jugando: boolean };
  manos: {
    entrada(l: Lado): { gatillo: number; agarre: number; mano: boolean } | null; vibrar(l: Lado, v?: number, ms?: number): void;
    ocupar(nombre: string, fn: (l: Lado) => boolean): () => void; ocupadaPorOtros(l: Lado, excepto: string): boolean; sondeo(l: Lado): { candidato: string | null; apunta: string | null } | null;
  };
  dardosVR: {
    cargar(): Promise<{
      cara(id: string): Cara | null; puntoMundo(id: string, x: number, y: number): V3 | null;
      enMano(l: Lado | null): boolean; posicion(l: Lado): V3 | null; local(l: Lado): V3 | null; aMundo(v: V3, l: Lado): V3;
      volar(desde: V3, hacia: V3, ms: number, fin?: () => void): Vuelo; soltar(desde: V3, vel: V3): void; cadaCuadro(fn: (dt: number) => void): () => void;
    }>;
  };
};

/** Grip/pinch levels: closing above, opening below (hysteresis, so a trembling finger does not flicker). */
export const CIERRA = 0.6, ABRE = 0.3;
/** Samples kept per hand (ms): enough for the release window plus the pinch lead. */
const GUARDA_MS = 300;
/** A pending throw is forgotten after this long without an answer (ms). */
const PENDIENTE_MS = 4000;

export async function montarDardosVR(o: { dardos: Controlador; view: Vista; yo: () => number }) {
  const { dardos, view } = o;
  const vrd = await view.dardosVR.cargar();
  type Pend = { numero: number; sitio: string; vuelo: Vuelo; cuando: number; resuelto: boolean };
  const pend: Pend[] = [];
  let sosteniendo: { lado: Lado; mando: boolean } | null = null;
  const antes: Record<Lado, { gatillo: boolean; agarre: boolean }> = { izq: { gatillo: false, agarre: false }, der: { gatillo: false, agarre: false } };
  const muestras: Record<Lado, Muestra[]> = { izq: [], der: [] };
  const rastro: unknown[] = []; // the last releases (the e2e reads them when a throw is missed)
  let avisoVisto = "", turnoVisto = "", ultimoTiro: unknown = null;

  const sinResolver = () => pend.filter((p) => !p.resuelto).length;
  const quedan = () => DARDOS_TURNO - dardos.estado().dardos - sinResolver();
  const turno = () => (view.vr.active && !view.ar?.jugando ? dardos.estado().sitio : "");
  /** A hand that may take a dart now: nothing to take with it, nothing under its ray (those keep their own verbs). */
  const puedeCoger = (l: Lado): boolean => {
    if (!turno() || quedan() <= 0 || sosteniendo) return false;
    if (view.manos.ocupadaPorOtros(l, "dardos")) return false; // the rod, a quest thing held there: that hand is not free
    const s = view.manos.sondeo(l);
    return !!s && !s.candidato && !s.apunta;
  };
  // the hand holding a dart is busy (no ray, no pinch-walk, its trigger does not «use»); so is a hand that is closing
  // on a dart this very moment — a pinch fires its «gatillo» before this page's next frame, and must not talk to someone
  view.manos.ocupar("dardos", (l) => {
    if (sosteniendo) return sosteniendo.lado === l;
    if (!puedeCoger(l)) return false;
    const en = view.manos.entrada(l);
    return !!en?.mano && en.gatillo > 0.5;
  });

  // ---- the server's answers: where each dart landed, or why it did not ----
  dardos.alCambiar((que) => {
    if (que === "clavados") {
      const sitio = dardos.estado().sitio || pend[0]?.sitio || "";
      for (const p of pend) {
        if (p.resuelto) continue;
        const d = dardos.clavados(p.sitio || sitio).find((x) => x.quien === o.yo() && x.sitio === p.sitio && x.numero === p.numero);
        if (!d) continue;
        p.vuelo.resolver("clavado", vrd.puntoMundo(p.sitio, d.x, d.y) ?? undefined); p.resuelto = true;
      }
    } else if (que === "estado") {
      const e = dardos.estado();
      if (e.aviso && e.aviso !== avisoVisto) {
        avisoVisto = e.aviso;
        const p = pend.find((x) => !x.resuelto);
        if (p) { p.vuelo.resolver("caido"); p.resuelto = true; view.vr.nota?.(e.aviso); }
      }
    }
  });

  function lanzar(lado: Lado, ahora: number, mando: boolean): void {
    const e = dardos.estado(), sitio = e.sitio, cara = sitio ? vrd.cara(sitio) : null;
    const pos = vrd.posicion(lado);
    const p: V3 = pos ?? [0, 0, 0];
    const vl = velocidadDe(muestras[lado], ahora - (mando ? 0 : FIN_PELLIZCO_MS));
    const v = vl ? vrd.aMundo(vl, lado) : null; // measured in the rig's frame (the avatar walking adds nothing), turned into the world's
    const tiro = cara && pos ? lanzamiento(cara, p, v) : ({ tipo: "suelta", motivo: "sin-velocidad" } as const);
    ultimoTiro = { lado, t: Math.round(ahora), pos: p, n: muestras[lado].length, m: muestras[lado].slice(-8).map((q) => [Math.round(q.t - ahora), Math.round(q.x * 100) / 100, Math.round(q.y * 100) / 100, Math.round(q.z * 100) / 100]), v: v && v.map((n) => Math.round(n * 100) / 100), tiro };
    rastro.push(ultimoTiro); if (rastro.length > 40) rastro.shift();
    sosteniendo = null; // the dart leaves the hand either way
    if (tiro.tipo === "tiro" && sitio) {
      const numero = e.dardos + sinResolver() + 1;
      const r = dardos.lanzar(tiro.x, tiro.y, tiro.fuerza, sitio);
      if (r.ok) {
        const destino = vrd.puntoMundo(sitio, tiro.x, tiro.y) ?? p;
        const vuelo = vrd.volar(p, destino, duracionVuelo(tiro.distancia, tiro.velocidad));
        pend.push({ numero, sitio, vuelo, cuando: ahora, resuelto: false });
        view.manos.vibrar(lado, 0.5, 50);
        return;
      }
      view.vr.nota?.(r.why);
    } else if (tiro.tipo === "suelta" && tiro.motivo === "lento") view.vr.nota?.("Más fuerte: lanza con un movimiento rápido hacia la diana");
    else if (tiro.tipo === "suelta" && tiro.motivo === "atras") view.vr.nota?.("Lánzalo hacia la diana");
    // not a throw (too slow, backwards, rejected): the dart falls from the hand and goes away
    vrd.enMano(null);
    if (pos) vrd.soltar(pos, [(v?.[0] ?? 0) * 0.3, Math.min(0, (v?.[1] ?? 0) * 0.3), (v?.[2] ?? 0) * 0.3]);
  }

  vrd.cadaCuadro(() => {
    const ahora = performance.now();
    for (let i = pend.length - 1; i >= 0; i--) if (ahora - pend[i].cuando > PENDIENTE_MS) pend.splice(i, 1);
    const sitio = turno();
    if (sitio !== turnoVisto) {
      if (sitio) view.vr.nota?.("Dardos: agarre coge un dardo · gatillo (o soltar) lo lanza");
      turnoVisto = sitio;
    }
    for (const l of ["izq", "der"] as Lado[]) {
      const en = view.manos.entrada(l);
      const m = muestras[l];
      if (en && view.vr.active) {
        const q = vrd.local(l);
        if (q) { m.push({ t: ahora, x: q[0], y: q[1], z: q[2] }); while (m.length && ahora - m[0].t > GUARDA_MS) m.shift(); }
      } else m.length = 0;
      const gatillo = !!en && (en.mano ? en.gatillo > 0.5 : en.gatillo > (antes[l].gatillo ? ABRE : CIERRA));
      const agarre = !!en && !en.mano && en.agarre > (antes[l].agarre ? ABRE : CIERRA);
      const subeG = gatillo && !antes[l].gatillo, subeA = agarre && !antes[l].agarre, bajaG = !gatillo && antes[l].gatillo, bajaA = !agarre && antes[l].agarre;
      antes[l] = { gatillo, agarre };
      if (sosteniendo?.lado === l) {
        if (!en || !sitio) { sosteniendo = null; vrd.enMano(null); continue; } // controller asleep, hand lost, or the turn ended
        if (sosteniendo.mando ? subeG || bajaA : bajaG) lanzar(l, ahora, sosteniendo.mando);
      } else if (!sosteniendo && en && sitio && (en.mano ? subeG : subeA) && puedeCoger(l)) {
        if (vrd.enMano(l)) { sosteniendo = { lado: l, mando: !en.mano }; view.manos.vibrar(l, 0.4, 40); sonar("coger-soltar", { gain: 0.5 }, 150); }
      }
    }
    if (sosteniendo && !sitio) { sosteniendo = null; vrd.enMano(null); }
  });

  return {
    sosteniendo: () => sosteniendo?.lado ?? null, pendientes: () => pend.map((p) => ({ numero: p.numero, resuelto: p.resuelto })),
    rastro: () => rastro.slice(), ultimo: () => ultimoTiro, vmin: V_MIN,
  };
}
