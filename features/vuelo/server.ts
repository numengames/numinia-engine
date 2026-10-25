// vuelo — server part (H2). Asks the instance (`api.ordenar({ volar })`): the permission is the instance's (`puedeVolar`: the
// world's `vuelo`, or a feature's grant), so a page that sends `volar` on its own gets nothing. Landing (`activa: false`) is
// always allowed. Every change is written to the world's log.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { vuelo } from "./feature.ts";

export const NO_SE_VUELA = "En este mundo no se vuela: quien lo dirige lo permite en su entorno (vuelo).";

export const crearVuelo = () => serverPart(vuelo, (api: ServerApi) => {
  const vuelan = new Set<number>();
  const nombreDe = (e: number) => api.who(e)?.nombre ?? `Persona ${e}`;
  const volar = (e: number, activa: boolean) => {
    if (activa === vuelan.has(e)) { api.emit("vuela", { quien: e, activa }, { to: e }); return; }
    if (!api.ordenar(e, { volar: activa })) {
      api.emit("rechazado", { motivo: activa ? NO_SE_VUELA : "Ahora no puedes aterrizar." }, { to: e });
      return;
    }
    if (activa) vuelan.add(e); else vuelan.delete(e);
    api.emit("vuela", { quien: e, activa }, { to: e });
    api.log(`[vuelo] ${nombreDe(e)} ${activa ? "vuela" : "aterriza"}`);
  };
  api.on("volar", (e, m) => volar(e, m.activa !== false));
  api.onLeave((e) => { vuelan.delete(e); });
  api.listen("chat", "orden", (m) => {
    const palabra = String(m.texto ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    const e = Number(m.quien);
    if (palabra === "volar") { volar(e, true); return true; }
    if (palabra === "aterrizar") { volar(e, false); return true; }
    return false;
  });
});

export default crearVuelo();
