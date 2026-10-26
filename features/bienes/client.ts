// bienes — client part (N10). Keeps THIS player's goods as the server sends them (each with its signed receipt) and
// offers a small controller the page (apps/plaza/bienes.ts: the «Inventario» of the player sheet) and agents use:
// the list, ask again, download a receipt as a file, check a receipt someone brings (in the page: comprobar.ts). The server decides; the page shows.
// N18: wear a good (llevar: in a hand or on the head; every page draws what each person wears through view.lleva), and
// bring a receipt from another world (traer: checked here first, then the server says whether this world trusts its
// signer; the ones that stay «de otro mundo» are remembered in this browser, `otros`).
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { bienes as decl, unir, PIEZA } from "./feature.ts";
import type { Donde } from "./feature.ts";
import { comprobar } from "./comprobar.ts";

/** `ajeno` = brought from another world this one trusts; `verse` = this server has its model (it can be seen and worn). */
export type BienVista = { id: string; objeto: string; nombre: string; descripcion: string; modelo: string; licencia: string; mundo: string; mision: string; instante: string; recibo: string; ajeno: boolean; verse: boolean };
/** N18: a receipt from another world checked here that this world does not make yours (kept in this browser). */
export type DeOtroMundo = { recibo: string; nombre: string; descripcion: string; licencia: string; modelo: string; mundo: string; emisor: string; instante: string };
/** N18: what this person wears now (from the shared state of their own entity), or null. */
export type Puesto = { modelo: string; donde: Donde; nombre: string };
/** What the page found in a receipt someone brought: real or not, which good, from which world, signed by THIS world,
 * one of YOUR goods here, and a sentence to show. */
export type Presentado = { ok: boolean; nombre: string; mundo: string; nuestro: boolean; tuyo: boolean; motivo: string; confia?: boolean; dado?: boolean };
export const OTROS_GUARDA = "numinia.bienes.otros", OTROS_MAX = 24;
type Guarda = { load(): string | null; save(t: string): void };
const guardaLocal = (): Guarda | null => { try { const l = globalThis.localStorage; return l ? { load: () => l.getItem(OTROS_GUARDA), save: (t) => l.setItem(OTROS_GUARDA, t) } : null; } catch { return null; } };
type Res = { ok: true } | { ok: false; why: string };
const SIN: Res = { ok: false, why: "la función bienes no está en este servidor" };
export { comprobar };

/** The file a player downloads: the receipt plus what a person reads in it (the receipt alone is what counts). */
export function ficheroRecibo(b: BienVista): { nombre: string; texto: string } {
  const limpio = b.nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "bien";
  return {
    nombre: `recibo-${limpio}-${b.id.slice(0, 8)}.json`,
    texto: JSON.stringify({ formato: "numinia-recibo@1", que: b.nombre, de: b.mundo, mision: b.mision, cuando: b.instante, licencia: b.licencia || "sin indicar", recibo: b.recibo, nota: "El recibo (nb1.…) lo firmó el mundo con su clave Ed25519; cualquiera lo comprueba con la clave que lleva dentro (npm run bienes -- verificar <fichero>). Tener el objeto no da los derechos de su arte: mira su licencia." }, null, 2) + "\n",
  };
}
/** The receipt inside whatever a player brings: the downloaded file's JSON, or the bare «nb1.…» text. "" = none. */
export function reciboDe(texto: string): string {
  const t = texto.trim();
  if (t.startsWith("nb1.")) return t;
  try { const o = JSON.parse(t) as { recibo?: unknown }; return typeof o?.recibo === "string" ? o.recibo.trim() : ""; } catch { return ""; }
}

