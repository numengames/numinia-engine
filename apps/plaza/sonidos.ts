// Make everything sound (S6s, merged with S6 in S6f): the page hooks onto what happens in the world. Only glue is here:
// every engine function stays where it is and is only listened to.
//
// Everything goes through the SINGLE DOOR (`packages/render/src/audio/sonar.ts`): the catalogue file if there is one, and if not the
// recipe of `sintesis.ts`. This page no longer calls the synthesiser: so there is one voice cap, one cooldown and
// one place to look when something does not sound.
//
// SPLIT OF AUTHORITY (D-048: the server rules what is shared):
//  - LOCAL (everyone hears their own, here): the interface buttons, MY steps, MY jump, MY landing, and what only
//      happens at my fishing rod (the cast and the splash). They are not sent over the network: they belong to each person and sit at the head
//      or at my feet. Also the VOICE of an NPC when MY conversation with it opens and closes (`pnj-voz.ts`): the chat is
//      mine, so only I hear it, but it comes from the person, placed in 3D.
//  - SHARED (sent by the SERVER, with its seed, from `features/sonido/server.ts`): the door, the dice, the
//      dart (thrown and impact), the caught fish and the teleport — both mine and another person's. This page
//      does NOT trigger them: if it did, each person would hear their own variant, and whoever stood beside them would hear something else.
//      `COMPARTIDOS` is that list, and `sonarLocal` refuses to play any of them (if someday someone tries,
//      it shows up in the log once and does not sound).
//  - Waiting on a server event (they stay LOCAL, noted in docs/BACKLOG.md): the LOCK (its event
//      `cerradura.abierta` does not say where it is) and the MACHINE (`movedores.llegada` neither).
import { audio, type Nucleo } from "../../packages/render/src/audio/nucleo.ts";
import { crearPuerta, materialDeSuelo, MATERIAL_DEF, type Material, type Opciones, type Puerta } from "../../packages/render/src/audio/sonar.ts";
import { puente } from "./sonar.ts";
import { montarVozPnj, type ConversacionPnj } from "./pnj-voz.ts";

export type Cuerpo = { y: number; speed: number; grounded: boolean };
export type Paso = "izquierdo" | "derecho" | "salto" | "aterrizaje";

/** What ONE foot advances (m), not the whole stride: each foot that lands sounds once. With the engine's speed
 *  (walking 1.5 m/s, running 4: packages/sim) that gives ≈ 2 steps per second walking and ≈ 2.9 running, a person's cadence.
 *  Before, one sounded per 1.4 m: walking, a single foot every second. */
export const PASO_M = { camina: 0.75, corre: 1.4 } as const;
/** Above this speed (m/s) it runs (walking 1.5, running 4). */
export const UMBRAL_CORRE = 2.5;
/** You must have been this long in the air (s) for the landing to sound: stepping down a stair is not a thump. */
export const AIRE_MIN_S = 0.25;

/** The sounds ONLY the server sends: this page refuses to play them by itself (D-048). */
export const COMPARTIDOS: readonly string[] = ["puerta", "dados", "dardo-lanzar", "dardo-impacto", "pesca-cobrar", "teleport"];

/** Footstep machine: given the body and the time that passed, returns the sounds due. No DOM, no audio. */
export function crearPasos() {
  let yAntes: number | null = null, enAire = false, aire = 0, dist = 0, quieto = true, izquierdo = false;
  return function paso(c: Cuerpo, dt: number): Paso[] {
    const fuera: Paso[] = [];
    const sube = yAntes !== null && c.y - yAntes > 0.04;
    yAntes = c.y;
    if (!c.grounded) {
      if (!enAire) { enAire = true; aire = 0; dist = 0; if (sube) fuera.push("salto"); }
      aire += dt;
      return fuera;
    }
    if (enAire) { enAire = false; if (aire >= AIRE_MIN_S) fuera.push("aterrizaje"); aire = 0; }
    const z = c.speed > UMBRAL_CORRE ? PASO_M.corre : PASO_M.camina;
    if (c.speed < 0.5) { quieto = true; return fuera; }
    // on starting, the first foot lands at half a stride (not at the first centimetre, nor a whole stride later)
    if (quieto) { quieto = false; dist = z / 2; izquierdo = false; }
    dist += c.speed * dt;
    if (dist >= z) { dist -= z; fuera.push(izquierdo ? "izquierdo" : "derecho"); izquierdo = !izquierdo; }
    return fuera;
  };
}

export type Pagina = {
  session: { entity: number; selfPosition(alpha: number): Cuerpo };
  cerraduras: { alCambiar(fn: (q: string) => void): unknown };
  pesca: { estado(): { fase: string }; alCambiar(fn: (q: string) => void): unknown };
  /** The ground type of the zone where I am (`entorno@1`), if the world says. Without it, steps sound like stone. */
  suelo?: () => string | null;
  /** NPC conversations (the page's quests): a greeting on opening, a farewell on closing. */
  misiones?: ConversacionPnj;
};

