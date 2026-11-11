// contadores — the words a person READS from the counters' server (a refusal, a milestone, the /contadores list), in
// English (the fallback) and Spanish (i18n 5/5). Same convention as misiones/formato.ts: a catalogue of our own
// (features may not import the client's t()); the language is the WORLD's (`idioma` of its ficha.json). An omitted
// language is Spanish (what every call said before); an unknown language, or a key missing in one language, reads the
// English text, never an empty one. `{x}` is filled from `vars` in ONE pass. Pure; never throws.
// The typed commands (arranca, para, suma, reinicia) are the commands themselves and stay as they are in both languages.
export const IDIOMA_CONTADORES = "es";
export const TEXTOS_CONTADORES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: {
    no_puedes: "Whoever directs handles that counter (the «Manage rituals» permission of the organisation).",
    acercate: "Get closer to {nombre} to handle it.",
    no_hay: "There is no counter «{id}».",
    di_equipo: "Say the team of {nombre}: 1 to 16 lowercase letters, digits or hyphens (e.g. /contador {id}:red arranca).",
    equipos_tope: "{nombre} already has {max} teams (the maximum).",
    lista: "Counters: {lista}. Command: /contador <id>[:team] arranca|para|suma [n]|reinicia",
    sin_contadores: "This world has no counters (they go in entorno/contadores.json).",
    cuanto: "How much: a whole number (/contador scoreboard suma 3).",
    no_entiendo: "I do not understand «{orden}»: arranca, para, suma [n], reinicia.",
    tope_alcanzado: "{valor}, limit reached",
    tiempo: "time",
    en_marcha: "running",
    arranca: "starts",
    parado_en: "stopped at {valor}",
    reiniciado_a: "reset to {valor}",
    quedan_minutos: "{n} minutes left",
    quedan_minuto: "1 minute left",
    quedan_segundos: "{n} seconds left",
  },
  es: {
    no_puedes: "Ese contador lo maneja quien dirige (permiso «Gestionar rituales» de la organización).",
    acercate: "Acércate a {nombre} para manejarlo.",
    no_hay: "No hay ningún contador «{id}».",
    di_equipo: "Di el equipo de {nombre}: 1 a 16 letras minúsculas, cifras o guiones (p. ej. /contador {id}:rojo arranca).",
    equipos_tope: "{nombre} ya tiene {max} equipos (el máximo).",
    lista: "Contadores: {lista}. Orden: /contador <id>[:equipo] arranca|para|suma [n]|reinicia",
    sin_contadores: "Este mundo no tiene contadores (se ponen en entorno/contadores.json).",
    cuanto: "Cuánto: un número entero (/contador marcador suma 3).",
    no_entiendo: "No entiendo «{orden}»: arranca, para, suma [n], reinicia.",
    tope_alcanzado: "{valor}, tope alcanzado",
    tiempo: "tiempo",
    en_marcha: "en marcha",
    arranca: "arranca",
    parado_en: "parado en {valor}",
    reiniciado_a: "reiniciado a {valor}",
    quedan_minutos: "quedan {n} minutos",
    quedan_minuto: "quedan 1 minuto",
    quedan_segundos: "quedan {n} segundos",
  },
};
/** The text for `clave` in `idioma` (fallback: English), with `{x}` filled from `vars`. Pure; never throws, never empty for a known key. */
export function textoContadores(idioma: string | undefined, clave: string, vars: Readonly<Record<string, string | number>> = {}): string {
  const t = TEXTOS_CONTADORES[idioma ?? IDIOMA_CONTADORES]?.[clave] ?? TEXTOS_CONTADORES.en[clave] ?? clave;
  return t.replace(/\{(\w+)\}/g, (_, k: string) => (Object.hasOwn(vars, k) ? String(vars[k]) : `{${k}}`));
}
