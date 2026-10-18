// graboso (M18b): the pure side of the Graboso, the relic that records what you see. No browser here: the clock, the
// recorder (MediaRecorder + the canvas stream + the microphone) and the HTML are injected by apps/plaza/graboso.ts, so
// node --test can drive the whole cycle: out → recording → cut at the cap → a clip you can download.
// Design: ../../../mmo-browser-study/GRABOSO-DISENO.md. Lore: a Reliquia (clase "graboso"); it joins the inventory (Y1) when Y1 lands.

/** The hard cap of a clip (s): never under 30 nor over 60 (Pablo, 18-10). 30 is the mission's goal, 60 the ceiling. */
export const TOPE_S = { min: 30, max: 60, defecto: 60 } as const;
/** The formats a recorder is asked for, best first; the first one the browser supports wins. */
export const FORMATOS = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"] as const;

export type Fase = "guardado" | "despertando" | "grabando";
export type Clip = { blob: Blob; tipo: string; duracionS: number; conSonido: boolean; nombre: string; corto: boolean };
/** What the page gives: start returns whether a microphone joined; stop returns what was recorded (null = nothing). */
export type Grabador = {
  empezar(tipo: string): Promise<{ sonido: boolean }>;
  parar(): Promise<{ blob: Blob | null; tipo: string }>;
};
export type Estado = { fase: Fase; desdeMs: number; topeS: number; clip: Clip | null; sonido: boolean; error: string };
export type Aviso = { texto: string; importancia: 0 | 1 | 2 };

/** A requested cap, kept inside the hard range; anything that is not a number becomes the default. */
export function recortarTope(s: unknown): number {
  const n = typeof s === "number" && Number.isFinite(s) ? s : TOPE_S.defecto;
  return Math.min(TOPE_S.max, Math.max(TOPE_S.min, Math.round(n)));
}

/** The first format the browser can record (soporta = MediaRecorder.isTypeSupported); "" when none. */
export function elegirFormato(soporta: (tipo: string) => boolean): string {
  for (const f of FORMATOS) { try { if (soporta(f)) return f; } catch { /* a browser without MediaRecorder */ } }
  return "";
}

/** The file's extension for a recorded type. */
export const extensionDe = (tipo: string): string => (tipo.startsWith("video/mp4") ? "mp4" : "webm");

/** graboso-AAAA-MM-DD-HH-MM-SS.webm, in UTC (every written time is UTC: Pablo's rule). */
export function nombreDeClip(fecha: Date, tipo: string): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `graboso-${fecha.getUTCFullYear()}-${p(fecha.getUTCMonth() + 1)}-${p(fecha.getUTCDate())}-${p(fecha.getUTCHours())}-${p(fecha.getUTCMinutes())}-${p(fecha.getUTCSeconds())}.${extensionDe(tipo)}`;
}

/** "0:12 / 1:00": the counter the HUD shows. */
export function contador(segundos: number, topeS: number): string {
  const f = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return `${f(Math.max(0, Math.min(segundos, topeS)))} / ${f(topeS)}`;
}

/**
 * The Graboso's cycle. `sacar()` wakes it and starts recording; `guardar()` (the key, the button or the cap through
 * `tic`) stops it and keeps the clip; only the last clip stays. `alCambiar` fires on every state change, `avisar` on
 * what a person should hear (V1: the page puts it in its aria-live line).
 */
export function crearGraboso(o: { grabador: Grabador; ahora(): number; fecha?: () => Date; tipo?: string; topeS?: number; alCambiar?: (e: Estado) => void; avisar?: (a: Aviso) => void }) {
  const estado: Estado = { fase: "guardado", desdeMs: 0, topeS: recortarTope(o.topeS), clip: null, sonido: false, error: "" };
  const tipo = o.tipo ?? FORMATOS[2];
  let cerrando: Promise<void> | null = null;
  const cambio = () => o.alCambiar?.(estado);
  const avisar = (texto: string, importancia: 0 | 1 | 2 = 1) => o.avisar?.({ texto, importancia });

  async function sacar(): Promise<boolean> {
    if (estado.fase !== "guardado") return false;
    if (!tipo) { estado.error = "Este navegador no sabe grabar vídeo."; avisar(estado.error, 2); cambio(); return false; }
    estado.fase = "despertando"; estado.error = ""; cambio();
    try {
      const r = await o.grabador.empezar(tipo);
      estado.sonido = r.sonido;
    } catch (e) {
      estado.fase = "guardado"; estado.error = `El Graboso no despierta: ${(e as Error)?.message ?? e}`; avisar(estado.error, 2); cambio();
      return false;
    }
    estado.fase = "grabando"; estado.desdeMs = o.ahora(); cambio();
    avisar(estado.sonido ? "El Graboso graba lo que ves y oyes." : "El Graboso graba sin sonido: no hay micrófono.", 1);
    return true;
  }

  /** Seconds recorded so far (0 when it is not out). */
  const segundos = () => (estado.fase === "grabando" ? Math.max(0, (o.ahora() - estado.desdeMs) / 1000) : 0);

  async function guardar(): Promise<Clip | null> {
    if (estado.fase !== "grabando") return cerrando ? cerrando.then(() => estado.clip) : null;
    const duracionS = Math.min(estado.topeS, segundos());
    estado.fase = "guardado"; cambio();
    cerrando = (async () => {
      const r = await o.grabador.parar();
      if (!r.blob || r.blob.size === 0) { estado.error = "El Graboso no retuvo nada."; avisar(estado.error, 2); }
      else {
        const corto = duracionS < TOPE_S.min;
        if (estado.clip) avisar("El clip anterior se sustituye por el nuevo.", 0);
        estado.clip = { blob: r.blob, tipo: r.tipo || tipo, duracionS: Math.round(duracionS * 10) / 10, conSonido: estado.sonido, nombre: nombreDeClip((o.fecha ?? (() => new Date()))(), r.tipo || tipo), corto };
        avisar(corto ? `Clip de ${Math.round(duracionS)} s guardado (la misión pide ${TOPE_S.min} s o más).` : `Clip de ${Math.round(duracionS)} s guardado. Puedes descargarlo.`, 1);
      }
    })().finally(() => { cerrando = null; cambio(); });
    await cerrando;
    return estado.clip;
  }

  /** Once per frame: cuts at the cap. Returns true when it cut. */
  function tic(): boolean {
    if (estado.fase !== "grabando" || segundos() < estado.topeS) return false;
    avisar("Tope alcanzado: el Graboso se cierra.", 1);
    void guardar();
    return true;
  }

  return {
    estado,
    sacar, guardar, tic, segundos,
    /** K or the button: out ↔ kept. */
    alternar(): Promise<unknown> { return estado.fase === "grabando" ? guardar() : estado.fase === "guardado" ? sacar() : Promise.resolve(false); },
    /** The cap for the next clip (recorded within the hard range); it does not cut the one running. */
    tope(s: unknown): number { estado.topeS = recortarTope(s); cambio(); return estado.topeS; },
    quitarClip(): void { estado.clip = null; cambio(); },
    contador(): string { return contador(segundos(), estado.topeS); },
  };
}
export type Graboso = ReturnType<typeof crearGraboso>;