/** `guarda` = where the receipts «de otro mundo» are remembered (default: this browser's localStorage; tests pass one). */
export function crearCliente(o: { guarda?: Guarda | null } = {}) {
  let A: ClientApi | null = null;
  const lista = new Map<string, BienVista>();
  const guarda = o.guarda === undefined ? guardaLocal() : o.guarda;
  let otros: DeOtroMundo[] = [];
  try { const v = JSON.parse(guarda?.load() ?? "[]"); if (Array.isArray(v)) otros = v.filter((x) => x && typeof x.recibo === "string").slice(0, OTROS_MAX); } catch { /* nothing kept */ }
  const guardarOtros = () => { try { guarda?.save(JSON.stringify(otros)); } catch { /* private mode */ } };
  let esperando: ((m: Msg) => void) | null = null;
  let ultimo: Presentado | null = null, nuevo = "", emisor = "";
  const oyentes = new Set<() => void>();
  const avisar = () => { for (const fn of oyentes) { try { fn(); } catch { /* a listener's problem */ } } };

  const control = {
    /** Your goods in this world, oldest first. */
    lista: (): BienVista[] => [...lista.values()].sort((a, b) => a.instante.localeCompare(b.instante) || a.id.localeCompare(b.id)),
    /** The name of the last good you received in this visit ("" = none yet): the page lights the sheet's button. */
    nuevo: () => nuevo,
    visto: () => { if (nuevo) { nuevo = ""; avisar(); } },
    /** What the page found in the last receipt checked (comprobar). */
    presentado: () => ultimo,
    ver: (): Res => (A ? A.send("ver", {}) : SIN),
    /** The key this world signs with (from the server; "" = it gives no goods). */
    emisor: () => emisor,
    /** Check a receipt someone brought (the bare «nb1.…» or the downloaded file's text) right here in the page:
     * its signature (WebCrypto Ed25519), whether this world signed it and whether it is one of your goods. */
    comprobar: async (texto: string): Promise<Presentado> => {
      const r = reciboDe(texto);
      const fin = (p: Presentado) => { ultimo = p; avisar(); return p; };
      if (!r) return fin({ ok: false, nombre: "", mundo: "", nuestro: false, tuyo: false, motivo: "Eso no lleva un recibo de Numinia (un fichero recibo-….json o un texto que empiece por «nb1.»)." });
      const c = await comprobar(r);
      if (!c.ok) return fin({ ok: false, nombre: "", mundo: "", nuestro: false, tuyo: false, motivo: `Ese recibo no vale: ${c.motivo}.` });
      const nuestro = !!emisor && c.recibo.emisor === emisor, tuyo = [...lista.values()].some((b) => b.recibo === r);
      const n = c.recibo.objeto.nombre;
      return fin({ ok: true, nombre: n, mundo: c.recibo.mundo, nuestro, tuyo, motivo: tuyo && !nuestro ? `Auténtico: «${n}», del mundo ${c.recibo.mundo}. Este mundo confía en quien lo firmó y aquí es tuyo.` : tuyo ? `Auténtico: «${n}» es tuyo, firmado por este mundo.` : nuestro ? `Auténtico: «${n}», firmado por este mundo, pero no está en tu inventario (es de otro invitado).` : `Auténtico: «${n}», firmado por el mundo ${c.recibo.mundo}. Aquí solo se comprueba que es real, no que sea tuyo.` });
    },
    ficheroRecibo,
    /** N18: wear one of your goods (its id) in a hand or on your head; everyone near sees it. The server checks it is yours. */
    llevar: (id: string, donde: Donde): Res => (A ? A.send("llevar", { id, donde }) : SIN),
    /** N18: take off what you wear. */
    quitar: (): Res => (A ? A.send("llevar", { id: "", donde: "" }) : SIN),
    /** N18: what you wear now (as every page sees it), or null. */
    puesto: (): Puesto | null => {
      const v = A && A.self() >= 0 ? A.state.get(`p:${A.self()}`) : undefined;
      return v ? { modelo: String(v.modelo), donde: String(v.donde) as Donde, nombre: String(v.nombre) } : null;
    },
    /** N18: who wears what near you (entity → model, place, name), for checks and agents. */
    puestos: (): Record<number, Puesto> => Object.fromEntries((A ? A.state.keys() : []).filter((k) => k.startsWith("p:")).map((k) => { const v = A!.state.get(k)!; return [Number(v.ent), { modelo: String(v.modelo), donde: String(v.donde) as Donde, nombre: String(v.nombre) }]; })),
    /** N18: bring a receipt from another world (the downloaded file's text or the bare «nb1.…»). Checked HERE first; a
     * real one from elsewhere goes to the server, which makes it yours only if this world trusts its signer. One not
     * made yours stays in `otros()` («de otro mundo», remembered in this browser). */
    traer: async (texto: string): Promise<Presentado> => {
      const p = await control.comprobar(texto);
      if (!p.ok || p.nuestro) return p;
      const r = reciboDe(texto);
      if (!A) return p;
      const respuesta = new Promise<Msg | null>((ok) => {
        const t = setTimeout(() => { esperando = null; ok(null); }, 8000);
        esperando = (m) => { clearTimeout(t); esperando = null; ok(m); };
      });
      const partes = Math.ceil(r.length / PIEZA);
      for (let i = 0; i < partes; i++) { const e = A.send("traer", { parte: i, partes, t: r.slice(i * PIEZA, (i + 1) * PIEZA) }); if (!e.ok) { esperando = null; return p; } }
      const m = await respuesta;
      if (!m) return p;
      const fin: Presentado = { ...p, ok: m.ok === true, confia: m.confia === true, dado: m.dado === true, motivo: String(m.motivo) };
      if (fin.ok && !fin.dado && !otros.some((x) => x.recibo === r)) {
        const c = await comprobar(r);
        if (c.ok) { otros = [{ recibo: r, nombre: c.recibo.objeto.nombre, descripcion: c.recibo.objeto.descripcion, licencia: c.recibo.objeto.licencia, modelo: c.recibo.objeto.modelo, mundo: c.recibo.mundo, emisor: c.recibo.emisor, instante: c.recibo.instante }, ...otros].slice(0, OTROS_MAX); guardarOtros(); }
      }
      if (fin.dado) { otros = otros.filter((x) => x.recibo !== r); guardarOtros(); }
      ultimo = fin; avisar();
      return fin;
    },
    /** N18: receipts from other worlds you brought here that are not yours here (newest first). */
    otros: (): DeOtroMundo[] => otros.slice(),
    /** N18: forget one of them (it only lived in this browser). */
    olvidar: (recibo: string) => { const n = otros.length; otros = otros.filter((x) => x.recibo !== recibo); if (otros.length !== n) { guardarOtros(); avisar(); } },
    alCambiar: (fn: () => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const parte: ClientPart = clientPart(decl, (a) => {
    A = a;
    a.on("inventario", (m) => { lista.clear(); emisor = String(m.emisor ?? ""); avisar(); });
    a.on("bien", (m: Msg) => {
      const b: BienVista = { id: String(m.id), ajeno: m.ajeno === true, verse: m.verse === true, objeto: String(m.objeto), nombre: String(m.nombre), descripcion: String(m.descripcion ?? ""), modelo: String(m.modelo ?? ""), licencia: String(m.licencia ?? ""), mundo: String(m.mundo), mision: String(m.mision), instante: String(m.instante), recibo: unir(m) };
      lista.set(b.id, b); avisar();
    });
    a.on("recibido", (m) => { nuevo = String(m.nombre); avisar(); });
    a.on("traido", (m) => { esperando?.(m); });
    // N18: what each person wears → the page draws it on their avatar (and on yours)
    const vestir = (k: string, v: Msg | undefined, intento = 0): void => {
      if (!k.startsWith("p:")) return;
      const ent = Number(k.slice(2));
      try {
        if (Number.isInteger(ent)) a.view.lleva?.(ent, v ? { model: String(v.modelo), donde: String(v.donde) as Donde, nombre: String(v.nombre) } : null);
      } catch {
        // the state that comes with the connection can arrive while the page is still building its session (the page's hooks
        // read `session` before it exists): try again a moment later, with what the state says THEN
        if (intento < 40) setTimeout(() => vestir(k, a.state.get(k), intento + 1), 100);
      }
      avisar();
    };
    a.state.onChange((k, v) => vestir(k, v));
    // whoever was already wearing something when this page came in (the state arrived before this part listened): apply it too, so a
    // late guest does not see people with empty hands (the Torre's «Ir» photo: the Seed was not there)
    for (const k of a.state.keys()) vestir(k, a.state.get(k));
  });
  return { parts: [parte], bienes: control };
}

const pagina = crearCliente();
export const bienes = pagina.bienes;
export default pagina.parts[0];
