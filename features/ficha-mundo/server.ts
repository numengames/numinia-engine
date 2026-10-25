// ficha-mundo — server part (H7). The server decides who (`mandar`) and what is valid; the composition root (packages/server/src/server.ts) owns
// the file and the door, and hands this piece `cambiar` and `ajustes` through the seam `ficha` (packages/feature/src/enlace-ficha.ts). Without
// that seam (a test server, a bench) the piece publishes nothing and refuses every change with a reason.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { AjustesMundoVivo, EnlaceFicha, ParteConFicha } from "../../packages/feature/src/index.ts";
import { AJUSTES, fichaMundo } from "./feature.ts";

const cortar = (t: string, n = 150) => (new TextEncoder().encode(t).length <= n ? t : `${t.slice(0, n - 1)}…`);
export const NO_PUEDE = "Cambiar los ajustes del mundo (título, imagen, avatar, límite de personas) es cosa de quien manda en él: el administrador o el dueño.";

export function crearFichaMundo(): ParteConFicha {
  let puente: Parameters<EnlaceFicha["conectar"]>[0] | null = null;
  const ficha: EnlaceFicha = { conectar: (s) => { puente = s; } };
  const part = serverPart(fichaMundo, (api) => {
    const publicar = (v: AjustesMundoVivo) => api.state.set(AJUSTES, { nombre: v.nombre, portada: v.portada, avatar: v.avatar, aforo: v.aforo, capacidad: v.capacidad, guardado: v.guardado });
    if (puente) publicar(puente.ajustes());
    const decir = (e: number) => api.emit("permiso", { ajustar: api.puede(e, "mandar") }, { to: e });
    api.onJoin(decir);
    api.onIdentify((e) => decir(e));
    api.listen("roles", "cambio", (m) => { decir(Number(m.quien)); return true; });
    const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo) }, { to: e }); return false; };
    api.on("ajustar", (e, m) => {
      if (!api.puede(e, "mandar")) return rechazar(e, NO_PUEDE);
      if (!puente) return rechazar(e, "Este servidor no guarda los ajustes del mundo.");
      const r = puente.cambiar({ nombre: String(m.nombre ?? ""), portada: String(m.portada ?? ""), avatar: String(m.avatar ?? ""), aforo: Number(m.aforo ?? 0) }, `la entidad ${e}`);
      if (!r.ok) return rechazar(e, r.texto);
      publicar(r.ajustes);
      api.emit("cambiado", { nombre: r.ajustes.nombre }, "all");
      return true;
    });
  });
  return Object.assign(part, { ficha });
}

export default crearFichaMundo();
