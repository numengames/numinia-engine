// J10 on the page: what your hands do in VR goes to the same verbs as E, a click or the prompt button — the server
// decides every time. Grip (or trigger, or a pinch) next to a quest thing = take it («usar», like «E: coger…»); the
// ray + trigger on a person or a thing = talk to it / use it; the trigger on nothing = whatever is in reach (the
// prompt's thing). Conversations show on a panel in front of you (answer with the ray, or the stick + A; B leaves).
// What you took is drawn in the hand that took it (beside you on a flat screen) until the quest ends.
import { ESTADOS, ahorasDe, estadoPaso } from "./misiones.ts"; // U14 (3): a step's state, the same as in the book
import { LINEAS_MANDOS } from "./xr-mandos.ts"; // the controls sheet's words (test/xr-mandos.test.ts checks them against the bindings)
type Res = { ok: true } | { ok: false; why: string };
type Lado = "izq" | "der";
type EventoMano = { tipo: "agarrar"; key: string; lado: Lado } | { tipo: "apuntar"; key: string; lado: Lado } | { tipo: "panel"; fila: number; lado: Lado } | { tipo: "gatillo"; lado: Lado } | { tipo: "gatillo_fin"; lado: Lado };
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
  manos: { reglas(o: { agarrable?: (k: string) => boolean; apuntable?: (k: string) => boolean }): void; on(fn: (e: EventoMano) => void): unknown; vibrar(l: Lado, v?: number, ms?: number): void };
  llevar(key: string, donde: Lado | "yo" | null): void;
  llevando(): Record<string, string>;
};
type Sesion = { features: { use(feature: string, key: string): Res } };
type Interaccion = { actual(): { prompt: string } | null; usar(): Res; mirar(): void; mantener: { empezar(): void; soltar(): void } };

const partir = (k: string): [string, string] => { const i = k.indexOf(":"); return i < 1 ? ["", ""] : [k.slice(0, i), k.slice(i + 1)]; };

export function montarXR(o: { session: Sesion; view: Vista; misiones: Misiones; interaccion: Interaccion }) {
  const { view, misiones, session } = o;
  const pendiente = new Map<string, Lado>(); // quest thing -> the hand that reached for it (until the server answers)
  const enMano = new Map<string, Lado | "yo">(); // what is drawn where

  view.manos.reglas({
    agarrable: (k) => { const [f, key] = partir(k); return f === "misiones" && misiones.ofrece(f, key); },
    apuntable: (k) => { const [f, key] = partir(k); return f === "pnj" || (f === "misiones" && misiones.ofrece(f, key)); },
  });
  const decir = (r: Res) => { if (!r.ok) view.vr.nota(r.why); return r; };
  view.manos.on((e) => {
    if (!view.vr.active) return; // AR: the trigger places the plaza (ar.ts); nothing of the world is in reach
    if (e.tipo === "agarrar") {
      const [, cosa] = partir(e.key);
      pendiente.set(cosa, e.lado);
      if (!decir(misiones.usar(cosa)).ok) pendiente.delete(cosa);
    } else if (e.tipo === "apuntar") {
      const [f, key] = partir(e.key);
      if (f === "misiones") pendiente.set(key, e.lado);
      decir(session.features.use(f, key));
    } else if (e.tipo === "panel") {
      if (e.fila) decir(misiones.elegir(e.fila));
    } else if (e.tipo === "gatillo_fin") {
      o.interaccion.mantener.soltar(); // J4: releasing the trigger before a held `hold` finishes cancels it
    } else if (o.interaccion.actual()) o.interaccion.mantener.empezar(); // J4: fires at once, or starts the hold
  });
  view.vr.onElegir((n) => { decir(misiones.elegir(n)); });
  view.vr.onAtras(() => { if (misiones.dialogo()) misiones.adios(); });

  // what you carry: every quest thing a «coge» step of an ACTIVE quest already took
  const llevar = () => {
    const quiero = new Set<string>();
    for (const m of misiones.libro()) if (m.estado === "activa") for (const s of m.lista) if (s.tipo === "coge" && s.hecho && s.que) quiero.add(s.que);
    for (const [cosa] of enMano) if (!quiero.has(cosa)) { view.llevar(`misiones:${cosa}`, null); enMano.delete(cosa); }
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
