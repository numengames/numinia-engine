// lucha — client part (v1, L1). Draws each creature as the house block (`casa/bloque.glb`, 1 m, CC0) scaled to its box
// and painted in its sheet's colour, through the same `view.place` every placed thing uses (one draw call, no new 3D
// code, click-to-interact understood as `lucha:<key>`), and a name over it (`view.tag`). Feedback is cheap and all by
// state: the tint fades towards grey as coherence drops; a blow flashes the block white for 80 ms and shows «−N» in the
// tag for 700 ms; a dissolved creature is taken out of the scene; a returned one comes back. The page only asks
// (`golpear`); the server decides. Nothing here touches the simulation. PVP (L8): the `estado` event puts the rung
// (icon + word, ROTULO) over the struck person through `view.label`, for whoever sees the blow; `reaparece` clears it.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg, PlacedObject } from "../../packages/feature/src/index.ts";
import { lucha as decl } from "./feature.ts";
import type { Estado } from "./estados.ts";
import biblioteca from "../objetos/biblioteca.json" with { type: "json" };

const BLOQUE = biblioteca.modelos.find((m) => m.id === "bloque")?.modelo ?? "";
/** The white flash on a blow (ms) and how long «−N» stays in the name (ms). */
export const FLASH_MS = 80, DANO_MS = 700;
/** Flash colour of a critical (gold, not white) and its damage text. */
export const COLOR_CRITICO = "#ffd24a";
export const textoDano = (dano: number, critico: boolean): string => (critico ? `  ¡CRÍTICO! −${dano}` : `  −${dano}`);
/** Grey the colour fades to as coherence drops (PRI-008: flat colour, no new effect). */
const GRIS = [0x6e, 0x6e, 0x6e];

/** How long a person's Estado label stays over them (ms) before it fades; each new blow renews it. */
export const ESTADO_MS = 8000, REAPARECE_MS = 2500;
/** The icon + word over a person at each rung (same pattern as the creatures' coherence tint: by state, flat text, no new 3D). */
export const ROTULO: Record<Estado, string> = { ninguno: "", desestabilizado: "≈ Desestabilizado", confundido: "? Confundido", colapsado: "‼ Colapsado", aletargado: "☾ Aletargado" };

export type Criatura = { key: string; nombre: string; especie: string; x: number; y: number; z: number; radio: number; coherencia: number; coherenciaMax: number; modo: string; solido: boolean };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función lucha no está en este servidor" };

/** «#rrggbb» mixed towards grey by (1 − coherencia/max) (pure; tests use it). */
export function tinte(color: string, coherencia: number, max: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m || max <= 0) return color;
  const k = Math.max(0, Math.min(1, coherencia / max));
  const c = [1, 2, 3].map((i, j) => Math.round(parseInt(m[i], 16) * k + GRIS[j] * (1 - k)));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
/** How a creature looks: the house block scaled to its box, at its place, in its (faded) colour; `flash` paints it white. */
export function aspecto(v: Msg, flash: boolean | string = false): PlacedObject & { color: string } {
  const r = (n: number) => Math.round(n * 100) / 100, sx = r(Number(v.bx1) - Number(v.bx0)), sy = r(Number(v.by1) - Number(v.by0)), sz = r(Number(v.bz1) - Number(v.bz0));
  return { model: BLOQUE, x: Number(v.x), y: Number(v.y) || 0, z: Number(v.z), rx: 0, ry: 0, rz: 0, sx, sy, sz, animate: false, color: flash ? (typeof flash === "string" ? flash : "#ffffff") : tinte(String(v.color), Number(v.coherencia), Number(v.coherenciaMax)) };
}
const nombre = (v: Msg, extra = "") => ({ text: `${v.nombre}${extra}`, x: Number(v.x), y: (Number(v.y) || 0) + (Number(v.by1) - Number(v.by0)) + 0.5, z: Number(v.z) });

