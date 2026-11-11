// director — the words a person READS from the director's server (a refusal, a notice to whoever typed the command),
// in English (the fallback) and Spanish (i18n 5/5). Same convention as misiones/formato.ts: a catalogue of our own
// (features may not import the client's t()); the language is the WORLD's (`idioma` of its ficha.json). An omitted
// language is Spanish (what every call said before); an unknown language, or a key missing in one language, reads the
// English text, never an empty one. `{x}` is filled from `vars` in ONE pass. Pure; never throws.
// The typed commands (/escena, /escenas, /narrar, /convocar) are the commands themselves and stay as they are.
export const IDIOMA_DIRECTOR = "es";
export const TEXTOS_DIRECTOR: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: {
    no_puedes: "Directing needs the «Manage rituals» permission of the organisation (Moderation and Administration have it).",
    persona_n: "Person {n}",
    no_escena: "There is no scene «{texto}». Type /escenas to see them.",
    escena_puesta: "Scene set: {nombre}.",
    que_narras: "What do you narrate? Write the line: /narrar Night falls over the harbour.",
    ven_aqui: "come here",
    convocatoria: "Summons sent to {n} person(s). You will see how many come.",
    escenas: "Scenes: {lista}. Set one with /escena <number or name>.",
  },
  es: {
    no_puedes: "Para dirigir hace falta el permiso «Gestionar rituales» de la organización (lo tienen Moderación y Administración).",
    persona_n: "Persona {n}",
    no_escena: "No hay ninguna escena «{texto}». Escribe /escenas para verlas.",
    escena_puesta: "Escena puesta: {nombre}.",
    que_narras: "¿Qué narras? Escribe la línea: /narrar Cae la noche sobre el puerto.",
    ven_aqui: "ven aquí",
    convocatoria: "Convocatoria enviada a {n} persona(s). Verás cuántas vienen.",
    escenas: "Escenas: {lista}. Pon una con /escena <número o nombre>.",
  },
};
/** The text for `clave` in `idioma` (fallback: English), with `{x}` filled from `vars`. Pure; never throws, never empty for a known key. */
export function textoDirector(idioma: string | undefined, clave: string, vars: Readonly<Record<string, string | number>> = {}): string {
  const t = TEXTOS_DIRECTOR[idioma ?? IDIOMA_DIRECTOR]?.[clave] ?? TEXTOS_DIRECTOR.en[clave] ?? clave;
  return t.replace(/\{(\w+)\}/g, (_, k: string) => (Object.hasOwn(vars, k) ? String(vars[k]) : `{${k}}`));
}
