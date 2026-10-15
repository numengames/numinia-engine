// despertar — server part. GET /e/<token>: a valid token wakes its point (one event to everyone); a forged
// token does nothing; a point already awake ignores a second scan until its effect ends.
import { serverPart } from "../../packages/feature/src/index.ts";
import { despertar } from "./feature.ts";
import { leerPuntos, verificar } from "./tokens.ts";
import type { Punto } from "./tokens.ts";
import enlaces from "./enlaces.json" with { type: "json" };

const TICK_HZ = 20;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pagina = (titulo: string, texto: string) =>
  `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>` +
  `<body style="font:22px system-ui;background:#101820;color:#ffd27a;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center"><p>${texto}</p>`;

/** `puntos` only for tests; the real list is enlaces.json. */
export const crearDespertar = (puntos?: Punto[]) => serverPart(despertar, (api) => {
  let lista = puntos;
  if (!lista) {
    const r = leerPuntos(enlaces);
    if (!r.ok) { api.log(`despertar: enlaces.json no vale: ${r.problemas.join("; ")}`); return; }
    lista = r.puntos;
  }
  if (!api.sign("probe")) api.log("despertar: el servidor no tiene secreto (MOTOR_SECRET, 16+ caracteres): ningún QR vale. Ejemplo: MOTOR_SECRET=$(openssl rand -hex 16) npm run server");
  const hasta = new Map<string, number>(); // point id -> tick when its effect ends
  api.route("GET", "/e/:token", (req) => {
    const id = verificar(api.sign, req.params.token);
    const p = id ? lista!.find((q) => q.id === id) : undefined;
    if (!p) return { status: 404, type: "html", body: pagina("Nada", "Este código no despierta nada.") };
    const now = api.tick();
    if ((hasta.get(p.id) ?? 0) > now) return { type: "html", body: pagina(p.nombre, "Ya está despierto: míralo en la plaza.") };
    hasta.set(p.id, now + Math.ceil((p.ms / 1000) * TICK_HZ));
    const antes = api.store.get(p.id) as { veces?: number } | undefined; // S4: survives restarts
    api.store.set(p.id, { ultima: new Date().toISOString(), veces: (antes?.veces ?? 0) + 1 });
    api.emit("despertado", { punto: p.id, texto: p.texto, x: p.x, z: p.z, ms: p.ms }, "all");
    api.log(`despertar: ${p.id} despierto`);
    return { type: "html", body: pagina(p.nombre, `Has despertado ${esc(p.nombre)}.<br>Mírala en la plaza.`) };
  });
});

export default crearDespertar();
