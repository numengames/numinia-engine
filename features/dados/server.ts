// dados — server part (v1). The server parses the expression, draws every die and tells everyone near the SAME
// values: no page decides a roll. Each die is a uniform draw from `azar` (default: the operating system's random source,
// crypto.getRandomValues, with rejection sampling so 2^32 % caras never favours the low faces); tests pass their own.
// Every roll gets the world's next number (n), so a table can say «the roll 41» and nobody can quietly roll again.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { dados, CARAS, CERCA_M, DADOS_MAX, MOD_MAX } from "./feature.ts";

export type Torre = { id: string; nombre: string; x: number; z: number; y?: number; radio?: number; dados?: string };
export type Tirada = { cuantos: number; caras: number; mod: number };

/** «2d6+1», «d20», «3D8 - 2», «1d100»; also «2d» (= 2d6, the default die) — or why not, in a sentence. */
export function leerExpresion(t: string): Tirada | string {
  const s = String(t ?? "").toLowerCase().replace(/\s+/g, "");
  const m = /^(\d{0,2})d(\d{0,3})(?:([+-])(\d{1,2}))?$/.exec(s);
  if (!m) return `No entiendo «${String(t).slice(0, 16)}»: escribe por ejemplo 2d6+1 o d20.`;
  const cuantos = m[1] === "" ? 1 : Number(m[1]);
  const caras = m[2] === "" ? 6 : Number(m[2]);
  const mod = m[4] ? (m[3] === "-" ? -1 : 1) * Number(m[4]) : 0;
  if (cuantos < 1 || cuantos > DADOS_MAX) return `De 1 a ${DADOS_MAX} dados por tirada.`;
  if (!(CARAS as readonly number[]).includes(caras)) return `Dados de ${CARAS.join(", ")} caras.`;
  if (Math.abs(mod) > MOD_MAX) return `El más o menos va de -${MOD_MAX} a +${MOD_MAX}.`;
  return { cuantos, caras, mod };
}
/** The canonical way to write a roll («2d6+1», «1d20», «3d8-2»). */
export const escribir = (r: Tirada): string => `${r.cuantos}d${r.caras}${r.mod > 0 ? `+${r.mod}` : r.mod < 0 ? `${r.mod}` : ""}`;

/** A 32-bit unsigned integer from the operating system's random source. */
const azarSistema = (): number => { const a = new Uint32Array(1); globalThis.crypto.getRandomValues(a); return a[0]; };
/** One die of `caras` faces from a source of 32-bit numbers, without modulo bias (draws again over the last whole block). */
export function dado(caras: number, azar: () => number = azarSistema): number {
  const tope = Math.floor(4294967296 / caras) * caras;
  for (;;) { const v = azar() >>> 0; if (v < tope) return (v % caras) + 1; }
}
/** Roll an expression already read: each die in order and the total. */
export function tirar(r: Tirada, azar?: () => number): { valores: number[]; total: number } {
  const valores = Array.from({ length: r.cuantos }, () => dado(r.caras, azar));
  return { valores, total: valores.reduce((a, b) => a + b, 0) + r.mod };
}
/** The house's own reading of a pool of d6 (manual de juego, 04-sistema-de-juego: «Cada 6 obtenido es un éxito. Cada 1
 * obtenido es un fallo»): one 1 is free; each 1 after it cancels a 6 and itself. Three or more 6 left = éxito total;
 * one or more = éxito normal; none and no 1 = fallo sin consecuencias; no 6 and some 1 = fracaso. */
export type Lectura = "éxito total" | "éxito normal" | "fallo sin consecuencias" | "fracaso";
export function lecturaD6(valores: number[]): { exitos: number; fallos: number; lectura: Lectura } {
  const seis = valores.filter((v) => v === 6).length, unos = valores.filter((v) => v === 1).length;
  const anula = Math.min(seis, Math.max(0, unos - 1));
  const exitos = seis - anula, fallos = unos - anula;
  return { exitos, fallos, lectura: exitos >= 3 ? "éxito total" : exitos >= 1 ? "éxito normal" : fallos === 0 ? "fallo sin consecuencias" : "fracaso" };
}
/** What a person reads: «Ana tira 2d6+1: 4 · 3 +1 = 8», «Ana tira 1d20: 20 ¡crítico!», «Ana tira 1d20 en secreto». */
export function frase(nombre: string, r: Tirada, valores: number[] | null, total: number): string {
  if (!valores) return `${nombre} tira ${escribir(r)} en secreto`;
  const mod = r.mod > 0 ? ` +${r.mod}` : r.mod < 0 ? ` ${r.mod}` : "";
  const cuenta = r.caras === 6 && r.mod === 0 ? `: ${valores.join(" · ")}` : valores.length > 1 || r.mod ? `: ${valores.join(" · ")}${mod} = ${total}` : `: ${total}`;
  const nota = r.caras === 20 && r.cuantos === 1 ? (valores[0] === 20 ? " ¡crítico!" : valores[0] === 1 ? " pifia" : "")
    : r.caras === 6 && r.mod === 0 ? ` — ${lecturaD6(valores).lectura}` : ""; // a pool of d6: the house reading
  return `${nombre} tira ${escribir(r)}${cuenta}${nota}`;
}
const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};

