// U1: what happens when the socket closes. Before this, the page did nothing: a frozen world with no word. Now the loading
// screen's frame says the connection was cut and tries again with a growing wait (1, 2, 4, 8, 16, 30 s, then every 30 s):
// each try opens a throw-away socket and, when the server answers, reloads the page (the guest token is in this browser:
// same person, same badges). «Reintentar ya» skips the wait, «Cancelar» stops and leaves one «Reintentar». «Salir» in the
// menu closes the connection on purpose and offers «Volver a entrar».
import type { Carga } from "./carga.ts";

type Transporte = { closed: Promise<void>; close(): void };
export const espera = (intento: number): number => Math.min(30, 2 ** (intento - 1)); // seconds before try number `intento`

export function vigilarConexion(o: { transport: Transporte; url: string; carga: Carga; conectado(): boolean; recargar?(): void; crearSocket?(url: string): WebSocket }) {
  const { carga } = o, recargar = o.recargar ?? (() => location.reload()), crear = o.crearSocket ?? ((u: string) => new WebSocket(u));
  let saliendo = false, intento = 0, reloj = 0, sonda: WebSocket | null = null, vivo = false;

  const parar = () => { clearInterval(reloj); reloj = 0; vivo = false; if (sonda) { sonda.onopen = sonda.onclose = sonda.onerror = null; try { sonda.close(); } catch { /* already closed */ } sonda = null; } };
  function probar(): void {
    carga.texto("Probando la conexión…");
    let hecho = false;
    const fin = (ok: boolean) => { if (hecho || !vivo) return; hecho = true; if (ok) { parar(); recargar(); } else { sonda = null; esperar(); } };
    try {
      const ws = crear(o.url); sonda = ws;
      ws.onopen = () => { ws.onclose = null; try { ws.close(); } catch { /* ignore */ } fin(true); };
      ws.onerror = ws.onclose = () => fin(false);
    } catch { fin(false); }
  }
  function esperar(): void {
    intento++;
    let seg = espera(intento);
    const dice = () => carga.texto(`Intento ${intento}: vuelvo a probar en ${seg} s.`);
    dice();
    reloj = setInterval(() => { seg--; if (seg <= 0) { clearInterval(reloj); reloj = 0; probar(); } else dice(); }, 1000) as unknown as number;
  }
  function empezar(): void {
    parar(); vivo = true; intento = 0;
    const antes = o.conectado();
    carga.mensaje("reconectando", antes ? "Se ha cortado la conexión" : "No llego al servidor", "Voy a volver a probar.", [["Reintentar ya", () => { parar(); vivo = true; probar(); }], ["Cancelar", cancelar]]);
    carga.aviso(antes ? "Se ha cortado la conexión con el mundo." : "No llego al servidor.");
    esperar();
  }
  function cancelar(): void {
    parar();
    carga.mensaje("sin-conexion", "Sin conexión", "Has parado los reintentos.", [["Reintentar", empezar]]);
  }
  void o.transport.closed.then(() => { if (!saliendo) empezar(); });
  return {
    /** «Salir» in the menu: close on purpose, say so, offer to come back. */
    salir(): void {
      saliendo = true; parar();
      o.transport.close();
      carga.mensaje("salido", "Has salido del mundo", "La conexión está cerrada. Cuando quieras, vuelve a entrar.", [["Volver a entrar", recargar]]);
    },
    estado: () => ({ saliendo, intento, esperando: reloj !== 0 }),
  };
}
