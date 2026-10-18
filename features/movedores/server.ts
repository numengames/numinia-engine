// movedores — server part (v1, D-043). The server owns every ride: each tick it advances the moving ones by
// 1/20 s, writes the shared state (x, y, z, rx, ry, rz interpolated with `lerpPose`) only every PUBLICA_CADA_TICKS
// ticks — so the pose travels 5 times a second while moving, not twenty — and only to who is inside the movedor's
// zone (state set WITH `at`: J9 area of interest). A page never moves a thing on its own: between two published
// poses it keeps drawing the last one (the client interpolates nothing extra; good enough at 5 Hz for a platform
// or a door). `vaiven` waits `espera` seconds, then rides to the other side, forever, with no order needed.
// `interruptor` only moves on an `activa` intent (the same reach rule a door's `usar` uses, `api.within`).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { lerpPose, movedores, poseDe, PUBLICA_CADA_TICKS, TICK_HZ } from "./feature.ts";
import type { Lado, MovedorFichero } from "./feature.ts";

type Vivo = { f: MovedorFichero; lado: Lado; marcha: boolean; haciaB: boolean; t: number; esperaRestante: number; ticksDesdePublicado: number };

const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};

export const crearMovedores = (opts: { movedores?: MovedorFichero[] } = {}) => serverPart(movedores, (api: ServerApi) => {
  const vivos = new Map<string, Vivo>();

  const publicar = (v: Vivo, pose: ReturnType<typeof poseDe>, lado: "a" | "b" | "entre") => {
    const { f } = v;
    const m: Msg = {
      nombre: f.nombre, modelo: f.modelo, tipo: f.tipo,
      ax: f.ax, ay: f.ay, az: f.az, arx: f.arx, ary: f.ary, arz: f.arz,
      bx: f.bx, by: f.by, bz: f.bz, brx: f.brx, bry: f.bry, brz: f.brz,
      sx: f.sx, sy: f.sy, sz: f.sz, duracion: f.duracion, espera: f.espera, radio: f.radio, evento: f.evento,
      x: pose.x, y: pose.y, z: pose.z, rx: pose.rx, ry: pose.ry, rz: pose.rz, lado, marcha: v.marcha,
    };
    if (!api.state.set(f.id, m, { at: { x: pose.x, z: pose.z } })) api.log(`movedores: «${f.id}» no cabe en el esquema`);
  };

  for (const f of opts.movedores ?? []) {
    const v: Vivo = { f, lado: f.empiezaEn, marcha: false, haciaB: f.empiezaEn === "a", t: 0, esperaRestante: f.espera, ticksDesdePublicado: 0 };
    vivos.set(f.id, v);
    publicar(v, poseDe(f, v.lado), v.lado);
  }
  if (vivos.size) api.log(`movedores: ${vivos.size} movedor(es) del mundo`);

  const rechazar = (e: number, motivo: string) => api.emit("rechazado", { motivo: cortar(motivo, 160) }, { to: e });

  const empezar = (v: Vivo, haciaB: boolean) => {
    v.marcha = true; v.haciaB = haciaB; v.t = 0; v.ticksDesdePublicado = 0;
    publicar(v, poseDe(v.f, haciaB ? "a" : "b"), "entre");
  };

  const llegada = (v: Vivo) => {
    const ladoFinal: Lado = v.haciaB ? "b" : "a";
    v.marcha = false; v.lado = ladoFinal; v.t = 0; v.esperaRestante = v.f.espera; v.ticksDesdePublicado = 0;
    publicar(v, poseDe(v.f, ladoFinal), ladoFinal);
    api.emit("llegada", { id: v.f.id, nombre: v.f.nombre, lado: ladoFinal, evento: v.f.evento }, { near: { x: poseDe(v.f, ladoFinal).x, z: poseDe(v.f, ladoFinal).z }, radius: Number(movedores.state?.radius ?? 64) });
  };

  api.on("activa", (e, m) => {
    const id = String(m.id ?? ""), v = vivos.get(id);
    if (!v) { rechazar(e, `No hay ningún movedor «${cortar(id, 16)}».`); return; }
    if (v.f.tipo !== "interruptor") { rechazar(e, `${v.f.nombre} se mueve solo (vaiven); no se activa.`); return; }
    if (v.marcha) { rechazar(e, `${v.f.nombre} ya se está moviendo.`); return; }
    if (!api.within(e, v.f.id)) { rechazar(e, `Acércate a ${v.f.nombre} para usarlo.`); return; }
    empezar(v, v.lado === "a");
  });

  api.onTick(() => {
    for (const v of vivos.values()) {
      if (v.f.tipo === "vaiven" && !v.marcha) {
        if (v.esperaRestante > 0) { v.esperaRestante -= 1 / TICK_HZ; continue; }
        empezar(v, v.lado === "a");
        continue;
      }
      if (!v.marcha) continue;
      v.t += 1 / TICK_HZ;
      if (v.t >= v.f.duracion) { llegada(v); continue; }
      if (++v.ticksDesdePublicado < PUBLICA_CADA_TICKS) continue;
      v.ticksDesdePublicado = 0;
      const pose = lerpPose(poseDe(v.f, v.haciaB ? "a" : "b"), poseDe(v.f, v.haciaB ? "b" : "a"), v.t / v.f.duracion);
      publicar(v, pose, "entre");
    }
  });
});

export default crearMovedores();
