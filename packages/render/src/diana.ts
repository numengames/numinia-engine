// diana: how a dartboard looks, painted in 2D (one function for the page's throwing view, the 3D board's texture in the
// plaza and the board on your real wall in AR). Real proportions: radius 1 = the outer edge of the double ring (170 mm
// on a 451 mm board); the numbers ring goes out to PINTADA. The ring numbers are the scorer's own
// (features/dardos/server.ts ANILLOS; test/dardos.test.ts checks both lists agree). render imports nothing but three,
// and this file not even that: plain canvas.
export const ANILLOS_DIANA = { dobleBull: 0.0747, bull: 0.187, tripleIn: 0.582, tripleOut: 0.629, dobleIn: 0.953, dobleOut: 1.0 } as const;
export const SECTORES_DIANA = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5] as const;
/** The painted board's radius in board radii (the dark ring with the numbers ends here). */
export const PINTADA = 1.34;
/** A real board's double ring outer radius in metres (the size of radius 1 in AR and in the plaza). */
export const RADIO_M = 0.17;
/** A real board: the bull's eye 1.73 m above the floor, the throwing line 2.37 m from the face. */
export const ALTURA_M = 1.73, LINEA_M = 2.37;

const COLOR = { oscuro: "#1d2228", claro: "#efe3c4", rojo: "#c8453a", verde: "#3f8f5a", borde: "#262d35", alambre: "#b9a37a", numero: "#ffd27a" };

/** Paint a board filling a `px`×`px` square of `ctx` (top-left at 0,0), with the face's centre in the middle. */
export function pintarDiana(ctx: CanvasRenderingContext2D, px: number): void {
  const c = px / 2, u = c / PINTADA; // pixels per board radius
  ctx.save();
  ctx.clearRect(0, 0, px, px);
  ctx.translate(c, c);
  // the dark outer ring with the numbers
  ctx.fillStyle = COLOR.borde; ctx.beginPath(); ctx.arc(0, 0, PINTADA * u, 0, Math.PI * 2); ctx.fill();
  const sector = (r0: number, r1: number, i: number, color: string) => {
    // sector i is centred on i*18° clockwise from the top; canvas angles go clockwise from +x
    const a = ((i * 18 - 9 - 90) * Math.PI) / 180, b = a + (18 * Math.PI) / 180;
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, r1 * u, a, b); ctx.arc(0, 0, r0 * u, b, a, true); ctx.closePath(); ctx.fill();
  };
  const A = ANILLOS_DIANA;
  for (let i = 0; i < 20; i++) {
    const par = i % 2 === 0;
    sector(A.bull, A.tripleIn, i, par ? COLOR.oscuro : COLOR.claro);
    sector(A.tripleIn, A.tripleOut, i, par ? COLOR.rojo : COLOR.verde);
    sector(A.tripleOut, A.dobleIn, i, par ? COLOR.oscuro : COLOR.claro);
    sector(A.dobleIn, A.dobleOut, i, par ? COLOR.rojo : COLOR.verde);
  }
  ctx.fillStyle = COLOR.verde; ctx.beginPath(); ctx.arc(0, 0, A.bull * u, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLOR.rojo; ctx.beginPath(); ctx.arc(0, 0, A.dobleBull * u, 0, Math.PI * 2); ctx.fill();
  // the brass wire (thin lines between sectors and rings)
  ctx.strokeStyle = COLOR.alambre; ctx.lineWidth = Math.max(1, u * 0.008);
  for (const r of [A.bull, A.tripleIn, A.tripleOut, A.dobleIn, A.dobleOut]) { ctx.beginPath(); ctx.arc(0, 0, r * u, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 20; i++) {
    const a = ((i * 18 - 9 - 90) * Math.PI) / 180;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * A.bull * u, Math.sin(a) * A.bull * u); ctx.lineTo(Math.cos(a) * A.dobleOut * u, Math.sin(a) * A.dobleOut * u); ctx.stroke();
  }
  // the numbers
  ctx.fillStyle = COLOR.numero; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(u * 0.17)}px system-ui, sans-serif`;
  for (let i = 0; i < 20; i++) {
    const a = ((i * 18 - 90) * Math.PI) / 180, r = ((A.dobleOut + PINTADA) / 2) * u;
    ctx.fillText(String(SECTORES_DIANA[i]), Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.restore();
}

/** A point of the face (board radii, y up) → pixels in a `px` square painted by pintarDiana. */
export const caraAPixel = (x: number, y: number, px: number): [number, number] => { const u = px / 2 / PINTADA; return [px / 2 + x * u, px / 2 - y * u]; };
/** Pixels in a `px` square → a point of the face (board radii, y up). */
export const pixelACara = (cx: number, cy: number, px: number): [number, number] => { const u = px / 2 / PINTADA; return [(cx - px / 2) / u, (px / 2 - cy) / u]; };