/** One per page (tests make one per client). `lucha` is what the page and an agent call; `espia` sees every event (tests). */
export function crearCliente(espia?: (event: string, msg: Msg) => void) {
  let A: ClientApi | null = null;
  const temporizadores = new Map<string, ReturnType<typeof setTimeout>[]>();
  const oyentes = new Set<() => void>();
  const avisar = () => { for (const fn of oyentes) fn(); };
  let ultimo = "";
  const estados = new Map<number, Estado>();     // person (entity) → last rung this page heard; forgotten on reaparece
  let carga = 0;                                   // my Carga (0..100), as the server last said
  const luego = (key: string, ms: number, fn: () => void) => { const l = temporizadores.get(key) ?? []; l.push(setTimeout(fn, ms)); temporizadores.set(key, l); };
  const limpiar = (key: string) => { for (const t of temporizadores.get(key) ?? []) clearTimeout(t); temporizadores.delete(key); };
  const dibujar = (key: string, v: Msg | undefined) => {
    if (!A) return;
    if (!v || v.modo === "disuelta") { A.view.place?.(`lucha:${key}`, null); A.view.tag?.(`lucha:${key}`, null); return; }
    A.view.place?.(`lucha:${key}`, aspecto(v));
    A.view.tag?.(`lucha:${key}`, nombre(v));
  };

  const lucha = {
    /** The creatures this page knows (state entries within the area of interest), dissolved ones included. */
    criaturas: (): Criatura[] => (A ? A.state.keys().map((k) => ({ key: k, ...(A!.state.get(k) as Msg) }) as Criatura) : []),
    /** The Estado of a person (`p:<entity>`'s number) as this page last heard it: ninguno when it heard nothing. */
    estadoDe: (entidad: number): Estado => estados.get(entidad) ?? "ninguno",
    /** The last line worth showing (a rejection). */
    aviso: () => ultimo,
    golpear: (objetivo?: string): Res => {
      if (!A) return SIN;
      const key = objetivo ?? lucha.criaturas().find((c) => c.modo !== "disuelta")?.key;
      if (!key) return { ok: false, why: "no hay ninguna criatura cerca" };
      A.send("golpear", { objetivo: key });
      return { ok: true };
    },
    /** Ask the server to use an ability of the kit on a creature (default: the first one standing). The server decides. */
    habilidad: (cual: string, objetivo?: string): Res => {
      if (!A) return SIN;
      const key = objetivo ?? lucha.criaturas().find((c) => c.modo !== "disuelta")?.key;
      if (!key) return { ok: false, why: "no hay ninguna criatura cerca" };
      A.send("habilidad", { objetivo: key, cual });
      return { ok: true };
    },
    /** My Carga (0..100), as the server last said. */
    carga: (): number => carga,
    /** J4: the prompt «E: golpear a …» is offered for every creature that is not dissolved. */
    ofrece: (feature: string, key: string): boolean => feature !== "lucha" || A?.state.get(key)?.modo !== "disuelta",
    alCambiar: (fn: () => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const part: ClientPart = clientPart(decl, (a) => {
    A = a;
    a.state.onChange((key, v) => { dibujar(key, v); avisar(); });
    a.on("golpe", (m) => {
      espia?.("golpe", m);
      const key = String(m.objetivo), v = a.state.get(key);
      if (!v || v.modo === "disuelta") return;
      limpiar(key);
      a.view.place?.(`lucha:${key}`, aspecto(v, true));
      a.view.tag?.(`lucha:${key}`, nombre(v, `  −${m.dano}`));
      luego(key, FLASH_MS, () => { const w = a.state.get(key); if (w && w.modo !== "disuelta") a.view.place?.(`lucha:${key}`, aspecto(w)); });
      luego(key, DANO_MS, () => { const w = a.state.get(key); if (w && w.modo !== "disuelta") a.view.tag?.(`lucha:${key}`, nombre(w)); });
    });
    a.on("carga", (m) => { espia?.("carga", m); carga = Number(m.valor); avisar(); });
    a.on("habilidad", (m) => {                      // same feedback as a blow; a critical flashes gold and shows ¡CRÍTICO!
      espia?.("habilidad", m);
      const key = String(m.objetivo), v = a.state.get(key), crit = m.critico === true;
      if (!v || v.modo === "disuelta") return;
      limpiar(key);
      a.view.place?.(`lucha:${key}`, aspecto(v, crit ? COLOR_CRITICO : true));
      a.view.tag?.(`lucha:${key}`, nombre(v, textoDano(Number(m.dano), crit)));
      luego(key, crit ? FLASH_MS * 3 : FLASH_MS, () => { const w = a.state.get(key); if (w && w.modo !== "disuelta") a.view.place?.(`lucha:${key}`, aspecto(w)); });
      luego(key, DANO_MS, () => { const w = a.state.get(key); if (w && w.modo !== "disuelta") a.view.tag?.(`lucha:${key}`, nombre(w)); });
    });
    a.on("critico", (m) => { espia?.("critico", m); });
    a.on("aire", (m) => { espia?.("aire", m); });
    a.on("estado", (m) => {
      espia?.("estado", m);
      const e = Number(String(m.objetivo).slice(2)), est = m.estado as Estado;
      if (!Number.isInteger(e) || !(est in ROTULO)) return;
      estados.set(e, est);
      if (ROTULO[est]) a.view.label(e, ROTULO[est], ESTADO_MS);   // over the target, for whoever aims at them (and for them)
      avisar();
    });
    a.on("reaparece", (m) => {
      espia?.("reaparece", m);
      const e = Number(String(m.objetivo).slice(2));
      if (!Number.isInteger(e)) return;
      estados.delete(e);
      a.view.label(e, "Reaparece", REAPARECE_MS);
      avisar();
    });
    a.on("disuelta", (m) => { espia?.("disuelta", m); limpiar(String(m.objetivo)); });
    a.on("vuelve", (m) => { espia?.("vuelve", m); });
    a.on("rechazado", (m) => { espia?.("rechazado", m); ultimo = String(m.motivo); avisar(); });
  });
  return { part, lucha };
}

const porDefecto = crearCliente();
/** The page's controller (apps/plaza) and the part the plug list uses. */
export const lucha = porDefecto.lucha;
export default porDefecto.part;
