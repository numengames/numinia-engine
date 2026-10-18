// dardos duel, the pure parts (AR-D3): what the 3D scoreboard says, when a throw is allowed, and where the rival's dart
// is while it flies in. No three, no DOM: unit tests run it without a screen (test/dardos-duelo-ar.test.ts). The 3D
// side is dardos-duelo-ar.ts. The shapes below are the controller's `Duelo` (features/dardos/client.ts) seen
// structurally, because render imports nothing from features.

export type JugadorV = { entity: number; nombre: string; puntos: number };
export type DueloV = {
  ronda: number; esperando: boolean; turnoDe: number | null; yo: boolean; miTurno: boolean;
  rival: JugadorV | null; yoPuntos: number; a: JugadorV; b: JugadorV | null;
  fin: { ganador: number | null; empate: boolean; abandono: boolean; texto: string; gane: boolean } | null;
};
export type DardoV = { quien: number; sitio: string; numero: number; x: number; y: number };

/** The rival's dart takes this long (s) from the side of the board to its landing point. */
export const VUELO_RIVAL_S = 0.4;

export type Panel = {
  fase: "espera" | "juego" | "fin" | "nada";
  /** «Ronda 2/3», or «» while waiting / for no match. */
  ronda: string;
  /** Two rows in the order host, guest. `turno`: whose turn it is (highlighted); `yo`: this row is me. */
  filas: { nombre: string; puntos: number; turno: boolean; yo: boolean }[];
  /** The footer line: waiting, whose turn, or how it ended. */
  pie: string;
  /** Colour hint for the footer: good (you win / your turn), bad (you lose), neutral. */
  tono: "bien" | "mal" | "neutro";
};

/** Everything the panel shows, from the controller's `duelo()` (null = no match: an empty panel). `rondas` = rounds of the board. */
export function panelDe(d: DueloV | null, rondas: number): Panel {
  if (!d) return { fase: "nada", ronda: "", filas: [], pie: "", tono: "neutro" };
  const yoEsA = d.yo && d.rival !== null ? d.rival.entity !== d.a.entity : d.yo; // a player without a rival yet is the host
  const fila = (j: JugadorV | null, esA: boolean) => ({
    nombre: j ? j.nombre : "…", puntos: j ? j.puntos : 0, yo: d.yo && (esA === yoEsA),
    turno: !!j && !d.esperando && !d.fin && d.turnoDe === j.entity,
  });
  const filas = [fila(d.a, true), fila(d.b, false)];
  if (d.fin) {
    const f = d.fin;
    const pie = !d.yo ? f.texto : f.empate ? "Empate" : f.gane ? (f.abandono ? "Ganas · tu rival se fue" : "Ganas") : "Pierdes";
    return { fase: "fin", ronda: "", filas, pie, tono: !d.yo || f.empate ? "neutro" : f.gane ? "bien" : "mal" };
  }
  if (d.esperando) return { fase: "espera", ronda: "", filas, pie: "Esperando rival…", tono: "neutro" };
  const quien = d.turnoDe === d.a.entity ? d.a : d.b;
  const pie = d.miTurno ? "Tu turno" : `Es el turno de ${quien ? quien.nombre : "tu rival"}`;
  return { fase: "juego", ronda: `Ronda ${d.ronda}/${Math.max(d.ronda, rondas)}`, filas, pie, tono: d.miTurno ? "bien" : "neutro" };
}

/** A throw of mine is allowed only in a live match on my turn. `enDuelo`: this AR session joined a duel board (else v1: always). */
export function puedeLanzar(d: DueloV | null, enDuelo: boolean): boolean {
  if (!enDuelo) return true;
  return !!d && d.yo && d.miTurno && !d.esperando && !d.fin;
}

const clave = (x: DardoV) => `${x.quien}:${x.numero}`;
/** The darts of the rival in `lista` that were not in `vistos` yet (and now are: `vistos` is updated). Mine are never flown in. */
export function llegadas(vistos: Set<string>, lista: DardoV[], yo: number): DardoV[] {
  const nuevos: DardoV[] = [];
  const ahora = new Set<string>();
  for (const x of lista) {
    const k = clave(x); ahora.add(k);
    if (!vistos.has(k) && x.quien !== yo) nuevos.push(x);
  }
  vistos.clear(); for (const k of ahora) vistos.add(k);
  return nuevos;
}

export type P3 = { x: number; y: number; z: number };
/** Where a rival's dart starts (board-local metres, board centre at the origin, +z toward the room): out to one side and above. */
export function salidaRival(x: number, y: number, numero: number, radio: number): P3 {
  const lado = numero % 2 === 0 ? 1 : -1; // alternate sides so the three darts do not come on one line
  return { x: x * radio + lado * 0.5, y: y * radio + 0.55, z: 0.9 };
}
/** The dart at time `t` s of its flight: a short arc from `a` to `b`, plus how far along it is (0-1, `lista` when done). */
export function vueloRival(a: P3, b: P3, t: number, duracion = VUELO_RIVAL_S): { pos: P3; u: number; lista: boolean } {
  const u = Math.max(0, Math.min(1, duracion > 0 ? t / duracion : 1));
  const lift = Math.sin(u * Math.PI) * 0.1;
  return { pos: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u + lift, z: a.z + (b.z - a.z) * u }, u, lista: u >= 1 };
}

/** Canvas size of the 3D panel (one texture, one plane). */
export const PANEL_PX = { w: 512, h: 192 } as const;
const TONO = { bien: "#9fe8a8", mal: "#ff8a80", neutro: "#d7dee6" } as const;
/** Paint the panel (plain canvas, like diana.ts: WebXR draws no DOM). Called only when the match changes. */
export function pintarPanel(ctx: CanvasRenderingContext2D, p: Panel): void {
  const { w, h } = PANEL_PX;
  ctx.clearRect(0, 0, w, h);
  if (p.fase === "nada") return;
  ctx.fillStyle = "rgba(20,24,30,.92)"; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 22); ctx.fill();
  ctx.textBaseline = "middle";
  if (p.ronda) { ctx.fillStyle = "#c9d3dc"; ctx.font = "600 26px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillText(p.ronda, w / 2, 24); }
  const nombre = (s: string) => (s.length > 14 ? `${s.slice(0, 13)}…` : s);
  p.filas.forEach((f, i) => {
    const y = 56 + i * 40;
    if (f.turno) { ctx.fillStyle = "rgba(255,210,122,.22)"; ctx.beginPath(); ctx.roundRect(12, y - 18, w - 24, 36, 10); ctx.fill(); }
    ctx.fillStyle = f.turno ? "#ffd27a" : "#eef2f6"; ctx.font = `${f.turno ? 800 : 600} 30px system-ui, sans-serif`;
    ctx.textAlign = "left"; ctx.fillText(`${f.turno ? "▶ " : ""}${nombre(f.nombre)}${f.yo ? " (tú)" : ""}`, 24, y);
    ctx.textAlign = "right"; ctx.fillText(String(f.puntos), w - 28, y);
  });
  ctx.fillStyle = TONO[p.tono]; ctx.font = "800 32px system-ui, sans-serif"; ctx.textAlign = "center";
  ctx.fillText(p.pie.length > 30 ? `${p.pie.slice(0, 29)}…` : p.pie, w / 2, 160);
}
