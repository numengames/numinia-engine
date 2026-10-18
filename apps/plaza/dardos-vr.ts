// dardos in VR (motor-vr t_5f6ff048): real VR had no way to throw a dart — PC/mouse, phone/touch and AR each had
// their own input, but immersive-vr (no AR wall) never got a controller/hand path, so a trigger near the board did
// nothing past opening the turn. This is the fourth input, same idea as AR's hold-and-release but at the plaza's
// miniature board: whichever hand's trigger is free (not holding something else — `manos.ts`'s `ocupada` already
// gates a hand per feature; a hand busy with a rod or a quest item never reaches here) presses to charge the power
// bar and releases to throw along THAT hand's ray at that instant (read fresh, not the stale aim used to start the
// charge: a hand drifts while held). The server still decides where it lands (features/dardos/client.ts → `lanzar`),
// which already clamps x/y to the board's radii and fuerza to 0-1, so a wild throw never leaves the board's bounds
// or crosses the plaza — it lands (possibly `fuera`) or the ray misses the face and nothing is sent.
import { potenciaDe } from "../../packages/render/src/index.ts";

type Lado = "izq" | "der";
type Res = { ok: true } | { ok: false; why: string };
type Sitio = { id: string; nombre: string; x: number; y: number; z: number; radio: number; rumbo: number; ocupado: boolean };
type Estado = { sitio: string };
type Dardos = { estado(): Readonly<Estado>; tirando(): boolean; sitios(): Sitio[]; lanzar(x: number, y: number, fuerza: number, sitio?: string): Res };
type EventoMano = { tipo: "gatillo"; lado: Lado } | { tipo: "gatillo_fin"; lado: Lado } | { tipo: string; lado: Lado };
type Manos = { on(fn: (e: EventoMano) => void): () => void; rayo(lado: Lado): { origen: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } } | null; vibrar(lado: Lado, v?: number, ms?: number): void };
type Vista = {
  vr: { active: boolean; nota?(t: string): void };
  ar: { jugando: boolean };
  manos?: Manos;
  dardos: { apuntar(id: string, origen: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }): { x: number; y: number } | null };
};

export function montarDardosVR(o: { dardos: Dardos; view: Vista }) {
  const { dardos, view } = o;
  const desde: Record<Lado, number> = { izq: 0, der: 0 }; // when that hand's trigger went down charging a throw, or 0
  const sitioActual = (): string | undefined => dardos.estado().sitio || dardos.sitios()[0]?.id;
  const activo = () => view.vr.active && !view.ar.jugando && dardos.tirando();

  const quitar = view.manos?.on((e) => {
    if (e.tipo === "gatillo") {
      if (!activo()) return;
      desde[e.lado] = performance.now();
    } else if (e.tipo === "gatillo_fin") {
      const t0 = desde[e.lado];
      desde[e.lado] = 0;
      if (!t0 || !activo()) return;
      const potencia = potenciaDe((performance.now() - t0) / 1000);
      const id = sitioActual(); if (!id) return;
      const rayo = view.manos!.rayo(e.lado); if (!rayo) return;
      const p = view.dardos.apuntar(id, rayo.origen, rayo.dir);
      if (!p) return; // the ray missed the face (behind you, or parallel): no throw, try again
      const r = dardos.lanzar(p.x, p.y, potencia, id);
      if (!r.ok) view.vr.nota?.(r.why);
      else view.manos!.vibrar(e.lado, 0.5, 60);
    }
  });

  return { cargando: (lado: Lado): boolean => !!desde[lado], parar: () => quitar?.() };
}
