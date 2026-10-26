// J10 on the page: what your hands do in VR goes to the same verbs as E, a click or the prompt button — the server
// decides every time. Grip (or trigger, or a pinch) next to a quest thing = take it («usar», like «E: coger…»); the
// ray + trigger on a person or a thing = talk to it / use it; the trigger on nothing = whatever is in reach (the
// prompt's thing). Conversations show on a panel in front of you (answer with the ray, or the stick + A; B leaves).
// What you took is drawn in the hand that took it (beside you on a flat screen) until the quest ends.
import { ESTADOS, ahorasDe, estadoPaso } from "./misiones.ts"; // U14 (3): a step's state, the same as in the book
import { LINEAS_MANDOS } from "./xr-mandos.ts"; // the controls sheet's words (test/xr-mandos.test.ts checks them against the bindings)
import { crearAlcance } from "./xr-alcance.ts"; // the ray only lands on what is within reach
type Res = { ok: true } | { ok: false; why: string };
type Lado = "izq" | "der";
type EventoMano = { tipo: "agarrar"; key: string; lado: Lado } | { tipo: "apuntar"; key: string; lado: Lado } | { tipo: "panel"; fila: number; lado: Lado } | { tipo: "gatillo"; lado: Lado } | { tipo: "gatillo_fin"; lado: Lado } | { tipo: "soltar"; que: string; lado: Lado } | { tipo: "salto" };
type Misiones = {
  estado: { nota: string };
  libro(): { id: string; estado: string; titulo: string; paso: number; pasos: number; seguida: boolean; lista: { n: number; texto: string; tipo: string; hecho: boolean; que: string }[] }[];
  objetivos(): { mision: string; paso: number }[];
  dialogo(): { pnj: string; nombre: string; texto: string; opciones: string[] } | null;
  elegir(n: number): Res; adios(): Res; usar(cosa: string): Res;
  ofrece(feature: string, key: string): boolean;
  alCambiar(fn: (que: "libro" | "dialogo" | "nota") => void): () => void;
};
type Vista = {
  vr: { active: boolean; pagina: "mision" | "mandos" | "ajustes"; dialogo(d: { nombre: string; texto: string; opciones: string[] } | null): void; nota(t: string): void; onElegir(fn: (n: number) => void): unknown; onAtras(fn: () => void): unknown };
  ar: { state: string };
  manos: { reglas(o: { agarrable?: (k: string) => boolean; apuntable?: (k: string) => boolean }): void; on(fn: (e: EventoMano) => void): unknown; vibrar(l: Lado, v?: number, ms?: number): void;
    llevable?(nombre: string, l: { que: string; lado(): Lado | null; puede(): true | string; pasar(a: Lado): void; soltar?(): true | string }): () => void };
  llevar(key: string, donde: Lado | "yo" | null): void;
  llevando(): Record<string, string>;
};
type Sesion = { selfPosition?(alpha: number): { x: number; y: number; z: number }; features: { use(feature: string, key: string): Res; reachable?(x: number, z: number, y?: number): { feature: string; key: string }[] } };
type Interaccion = { actual(): { prompt: string } | null; usar(): Res; mirar(): void; mantener: { empezar(): void; soltar(): void } };

const partir = (k: string): [string, string] => { const i = k.indexOf(":"); return i < 1 ? ["", ""] : [k.slice(0, i), k.slice(i + 1)]; };

/** J4 in VR: things with a link (apps/plaza/enlaces.ts): the ray can point at them and the trigger asks, in a panel, before opening. */
type EnlacesVR = { tiene(key: string): boolean; url(key: string): string | null; abrir(url: string): void };

/** MIS-222: holes you may fill (apps/plaza/huecos.ts): the ray can aim at one and the trigger opens the VR menu's «Obra» view. */
type HuecosVR = { llenable(key: string): boolean; pinchar(key: string): boolean };

