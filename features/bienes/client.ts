// bienes — client part (N10). Keeps THIS player's goods as the server sends them (each with its signed receipt) and
// offers a small controller the page (apps/plaza/bienes.ts: the «Inventario» of the player sheet) and agents use:
// the list, ask again, download a receipt as a file, check a receipt someone brings (in the page: comprobar.ts). The server decides; the page shows.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart, Msg } from "../../packages/feature/src/index.ts";
import { bienes as decl, unir } from "./feature.ts";
import { comprobar } from "./comprobar.ts";

export type BienVista = { id: string; objeto: string; nombre: string; descripcion: string; modelo: string; licencia: string; mundo: string; mision: string; instante: string; recibo: string };
/** What the page found in a receipt someone brought: real or not, which good, from which world, signed by THIS world,
 * one of YOUR goods here, and a sentence to show. */
export type Presentado = { ok: boolean; nombre: string; mundo: string; nuestro: boolean; tuyo: boolean; motivo: string };
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

export function crearCliente() {
  let A: ClientApi | null = null;
  const lista = new Map<string, BienVista>();
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
      const nuestro = !!emisor && c.recibo.emisor === emisor, tuyo = nuestro && [...lista.values()].some((b) => b.recibo === r);
      const n = c.recibo.objeto.nombre;
      return fin({ ok: true, nombre: n, mundo: c.recibo.mundo, nuestro, tuyo, motivo: tuyo ? `Auténtico: «${n}» es tuyo, firmado por este mundo.` : nuestro ? `Auténtico: «${n}», firmado por este mundo, pero no está en tu inventario (es de otro invitado).` : `Auténtico: «${n}», firmado por el mundo ${c.recibo.mundo}. Aquí solo se comprueba que es real, no que sea tuyo.` });
    },
    ficheroRecibo,
    alCambiar: (fn: () => void) => { oyentes.add(fn); return () => oyentes.delete(fn); },
  };

  const parte: ClientPart = clientPart(decl, (a) => {
    A = a;
    a.on("inventario", (m) => { lista.clear(); emisor = String(m.emisor ?? ""); avisar(); });
    a.on("bien", (m: Msg) => {
      const b: BienVista = { id: String(m.id), objeto: String(m.objeto), nombre: String(m.nombre), descripcion: String(m.descripcion ?? ""), modelo: String(m.modelo ?? ""), licencia: String(m.licencia ?? ""), mundo: String(m.mundo), mision: String(m.mision), instante: String(m.instante), recibo: unir(m) };
      lista.set(b.id, b); avisar();
    });
    a.on("recibido", (m) => { nuevo = String(m.nombre); avisar(); });
  });
  return { parts: [parte], bienes: control };
}

const pagina = crearCliente();
export const bienes = pagina.bienes;
export default pagina.parts[0];
