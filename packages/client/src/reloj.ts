// reloj (U3): the clock beside the minimap — what it says and when it changes. Pure: no DOM, tested in Node (test/marcos.test.ts).
// It shows HH:MM of the device's clock, local or UTC by the setting `interfaz.hora`; it redraws once a minute (a timer to the next
// minute, nothing per frame). The server's clock is not shown yet: the page has no server time to read (see work/ux/b6-u3/LEEME.md).

export type ModoHora = "local" | "utc";
export const MODOS_HORA: readonly ModoHora[] = ["local", "utc"];
export const MODO_HORA_DEFECTO: ModoHora = "local";
export const modoHora = (v: unknown): ModoHora => (v === "utc" ? "utc" : MODO_HORA_DEFECTO);

const dos = (n: number) => String(n).padStart(2, "0");
/** «22:14» (local) or «22:14 UTC». `ms` is epoch milliseconds. */
export function formatoHora(ms: number, modo: ModoHora): string {
  const d = new Date(ms);
  return modo === "utc" ? `${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())} UTC` : `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
/** What the clock says to a screen reader or on hover. */
export const etiquetaHora = (modo: ModoHora): string => (modo === "utc" ? "Hora UTC" : "Hora local de tu aparato");
/** Milliseconds to the next minute change (1 s at least, so a timer never spins). */
export const msHastaMinuto = (ms: number): number => Math.max(1000, 60000 - (ms % 60000) + 50);
