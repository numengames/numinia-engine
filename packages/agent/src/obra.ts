// obra (P5a E4, ADR-080): building with a person's verbs — colocar, mover, borrar, deshacer — as the body's objetos
// intents, checked here first (the model in the library, numbers in range, within ALCANCE_M of the body) and then by the
// server again (objetos: api.puede «construir», caps, undo per builder). Shared by the inhabitant's brain (mente.ts)
// and the MCP bridge of outside agents (mcp-mundo.ts), so both build the same way.
// `colocar` has no scale: place, wait for «hecho» (its id), then `mover` with the scale — what the gizmo does. `mover`
// merges with the current state (stateOf("objetos")), or giro and scale would go back to their defaults.
import { Cuerpo, limpia } from "./index.ts";
import type { Msg } from "../../feature/src/index.ts";

export type Modelo3D = { id: string; nombre: string; modelo: string };
export type Resultado = { accion: string; ok: boolean; id?: string; motivo?: string };
export const ALCANCE_M = 40;            // it walks and builds within 40 m of where it stands
export const ALTURA_MAX = 30;           // m above the ground
export const ESCALA_MIN = 0.1, ESCALA_MAX = 10;
export const RESPUESTA_MS = 3000;       // how long it waits for the world to confirm one action
export const ACCIONES_OBRA = ["colocar", "mover", "borrar", "deshacer"] as const;
export type AccionObra = (typeof ACCIONES_OBRA)[number];

/** What each house model is, for the model (the library only has ids, names and hashes). */
const COMO_ES: Record<string, string> = {
  bloque: "cubo de 1 × 1 × 1 m apoyado en el suelo (su base queda en y); escalado sirve para mesas, bancos, paredes, escalones, columnas",
  robot: "un robot de juguete, figura decorativa",
};
export { COMO_ES };

type Espera = { resolver: (r: { ok: boolean; id?: string; motivo?: string }) => void };

/** A number in [min, max] (absent = `def`), or null when it is not one. */
export const numero = (v: unknown, min: number, max: number, def?: number): number | null => {
  if (v === undefined || v === null) return def ?? null;
  const x = Number(v);
  return Number.isFinite(x) && x >= min && x <= max ? x : null;
};

export class Obra {
  readonly c: Cuerpo; readonly biblioteca: readonly Modelo3D[];
  private readonly esperas: Espera[] = [];
  constructor(c: Cuerpo, biblioteca: readonly Modelo3D[] = []) {
    this.c = c; this.biblioteca = biblioteca;
    c.s.features.tap((f, e, m) => {
      if (f !== "objetos" || (e !== "hecho" && e !== "rechazado")) return;
      this.esperas.shift()?.resolver(e === "hecho" ? { ok: true, id: String(m.id) } : { ok: false, motivo: String(m.motivo ?? "el mundo no lo dejó") });
    });
  }

  /** The library's id of a model by its sha256 («subido» when it is not in the library). */
  idDe(sha: unknown): string { return this.biblioteca.find((m) => m.modelo === sha)?.id ?? "subido"; }

  /** One build action. `e`: modelo (a library id), x, y, z, giro, escala_x/_y/_z, nombre; mover/borrar: id. */
  async hacer(accion: AccionObra, e: Record<string, unknown>): Promise<Resultado> {
    const n = numero, me = this.c.posicion();
    const cerca = (x: number, z: number) => Math.hypot(x - me.x, z - me.z) <= ALCANCE_M;
    const no = (motivo: string): Resultado => ({ accion, ok: false, motivo });
    const escala = (actual: { sx: number; sy: number; sz: number }) => {
      const sx = n(e.escala_x, ESCALA_MIN, ESCALA_MAX, actual.sx), sy = n(e.escala_y, ESCALA_MIN, ESCALA_MAX, actual.sy), sz = n(e.escala_z, ESCALA_MIN, ESCALA_MAX, actual.sz);
      return sx === null || sy === null || sz === null ? null : { sx, sy, sz };
    };
    if (accion === "deshacer") return this.enviar(accion, "deshacer", {});
    if (accion === "borrar") return this.existe(e.id) ? this.enviar(accion, "borrar", { id: String(e.id) }) : no("no veo ese objeto");
    if (accion === "colocar") {
      const m = this.biblioteca.find((b) => b.id === e.modelo);
      if (!m) return no("ese modelo no está en la biblioteca");
      const x = n(e.x, -2000, 2000), z = n(e.z, -2000, 2000), y = n(e.y, 0, ALTURA_MAX, 0), giro = n(e.giro, -180, 180, 0), s = escala({ sx: 1, sy: 1, sz: 1 });
      if (x === null || z === null || !cerca(x, z)) return no(`ese sitio está a más de ${ALCANCE_M} m`);
      if (y === null || giro === null || s === null) return no("los números no valen");
      const nombre = limpia(String(e.nombre ?? "")).replace(/[«»]/g, "").trim().slice(0, 40);
      const r = await this.enviar(accion, "colocar", { modelo: m.modelo, x, y, z, ry: giro, nombre, decorado: !nombre });
      if (!r.ok || !r.id || (s.sx === 1 && s.sy === 1 && s.sz === 1)) return r;
      const r2 = await this.enviar(accion, "mover", { id: r.id, x, y, z, rx: 0, ry: giro, rz: 0, ...s }); // colocar has no scale: the same as the gizmo does
      return r2.ok ? r : { ...r2, id: r.id };
    }
    // mover: what it does not say stays as it is
    const v = this.c.s.features.stateOf("objetos").get(String(e.id));
    if (!v) return no("no veo ese objeto");
    const x = n(e.x, -2000, 2000, Number(v.x)), z = n(e.z, -2000, 2000, Number(v.z)), y = n(e.y, 0, ALTURA_MAX, Number(v.y)), giro = n(e.giro, -180, 180, Number(v.ry));
    const s = escala({ sx: Number(v.sx), sy: Number(v.sy), sz: Number(v.sz) });
    if (x === null || z === null || !cerca(x, z)) return no(`ese sitio está a más de ${ALCANCE_M} m`);
    if (y === null || giro === null || s === null) return no("los números no valen");
    return this.enviar(accion, "mover", { id: String(e.id), x, y, z, rx: Number(v.rx), ry: giro, rz: Number(v.rz), ...s });
  }

  private existe(id: unknown): boolean { return this.c.s.features.stateOf("objetos").has(String(id)); }

  /** Send one objetos intent as the body and wait for the world's «hecho» or «rechazado». */
  private enviar(accion: string, verbo: string, msg: Msg): Promise<Resultado> {
    const s = this.c.hacer("objetos", verbo, msg);
    if (!s.ok) return Promise.resolve({ accion, ok: false, motivo: s.why });
    return new Promise((ok) => {
      const espera: Espera = { resolver: (r) => { clearTimeout(reloj); ok({ accion, ...r }); } };
      const reloj = setTimeout(() => { const i = this.esperas.indexOf(espera); if (i >= 0) this.esperas.splice(i, 1); ok({ accion, ok: false, motivo: "el mundo no contestó" }); }, RESPUESTA_MS);
      this.esperas.push(espera);
    });
  }
}
