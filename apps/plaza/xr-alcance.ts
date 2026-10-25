// xr-alcance (lote 5, «los PNJ solo se activan de cerca»): the VR ray reaches 12 m (packages/render/src/manos.ts RAYO_M), the server only
// lets you talk to a person (or use a quest thing) within its radius (api.within). Aiming at a far person used to send the intent anyway:
// a far, hardly drawn robot «answered» with a refusal. The ray now only lands on what is in reach — the same list that gives the E prompt
// on a flat screen (`features.reachable`) — so a far person is not aimed at, no ray stops on it, nothing is sent.
// Pure apart from the two functions it is given; `leer` is asked at most once per `cadaMs` (the ray asks per thing, per hand, per frame).
export type EnAlcance = { feature: string; key: string };
export function crearAlcance(o: { leer: () => readonly EnAlcance[]; ahora?: () => number; cadaMs?: number }): (feature: string, key: string) => boolean {
  const ahora = o.ahora ?? (() => performance.now()), cada = o.cadaMs ?? 100;
  let hasta = -Infinity, claves = new Set<string>();
  return (feature, key) => {
    const t = ahora();
    if (t >= hasta) { hasta = t + cada; claves = new Set(o.leer().map((c) => `${c.feature}:${c.key}`)); }
    return claves.has(`${feature}:${key}`);
  };
}