export type Montado = {
  puerta: Puerta;
  /** Play something LOCAL. Returns false if the id is a shared one (the server sends those) or if nothing sounded. */
  sonarLocal(id: string, o?: Opciones, ms?: number): boolean;
  /** A step with the material that applies (from the zone's ground if the world says; stone if not). */
  paso(material?: Material): boolean;
  desmontar(): void;
};

/** Hooks everything. Returns the door, the local trigger and a function to unmount (tests). */
export function montarSonidos(p: Pagina, puerta: Puerta = crearPuerta({ nucleo: audio() as Nucleo })): Montado {
  const ultimo = new Map<string, number>();
  const dichos = new Set<string>();
  /** The same id does not sound twice within `ms` (bursts of clicks, changes that arrive duplicated). It is a page
   *  brake, on top of the catalogue's cooldown: it cuts interface bounces here, not voices. */
  const sonarLocal = (id: string, o: Opciones = {}, ms = 60): boolean => {
    if (COMPARTIDOS.includes(id)) {
      // it is nobody's fault: it is the split. It is said once so it does not go unnoticed in a future change.
      if (!dichos.has(id)) { dichos.add(id); console.warn(`[sonidos] «${id}» lo manda el servidor (D-048): la página no lo toca`); } // i18n-ok: developer log
      return false;
    }
    const t = performance.now();
    if (t - (ultimo.get(id) ?? -1e9) < ms) return false;
    ultimo.set(id, t);
    return puerta.sonar(id, o);
  };
  const quitar: (() => void)[] = [];
  // the VR pieces (dardos-vr, pesca-sonido) sound through `sonar.ts` without loading this module: here they are given the door
  puente.sonar = sonarLocal;
  quitar.push(() => { if (puente.sonar === sonarLocal) puente.sonar = null; });

  // Buttons do NOT sound (Pablo, 2026-10-19): what would make noise in the world sounds, not the interface. A click is already seen and
  // felt; a tick on top of each one saturates the mix and covers what does inform.

  // The material underfoot. Today the engine only knows the ground type of the ZONE (`entorno@1`: grass, earth, sand,
  // rock, snow, smooth), not a label per surface: a wooden platform over a rock zone still sounds like
  // stone (that is design story S8). With `p.suelo` plugged in, at least grass and rock sound like themselves;
  // without it, stone, which is what there was.
  const materialAhora = (): Material => {
    try { return p.suelo ? materialDeSuelo(p.suelo()) : MATERIAL_DEF; } catch { return MATERIAL_DEF; }
  };
  // Own steps are what repeats most in the whole engine: they must stay UNDER the mix, to be
  // felt more than heard. Each foot sounds different (the left a little lower and softer: nobody steps the same
  // with both) and the door never repeats the same recording twice in a row; on top comes its ±4 % variation of
  // pitch and ±1 dB. Running steps harder than walking.
  const PIE = { izquierdo: { tono: 0.96, gain: 0.85 }, derecho: { tono: 1.02, gain: 1 } } as const;
  const paso = (material: Material = materialAhora(), pie: keyof typeof PIE = "derecho", corre = false): boolean =>
    sonarLocal(`pasos-${material}`, { gain: (corre ? 0.2 : 0.14) * PIE[pie].gain, tono: PIE[pie].tono }, 120);

  // steps, jump and landing: mine, local, at my feet (bus «pasos-propios»)
  const pasos = crearPasos();
  const reloj = setInterval(() => {
    if (p.session.entity < 0) return;
    const c = p.session.selfPosition(1);
    for (const q of pasos(c, 0.05)) {
      if (q === "salto") sonarLocal("salto", { gain: 0.22 }, 150);
      else if (q === "aterrizaje") sonarLocal("aterrizaje", { gain: 0.32 }, 150);
      else paso(undefined, q, c.speed > UMBRAL_CORRE);
    }
  }, 50);
  // in Node (the tests) an interval keeps the process alive forever: `unref` leaves it without a vote
  (reloj as unknown as { unref?: () => void })?.unref?.();
  quitar.push(() => clearInterval(reloj));

  // the lock: LOCAL for now. Its server event (`cerradura.abierta`) does not say where the lock is, so
  // it cannot be sent to «whoever is near» without inventing a place. Noted in docs/BACKLOG.md.
  p.cerraduras.alCambiar((q) => { if (q === "abierta") sonarLocal("cerradura", { gain: 0.8 }, 300); });

  // fishing: the cast and the splash are MINE (my rod, my hand). The caught fish is sent by the server, because
  // those around hear it: it is no longer touched here.
  let faseAntes = p.pesca.estado().fase;
  p.pesca.alCambiar((q) => {
    if (q !== "estado") return;
    const f = p.pesca.estado().fase;
    if (f !== faseAntes && f === "espera" && faseAntes === "nada") {
      sonarLocal("pesca-lanzar", { gain: 0.7 }, 300);
      setTimeout(() => sonarLocal("pesca-chapuzon", { gain: 0.6 }, 300), 450);
    }
    faseAntes = f;
  });

  // an NPC's voice: a greeting on opening the conversation and a farewell on closing it, from its mouth; the lines, silent
  if (p.misiones) quitar.push(montarVozPnj(p.misiones, sonarLocal));

  return { puerta, sonarLocal, paso, desmontar: () => quitar.forEach((f) => f()) };
}
