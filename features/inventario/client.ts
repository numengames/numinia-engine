// inventario — client part (Y1). Keeps the Reserva as the server sends it (whole, after each change) and offers the
// page and agents a tiny controller: lista(), resumen(), equipar(id), desequipar(id), soltar(id, n), alCambiar(fn).
// The panel itself is apps/plaza/inventario.ts; the sheet (ficha) reads resumen().
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi, ClientPart } from "../../packages/feature/src/index.ts";
import { inventario } from "./feature.ts";
import { BOLSA_HUECOS } from "./reglas.ts";
import type { Color, Tipo } from "./reglas.ts";

export type ObjetoVista = { id: string; tipo: Tipo; clase: string; nombre: string; icono: string; color: Color; valor: number; n: number; portado: boolean };
type Res = { ok: true } | { ok: false; why: string };

export function crearCliente() {
  let A: ClientApi | null = null;
  let objetos: ObjetoVista[] = [], llegando: ObjetoVista[] | null = null, esperados = 0;
  const estado = { ultimoRechazo: "", ultimoRecibido: "", llena: false, huecos: BOLSA_HUECOS as number }; // llena: the last refusal was «la Bolsa está llena» (until the next list arrives)
  const oyentes = new Set<() => void>();
  const avisar = () => { for (const f of oyentes) { try { f(); } catch { /* a panel's problem is its own */ } } };
  const sin = (why: string): Res => ({ ok: false, why });

  const ctl = {
    estado,
    /** Everything you own, as it arrived: carried things first, then the Reserva. */
    lista: (): ObjetoVista[] => [...objetos].sort((a, b) => Number(b.portado) - Number(a.portado)),
    portados: (): ObjetoVista[] => objetos.filter((o) => o.portado),
    reserva: (): ObjetoVista[] => objetos.filter((o) => !o.portado),
    /** The Bolsa galáctica: slots in use (everything not carried; a stack is one) of `huecos` (the server says how many). */
    bolsa: () => ({ ocupados: objetos.filter((o) => !o.portado).length, huecos: estado.huecos }),
    /** For the player sheet. */
    resumen: () => ({ objetos: objetos.length, portados: objetos.filter((o) => o.portado).length, prestigio: objetos.filter((o) => o.clase === "semilla").reduce((s, o) => s + o.valor * o.n, 0) }),
    equipar: (id: string): Res => A?.send("equipar", { id }) ?? sin("la página aún no ha arrancado"),
    desequipar: (id: string): Res => A?.send("desequipar", { id }) ?? sin("la página aún no ha arrancado"),
    soltar: (id: string, n = 0): Res => A?.send("soltar", { id, n }) ?? sin("la página aún no ha arrancado"),
    alCambiar: (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; },
  };

  const part: ClientPart = clientPart(inventario, (api) => {
    A = api;
    api.on("lista", (m) => { estado.llena = false; estado.huecos = Number(m.huecos) || BOLSA_HUECOS; esperados = Number(m.total); llegando = []; if (esperados === 0) { objetos = []; llegando = null; avisar(); } });
    api.on("objeto", (m) => {
      if (!llegando) return;
      llegando.push({ id: String(m.id), tipo: m.tipo as Tipo, clase: String(m.clase), nombre: String(m.nombre), icono: String(m.icono ?? ""), color: (m.color as Color) ?? "", valor: Number(m.valor) || 0, n: Number(m.n) || 0, portado: m.portado === true });
      if (llegando.length >= esperados) { objetos = llegando; llegando = null; avisar(); }
    });
    api.on("recibido", (m) => { estado.ultimoRecibido = String(m.nombre); });
    api.on("rechazado", (m) => { estado.ultimoRechazo = String(m.motivo); estado.llena = m.llena === true; avisar(); });
  });

  return { parts: [part], inventario: ctl };
}

const pagina = crearCliente();
/** The page's controller (apps/plaza/inventario.ts mounts the panel on it; the sheet and agents read it too). */
export const inventarioCtl = pagina.inventario;
export default pagina.parts[0];
