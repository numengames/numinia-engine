// bienes — the words a person READS from the goods' server (what happened when they bring a receipt from another
// world, a notice about wearing a good), in English (the fallback) and Spanish (i18n 5/5). Same convention as
// misiones/formato.ts: a catalogue of our own (features may not import the client's t()); the language is the WORLD's
// (`idioma` of its ficha.json). An omitted language is Spanish (what every call said before); an unknown language, or a
// key missing in one language, reads the English text, never an empty one. `{x}` is filled from `vars` in ONE pass.
// Pure; never throws.
export const IDIOMA_BIENES = "es";
export const TEXTOS_BIENES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  en: {
    no_tuyo: "That object is not yours in this world.",
    sin_modelo: "«{nombre}» has no 3D model in this world: it cannot be worn.",
    recibo_no_vale: "That receipt is not valid: {motivo}.",
    ya_tuyo_nuestro: "«{n}» is already yours: this world signed it and it is in your inventory.",
    de_otro_invitado: "«{n}» was signed by this world, but it belongs to another guest: it does not become yours.",
    autentico_sin_confianza: "Authentic: «{n}», from the world {mundo}. This world does not trust whoever signed it: you see it as «from another world», but here it is not yours.",
    ya_en_inventario: "«{n}» was already in your inventory.",
    ya_otra_persona: "«{n}» was already brought by someone else to this world: a receipt is valid for one person only.",
    almacen_lleno: "I could not save it in this world (storage full).",
    es_tuyo_aqui: "«{n}», from the world {mundo}: this world trusts whoever signed it, so here it is yours too.",
  },
  es: {
    no_tuyo: "Ese objeto no es tuyo en este mundo.",
    sin_modelo: "«{nombre}» no tiene modelo 3D en este mundo: no se puede llevar puesto.",
    recibo_no_vale: "Ese recibo no vale: {motivo}.",
    ya_tuyo_nuestro: "«{n}» ya es tuyo: lo firmó este mundo y está en tu inventario.",
    de_otro_invitado: "«{n}» lo firmó este mundo, pero es de otro invitado: no pasa a ser tuyo.",
    autentico_sin_confianza: "Auténtico: «{n}», del mundo {mundo}. Este mundo no confía en quien lo firmó: lo ves como «de otro mundo», pero aquí no es tuyo.",
    ya_en_inventario: "«{n}» ya estaba en tu inventario.",
    ya_otra_persona: "«{n}» ya lo trajo otra persona a este mundo: un recibo vale para una sola persona.",
    almacen_lleno: "No pude guardarlo en este mundo (almacén lleno).",
    es_tuyo_aqui: "«{n}», del mundo {mundo}: este mundo confía en quien lo firmó, así que aquí también es tuyo.",
  },
};
/** The text for `clave` in `idioma` (fallback: English), with `{x}` filled from `vars`. Pure; never throws, never empty for a known key. */
export function textoBienes(idioma: string | undefined, clave: string, vars: Readonly<Record<string, string | number>> = {}): string {
  const t = TEXTOS_BIENES[idioma ?? IDIOMA_BIENES]?.[clave] ?? TEXTOS_BIENES.en[clave] ?? clave;
  return t.replace(/\{(\w+)\}/g, (_, k: string) => (Object.hasOwn(vars, k) ? String(vars[k]) : `{${k}}`));
}