export const crearDados = (opts: { torres?: Torre[]; azar?: () => number } = {}) => serverPart(dados, (api: ServerApi) => {
  const torres = new Map<string, Torre>();
  for (const t of (opts.torres ?? []).filter((t) => /^[a-z0-9-]{1,16}$/.test(String(t.id)) && Number.isFinite(t.x) && Number.isFinite(t.z))) {
    const propios = t.dados ? leerExpresion(t.dados) : null;
    if (typeof propios === "string") api.log(`dados: la torre «${t.id}» tiene unos dados que no entiendo («${t.dados}»): tira 1d20`);
    const v: Msg = { nombre: cortar(t.nombre || "Torre de dados", 60), x: t.x, y: t.y ?? 0, z: t.z, radio: Math.max(1, Math.min(16, t.radio ?? 2.5)), dados: propios && typeof propios !== "string" ? escribir(propios) : "1d20", ultima: "" };
    if (api.state.set(t.id, v, { at: { x: t.x, z: t.z } })) torres.set(t.id, t); else api.log(`dados: la torre «${t.id}» no cabe en el esquema y no se pone`);
  }
  if (torres.size) api.log(`dados: ${torres.size} torre(s) de dados`);
  let n = 0;
  const nombreDe = (e: number) => cortar(api.who(e)?.nombre ?? `Persona ${e}`, 40) || `Persona ${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e }); };

  const hacer = (e: number, sitio: string, expresion: string, oculta: boolean) => {
    const torre = sitio ? torres.get(sitio) : undefined;
    if (sitio && !torre) return rechazar(e, `No hay ninguna torre de dados «${cortar(sitio, 16)}».`);
    if (torre && !api.within(e, sitio)) return rechazar(e, `Acércate a ${torre.nombre} para tirar ahí.`);
    const donde = torre ? { x: torre.x, z: torre.z } : api.position(e);
    if (!donde) return;
    const texto = expresion.trim() || (torre ? String(api.state.get(sitio)?.dados ?? "1d20") : "1d20");
    const r = leerExpresion(texto);
    if (typeof r === "string") return rechazar(e, r);
    const { valores, total } = tirar(r, opts.azar);
    n += 1;
    const nombre = nombreDe(e), expr = escribir(r);
    const abierta = { quien: e, sitio: torre ? sitio : "", n, dados: expr, valores: valores.join(" "), mod: r.mod, total, oculta, texto: cortar(frase(nombre, r, valores, total), 120) };
    if (oculta) {
      api.emit("tirada", abierta, { to: e });
      const tapada = { ...abierta, valores: "", total: 0, texto: cortar(frase(nombre, r, null, 0), 120) };
      for (const o of api.players()) {
        const p = o === e ? null : api.position(o);
        if (p && Math.hypot(p.x - donde.x, p.z - donde.z) <= CERCA_M) api.emit("tirada", tapada, { to: o });
      }
    } else api.emit("tirada", abierta, { near: donde, radius: CERCA_M });
    if (torre) { const v = api.state.get(sitio)!; api.state.set(sitio, { ...v, ultima: cortar(`${oculta ? `${nombre} · ${expr} en secreto` : `${nombre} · ${expr} → ${valores.join(" ")}${r.mod ? ` ${r.mod > 0 ? "+" : ""}${r.mod}` : ""} = ${total}`}`, 120) }, { at: { x: torre.x, z: torre.z } }); }
    api.log(`[dados] tirada ${n}: ${nombre} ${expr}${oculta ? " (oculta)" : ""} → ${valores.join(" ")} = ${total}`);
  };

  api.on("tirar", (e, m) => hacer(e, String(m.sitio ?? ""), String(m.dados ?? ""), m.oculta === true));

  // the chat (any device with a keyboard, VR included): /tirar 2d6+1 · /tirar d20 oculta · /dados (the tower nearby)
  api.listen("chat", "orden", (m) => {
    const texto = String(m.texto ?? "").trim(), from = Number(m.quien);
    const partes = texto.split(/\s+/), palabra = (partes[0] ?? "").toLowerCase();
    if (palabra !== "tirar" && palabra !== "dados") return false;
    const resto = partes.slice(1).filter((p) => !/^(oculta|oculto|secreto|secreta)$/i.test(p));
    const oculta = resto.length !== partes.length - 1;
    const cerca = [...torres.keys()].find((id) => api.within(from, id)) ?? "";
    hacer(from, cerca, resto.join(""), oculta);
    return true;
  });
});

export default crearDados();
