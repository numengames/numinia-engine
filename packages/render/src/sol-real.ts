// sol-real (H-sol, D-076): where the sun really is, computed in the browser from the date and an approximate place. Pure: no DOM, no
// network, no weather service. The method is the NOAA solar-position approximation (Spencer/Meeus-class series: the sun's declination
// and the equation of time from the day of the year, the hour angle from the clock and the longitude), good to a fraction of a degree,
// which is far finer than a game sky needs. The place is rounded to 1° (about 100 km) BEFORE it is used, so what this module and
// anything built on it ever sees is only the approximate zone (D-076).
// COPIED from: NOAA Global Monitoring Laboratory, «Solar Calculation Details» (gml.noaa.gov/grad/solcalc/calcdetails.html): fractional
// year γ, eqtime, decl, time offset, true solar time, hour angle, zenith, azimuth.
// CHANGED: returns the engine's own convention (altura in degrees above the horizon, rumbo = compass bearing -180..180 with east +90,
// south ±180, west -90, as entorno's `direccion` reads it) and the local SOLAR hour (0..24) the sky's day/night cycle uses.

export type SolReal = { altura: number; rumbo: number; hora: number };
const RAD = Math.PI / 180;

/** The place, rounded to a whole degree: the only precision the sun module accepts. */
export const zonaAproximada = (lat: number, lon: number): { lat: number; lon: number } => ({
  lat: Math.max(-90, Math.min(90, Math.round(lat))),
  lon: ((((Math.round(lon) + 180) % 360) + 360) % 360) - 180,
});

/** The sun for a moment (`fechaMs`, epoch ms, UTC) and a place (degrees; rounded to the zone first). */
export function posicionSol(fechaMs: number, latitud: number, longitud: number): SolReal {
  const { lat, lon } = zonaAproximada(latitud, longitud);
  const f = new Date(fechaMs);
  const inicioAnio = Date.UTC(f.getUTCFullYear(), 0, 1), diaDelAnio = Math.floor((fechaMs - inicioAnio) / 86400000) + 1;
  const horaUTC = f.getUTCHours() + f.getUTCMinutes() / 60 + f.getUTCSeconds() / 3600;
  const gamma = ((2 * Math.PI) / 365) * (diaDelAnio - 1 + (horaUTC - 12) / 24);
  const eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma)); // minutes
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma); // rad
  const minutosSolares = ((horaUTC * 60 + eqtime + 4 * lon) % 1440 + 1440) % 1440; // true solar time at this longitude, minutes
  const angulo = (minutosSolares / 4 - 180) * RAD; // hour angle: 0 at solar noon, negative in the morning
  const la = lat * RAD;
  const cosZ = Math.max(-1, Math.min(1, Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(angulo)));
  const zenit = Math.acos(cosZ);
  const altura = 90 - zenit / RAD;
  // azimuth from the north, clockwise: atan2 of the east and north components of the sun's direction
  const este = -Math.cos(decl) * Math.sin(angulo);
  const norte = Math.sin(decl) * Math.cos(la) - Math.cos(decl) * Math.sin(la) * Math.cos(angulo);
  let rumbo = Math.atan2(este, norte) / RAD; // -180..180: east +90, west -90, south ±180
  if (Math.abs(rumbo) < 1e-9) rumbo = 0;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return { altura: r1(altura), rumbo: r1(rumbo), hora: Math.round((minutosSolares / 60) * 100) / 100 };
}

/** Is this a usable position from the browser (finite numbers in range)? */
export const posicionValida = (lat: unknown, lon: unknown): boolean =>
  typeof lat === "number" && typeof lon === "number" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
