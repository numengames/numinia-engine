// ficha-viva (H7): the world's ficha (aventura/ficha.json, ficha@1) while the server runs. The file is the truth (file over app): the owner
// sets the title, cover, everyone's default avatar and the people limit from the settings panel, this validates the change with
// the same rules the file has at start (aventura.ts validarFicha), writes ONLY those keys (every other key — descripcion, tema, audio, notas — kept
// verbatim) atomically, and from then on the server reads the new values: the door's aforo, GET /status, the page's <title>. Nobody
// inside is put out when the limit drops below how many there are; the next one finds the door closed (CIERRE_LLENO).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AjustesMundo, AjustesMundoVivo, CambioAjustes } from "../../feature/src/index.ts";
import { FICHA, FICHA_FICHERO, FICHA_PORTADA, validarFicha } from "./aventura.ts";
import type { Ficha } from "./aventura.ts";
import { escribirMundo } from "./mundo.ts";

export type OpcionesFichaViva = {
  /** The adventure folder (where ficha.json lives); null = the world has none: a change lasts until the server restarts. */
  aventura: string | null;
  ficha: Ficha | null;
  /** The engine's capacity: the most people `aforo` can really mean. */
  maxPlayers: number;
  /** Does this server have the picture (the house library or datos/activos/)? */
  tieneImagen(sha256: string, ext: string): boolean;
  /** How many are inside right now. */
  dentro(): number;
  log(l: string): void;
  /** The world's name changed (the page's <title>). */
  alCambiarNombre?(nombre: string | null): void;
  escribir?: (dir: string, fichero: string, datos: unknown, o: { nuevo: boolean }) => void;
};

export function crearFichaViva(o: OpcionesFichaViva) {
  let ficha = o.ficha;
  const escribir = o.escribir ?? ((dir, fichero, datos, op) => escribirMundo(dir, o.log)(fichero, datos, op));
  const ajustes = (): AjustesMundoVivo => ({
    nombre: ficha?.nombre ?? "", portada: ficha?.portada ?? "", avatar: ficha?.avatar ?? "",
    aforo: ficha?.aforo ?? 0, capacidad: o.maxPlayers, dentro: o.dentro(), guardado: o.aventura !== null,
  });
  /** How many may be inside at once: the world's aforo under the engine's capacity. */
  const aforo = (): number => Math.min(ficha?.aforo ?? o.maxPlayers, o.maxPlayers);

  function cambiar(c: AjustesMundo, quien: string): CambioAjustes {
    const no = (texto: string): CambioAjustes => ({ ok: false, texto });
    const nombre = String(c.nombre ?? "").trim();
    if (!nombre) return no("Ponle un nombre al mundo (de 1 a 60 caracteres): sin nombre no hay ficha que guardar.");
    const portada = String(c.portada ?? "").trim();
    if (portada) {
      if (!FICHA_PORTADA.test(portada)) return no("La imagen del mundo es «<sha256>.png|jpg|webp» de una imagen que ya está en este servidor.");
      const [sha, ext] = portada.split(".");
      if (!o.tieneImagen(sha, ext)) return no("Esa imagen no está en este servidor: súbela al mundo primero y vuelve a elegirla.");
    }
    const aforoNuevo = Number(c.aforo ?? 0);
    // the file as it is now: every key we do not own stays exactly as written
    let base: Record<string, unknown> = {}, existia = false;
    if (o.aventura) {
      const ruta = join(o.aventura, FICHA_FICHERO);
      if (existsSync(ruta)) {
        existia = true;
        try {
          const crudo: unknown = JSON.parse(readFileSync(ruta, "utf8"));
          if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return no(`${FICHA_FICHERO} no es un objeto JSON: arréglalo a mano antes de usar el panel.`);
          base = crudo as Record<string, unknown>;
        } catch { return no(`${FICHA_FICHERO} no es JSON válido: arréglalo a mano antes de usar el panel (el panel no lo pisa).`); }
      }
    } else base = ficha ? { ...ficha } : {};
    const siguiente: Record<string, unknown> = { ...base, formato: FICHA, nombre };
    const poner = (k: string, v: unknown, vacio: boolean) => { if (vacio) delete siguiente[k]; else siguiente[k] = v; };
    poner("portada", portada, !portada);
    poner("avatar", String(c.avatar ?? ""), !String(c.avatar ?? ""));
    poner("aforo", aforoNuevo, !(aforoNuevo > 0));
    const v = validarFicha(siguiente);
    if (!v.ok) return no(`${v.issues[0].path.replace(/^ficha\.json\./, "")}: ${v.issues[0].message}`);
    if (o.aventura) {
      try { escribir(o.aventura, FICHA_FICHERO, siguiente, { nuevo: !existia }); }
      catch (err) { o.log(`[ficha] no pude escribir ${FICHA_FICHERO}: ${(err as Error).message}`); return no(`No he podido guardar ${FICHA_FICHERO} (${(err as NodeJS.ErrnoException).code ?? "error"}; más en el registro del servidor): no cambia.`); }
    } else o.log("[ficha] sin carpeta del mundo donde escribir: el cambio vale hasta que el servidor se reinicie");
    const antes = ficha?.nombre;
    ficha = v.value;
    if (ficha.nombre !== antes) o.alCambiarNombre?.(ficha.nombre);
    o.log(`[ficha] ${quien} guarda: «${ficha.nombre}»${ficha.aforo ? `, aforo ${ficha.aforo}` : ""}${ficha.avatar ? `, avatar ${ficha.avatar}` : ""}${ficha.portada ? `, portada ${ficha.portada}` : ""}`);
    return { ok: true, ajustes: ajustes() };
  }

  return { ficha: () => ficha, ajustes, aforo, cambiar };
}