export function montarXR(o: { session: Sesion; view: Vista; misiones: Misiones; interaccion: Interaccion; enlaces?: EnlacesVR; huecos?: HuecosVR }) {
  const { view, misiones, session } = o;
  const pendiente = new Map<string, Lado>(); // quest thing -> the hand that reached for it (until the server answers)
  const enMano = new Map<string, Lado | "yo">(); // what is drawn where

  // lote 5: the ray is 12 m long but a person talks (and a quest thing is used) only within its radius: far ones are not aimed at
  const alAlcance = crearAlcance({ leer: () => { const p = session.selfPosition?.(1); return p && session.features.reachable ? session.features.reachable(p.x, p.z, p.y) : []; } });
  const hayAlcance = !!session.features.reachable && !!session.selfPosition; // a session without the reach list (a stub): as before
  view.manos.reglas({
    agarrable: (k) => { const [f, key] = partir(k); return f === "misiones" && misiones.ofrece(f, key); },
    apuntable: (k) => { const [f, key] = partir(k); return ((f === "pnj" || (f === "misiones" && misiones.ofrece(f, key))) && (!hayAlcance || alAlcance(f, key))) || (f === "" && !k.includes(":") && (!!o.enlaces?.tiene(k) || !!o.huecos?.llenable(k))); }, // reach limits NPCs/quest things; a picture link (or a hole you may fill) is not limited by it
  });
  // J4 VR: window.confirm cannot show inside an immersive session → the link asks in the dialogue panel; only the person's choice opens it
  let enlacePendiente: string | null = null;
  const cerrarEnlace = () => { enlacePendiente = null; view.vr.dialogo(null); };
  misiones.alCambiar(() => { if (enlacePendiente) cerrarEnlace(); }); // a conversation or a step took the panel: the question is gone, nothing can open by a stray «1»
  const decir = (r: Res) => { if (!r.ok) view.vr.nota(r.why); return r; };
  view.manos.on((e) => {
    if (!view.vr.active) return; // AR: the trigger places the plaza (ar.ts); nothing of the world is in reach
    if (e.tipo === "agarrar") {
      const [, cosa] = partir(e.key);
      pendiente.set(cosa, e.lado);
      if (!decir(misiones.usar(cosa)).ok) pendiente.delete(cosa);
    } else if (e.tipo === "apuntar") {
      if (!e.key.includes(":") && o.huecos?.pinchar(e.key)) return; // MIS-222: a hole: the menu opens on the images to put in it
      const u = o.enlaces?.url(e.key);
      if (u && !e.key.includes(":")) { enlacePendiente = u; view.vr.dialogo({ nombre: "Enlace", texto: `¿Abrir en una pestaña nueva? ${u}`, opciones: ["Abrir", "Ahora no"] }); return; }
      const [f, key] = partir(e.key);
      if (f === "misiones") pendiente.set(key, e.lado);
      decir(session.features.use(f, key));
    } else if (e.tipo === "panel") {
      if (e.fila) decir(misiones.elegir(e.fila));
    } else if (e.tipo === "soltar" || e.tipo === "salto") {
      return; // told to the session log (main.ts); nothing for the world to do here
    } else if (e.tipo === "gatillo_fin") {
      o.interaccion.mantener.soltar(); // J4: releasing the trigger before a held `hold` finishes cancels it
    } else if (o.interaccion.actual()) o.interaccion.mantener.empezar(); // J4: fires at once, or starts the hold
  });
  view.vr.onElegir((n) => {
    if (enlacePendiente) { const u = enlacePendiente; cerrarEnlace(); if (n === 1) o.enlaces?.abrir(u); return; } // «Abrir» = 1; anything else closes it
    decir(misiones.elegir(n));
  });
  view.vr.onAtras(() => { if (enlacePendiente) { cerrarEnlace(); return; } if (misiones.dialogo()) misiones.adios(); });

  // hand to hand (MIS-200): each quest thing drawn in a hand can change hands; if the other hand holds one too, the two swap
  const registros = new Map<string, () => void>();
  // N3 (Pablo, 18-10: «estas cosas se deberían de poder tirar y dejar ahí»): a quest thing you let go of leaves your hand and stays out of it
  // while its step stands. The quest does not change — the server holds what you took; only the hand is free again.
  const dejadas = new Set<string>();
  const registrar = (cosa: string) => {
    if (registros.has(cosa) || !view.manos.llevable) return;
    registros.set(cosa, view.manos.llevable(`misiones:${cosa}`, {
      que: "lo que llevas", puede: () => true,
      soltar: () => {
        if (!enMano.has(cosa)) return "No llevas eso";
        dejadas.add(cosa); view.llevar(`misiones:${cosa}`, null); enMano.delete(cosa); registros.get(cosa)?.(); registros.delete(cosa);
        return true;
      },
      lado: () => { const l = enMano.get(cosa); return l === "izq" || l === "der" ? l : null; },
      pasar: (a) => {
        const antes = enMano.get(cosa); if (!antes) return;
        for (const [c, l] of enMano) if (c !== cosa && l === a) { enMano.set(c, antes); view.llevar(`misiones:${c}`, antes); }
        enMano.set(cosa, a); view.llevar(`misiones:${cosa}`, a);
      },
    }));
  };
  // what you carry: every quest thing a «coge» step of an ACTIVE quest already took
  const llevar = () => {
    const quiero = new Set<string>();
    for (const m of misiones.libro()) if (m.estado === "activa") for (const s of m.lista) if (s.tipo === "coge" && s.hecho && s.que) quiero.add(s.que);
    for (const cosa of [...dejadas]) if (!quiero.has(cosa)) dejadas.delete(cosa); // the step is over: a next quest thing with the same name is carried again
    for (const cosa of dejadas) quiero.delete(cosa);
    for (const [cosa] of enMano) if (!quiero.has(cosa)) { view.llevar(`misiones:${cosa}`, null); enMano.delete(cosa); registros.get(cosa)?.(); registros.delete(cosa); }
    for (const cosa of quiero) {
      if (enMano.has(cosa)) continue;
      const ocupadas = new Set(enMano.values());
      const lado: Lado | "yo" = pendiente.get(cosa) ?? (ocupadas.has("der") ? "izq" : "der");
      if (ocupadas.has(lado)) { // that hand holds something: it goes to the other hand, or beside you
        const otro: Lado = lado === "der" ? "izq" : "der";
        for (const [c, l] of enMano) if (l === lado) { const a: Lado | "yo" = ocupadas.has(otro) ? "yo" : otro; enMano.set(c, a); view.llevar(`misiones:${c}`, a); }
      }
      enMano.set(cosa, lado); view.llevar(`misiones:${cosa}`, lado);
      pendiente.delete(cosa);
      registrar(cosa);
      if (lado !== "yo") view.manos.vibrar(lado, 0.7, 80);
    }
  };
  misiones.alCambiar((que) => {
    if (que === "libro") llevar();
    if (que === "dialogo") { const d = misiones.dialogo(); view.vr.dialogo(d ? { nombre: d.nombre, texto: d.texto, opciones: d.opciones } : null); }
    if (que === "nota" && view.vr.active) view.vr.nota(misiones.estado.nota);
  });
  llevar();

  return {
    /** The VR panel's lines: what the trigger does now, the followed quest and its steps. */
    lineasPanel(): string[] {
      if (view.vr.pagina === "mandos") return [...LINEAS_MANDOS];
      if (view.vr.pagina === "ajustes") return [ // MVL1: ajustes dentro de VR, sin quitarte las gafas
        "Ajustes (Y: ocultar)",
        "Apunta al botón de abajo con el gatillo",
        "para cambiar el confort de movimiento",
        "(la viñeta: bajo, medio o alto).",
      ];
      const out: string[] = [];
      const c = o.interaccion.actual();
      const seg = misiones.libro().find((m) => m.estado === "activa" && m.seguida) ?? misiones.libro().find((m) => m.estado === "activa");
      out.push(seg ? seg.titulo : "Sin misión: habla con alguien");
      if (c) out.push(`Gatillo: ${c.prompt}`);
      if (seg) { // the spec's three states (misiones.ts): ✓ done, → to do now (a grupo's block: several, in any order), □ locked
        const ahoras = ahorasDe(misiones.objetivos());
        for (const s of seg.lista.slice(0, 5)) out.push(`${ESTADOS[estadoPaso(seg, s, ahoras)].vr} ${s.texto}`);
      }
      return out;
    },
    enMano: () => Object.fromEntries(enMano),
  };
}
