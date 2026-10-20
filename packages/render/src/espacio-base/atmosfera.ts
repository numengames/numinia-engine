// espacio-base · atmosfera (H2): the sky of the espacio base as an `Atmosfera` for entorno.ts (the same door the nature uses, R7.1): the analytic sky (stars,
// full moon) over near-black night stops and light arena day stops, and a fog that melts the lines into the horizon. Day and night are the ENGINE's: entorno
// moves `diaU` with the world's clock (features/entorno, hora.valor + hora.mueveElSol); this only says what colours each end has. A world that brings no
// entorno.json is given a night clock by the server (features/mundo.ts), so it is born at night.
import type { Atmosfera } from "../entorno.ts";
import { cieloAnalitico } from "../cielo-analitico.ts";
import { CIELO_E04, ESPACIO_BASE } from "../naturaleza/paleta.ts";

/** Fog distances (m): clear to 25 m, the horizon colour at 200 m (= the world's edge: the border is never seen). */
export const NIEBLA_BASE = { cerca: 25, lejos: 200 } as const;
const COLORES = { ...CIELO_E04, estrella: ESPACIO_BASE.estrella, luna: ESPACIO_BASE.luna } as typeof CIELO_E04;
/** ONE function object: entorno.ts builds the sky's materials once per sky function. */
const CIELO_BASE: NonNullable<Atmosfera["cielo"]> = (u) => cieloAnalitico(u as never, COLORES, { lunaLlena: true });

export const atmosferaEspacioBase = (): Atmosfera => ({
  dia: { ...ESPACIO_BASE.dia }, noche: { ...ESPACIO_BASE.noche },
  velo: ESPACIO_BASE.dia.horizonte, bruma: { color: ESPACIO_BASE.dia.suelo, altura: -100, densidad: 0 },
  ocaso: CIELO_E04.ocaso, sol: CIELO_E04.sol, niebla: { ...NIEBLA_BASE }, tono: "neutro", cielo: CIELO_BASE,
});
