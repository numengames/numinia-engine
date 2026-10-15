// habitante@1 (P4): an AI inhabitant as a text file of its adventure (aventuras/<nombre>/habitantes/<id>.json).
// Pure data, checked here; the engine reads id + nombre from it (who may enter as that inhabitant, and the name all
// see, always with « · IA»); the inhabitants' service reads all of it. Escalón 0 = a script with no LLM (E0);
// 2 = it answers freely with a language model when called (E2, P5a); 4 = and it builds with the world's tools when the
// world lets it (E4). With 2 or 4, `cerebro.persona` says who it is to the model; without a key the script answers.
// Validation returns issues, never throws.
import type { Issue, Result } from "../../core/src/index.ts";
import { AGENTE_ID } from "../../instance/src/identidad.ts";

export const FORMATO = "habitante@1";
export const NOMBRE_MAX = 32;   // bytes: + « · IA» must fit the chat's 48
export const FRASE_MAX = 200;   // bytes: one chat message (features/chat TEXTO_MAX)
export const RUTA_MAX = 32;     // points of its walk
export const LADO_M = 60;       // every point within ±60 m of the centre (the plaza)
export const GESTOS = ["saludar", "bailar"] as const; // features/gestos today; the five of SABER §3.4 come with clips
export const ESCALONES = [0, 2, 4] as const;            // E1 (rephrase) and E3 (initiative) come with P5b
export const PERSONA_MAX = 1500;                        // bytes: who it is, for the model (written by the world's admin)

export type Punto = { x: number; z: number };
export type Habitante = {
  formato: typeof FORMATO;
  id: string;                 // a-z, 0-9, dash; 2–24; becomes the identity «ia-<id>»
  nombre: string;             // what people see (+ « · IA», put by the server)
  descripcion: string;        // one line: who it is (its card; also what it says when asked who it is)
  responsable: string;        // the person or team that answers for it (D5)
  escalon: (typeof ESCALONES)[number]; // 0 script · 2 talks with a model · 4 and builds (DISENO-IAS-MOTOR.md §4)
  cerebro?: { persona: string }; // with escalón 2 or 4: who it is and how it speaks, for the model (trusted: the admin writes it)
  ruta: Punto[];              // where it walks, in order, in a loop (one point = it stays there)
  pausa: number;              // seconds it stays at each point (0–120)
  saludo: { radio: number; cada: number; frases: string[]; gesto?: (typeof GESTOS)[number] }; // greets who comes near; {nombre} = their name
  respuestas: { si: string[]; dice: string }[]; // when called by its name: the first whose word appears answers
  siNoEntiende: string;       // when called and nothing matched
};

const bytes = (t: string) => new TextEncoder().encode(t).length;

/** Check one habitante@1 object. */
export function validarHabitante(o: unknown, donde = "habitante"): Result<Habitante> {
  const issues: Issue[] = [];
  const bad = (path: string, message: string) => issues.push({ path: `${donde}.${path}`, message });
  if (!o || typeof o !== "object" || Array.isArray(o)) return { ok: false, issues: [{ path: donde, message: "un objeto JSON" }] };
  const h = o as Record<string, unknown>;
  const texto = (k: string, max: number, vacio = false) => {
    const v = h[k];
    if (typeof v !== "string" || (!vacio && !v.trim()) || bytes(v) > max) bad(k, `texto${vacio ? "" : " no vacío"} de hasta ${max} bytes`);
  };
  if (h.formato !== FORMATO) bad("formato", `"${FORMATO}"`);
  if (typeof h.id !== "string" || !AGENTE_ID.test(h.id)) bad("id", "2–24 caracteres: a-z, 0-9 y guion, empieza por letra");
  texto("nombre", NOMBRE_MAX);
  if (typeof h.nombre === "string" && /\bIA\b|[<>{}]/.test(h.nombre)) bad("nombre", "sin «IA» (la pone el servidor) ni < > { }");
  texto("descripcion", FRASE_MAX); texto("responsable", 80); texto("siNoEntiende", FRASE_MAX);
  if (!ESCALONES.includes(h.escalon as never)) bad("escalon", "0 (guion sin LLM), 2 (contesta con un modelo) o 4 (y construye)");
  const ce = h.cerebro as Record<string, unknown> | undefined;
  if (ce !== undefined && (!ce || typeof ce !== "object" || typeof ce.persona !== "string" || !ce.persona.trim() || bytes(ce.persona) > PERSONA_MAX || Object.keys(ce).some((k) => k !== "persona"))) bad("cerebro", `{persona: texto de hasta ${PERSONA_MAX} bytes}`);
  if (typeof h.escalon === "number" && h.escalon > 0 && ce === undefined) bad("cerebro", "con escalón 2 o 4 hace falta {persona}: quién es para el modelo");
  const punto = (p: unknown) => !!p && typeof p === "object" && [(p as Punto).x, (p as Punto).z].every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= LADO_M);
  if (!Array.isArray(h.ruta) || h.ruta.length < 1 || h.ruta.length > RUTA_MAX || !h.ruta.every(punto)) bad("ruta", `1–${RUTA_MAX} puntos {x, z} en metros, dentro de ±${LADO_M}`);
  if (typeof h.pausa !== "number" || !(h.pausa >= 0 && h.pausa <= 120)) bad("pausa", "segundos entre 0 y 120");
  const s = h.saludo as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") bad("saludo", "{radio, cada, frases, gesto?}");
  else {
    if (typeof s.radio !== "number" || !(s.radio >= 1 && s.radio <= 15)) bad("saludo.radio", "metros entre 1 y 15");
    if (typeof s.cada !== "number" || !(s.cada >= 30 && s.cada <= 3600)) bad("saludo.cada", "segundos entre 30 y 3600 (no saluda dos veces a la misma persona antes)");
    if (!Array.isArray(s.frases) || s.frases.length < 1 || s.frases.length > 8 || !s.frases.every((f) => typeof f === "string" && f.trim() && bytes(f) <= FRASE_MAX - 40)) bad("saludo.frases", `1–8 frases de hasta ${FRASE_MAX - 40} bytes ({nombre} = a quien saluda)`);
    if (s.gesto !== undefined && !GESTOS.includes(s.gesto as never)) bad("saludo.gesto", `uno de ${GESTOS.join(", ")}`);
  }
  if (!Array.isArray(h.respuestas) || h.respuestas.length > 16) bad("respuestas", "hasta 16 {si: [palabras], dice}");
  else h.respuestas.forEach((r, i) => {
    const ok = r && typeof r === "object" && Array.isArray(r.si) && r.si.length >= 1 && r.si.every((w: unknown) => typeof w === "string" && w.trim().length >= 2 && bytes(w) <= 40) && typeof r.dice === "string" && r.dice.trim() && bytes(r.dice) <= FRASE_MAX;
    if (!ok) bad(`respuestas[${i}]`, `{si: 1+ palabras de 2–40 bytes, dice: hasta ${FRASE_MAX} bytes}`);
  });
  const conocidas = new Set(["formato", "id", "nombre", "descripcion", "responsable", "escalon", "cerebro", "ruta", "pausa", "saludo", "respuestas", "siNoEntiende", "notas"]);
  for (const k of Object.keys(h)) if (!conocidas.has(k)) bad(k, "campo desconocido en habitante@1");
  return issues.length ? { ok: false, issues } : { ok: true, value: h as unknown as Habitante };
}

/** Every inhabitant of an adventure (files of its `habitantes/` folder), the valid ones and what was wrong with the rest. */
export function leerHabitantes(ficheros: readonly { fichero: string; texto: string }[]): { habitantes: Habitante[]; problemas: string[] } {
  const habitantes: Habitante[] = [], problemas: string[] = [], vistos = new Set<string>();
  for (const f of ficheros) {
    if (!f.fichero.endsWith(".json")) continue;
    let o: unknown;
    try { o = JSON.parse(f.texto); } catch (e) { problemas.push(`${f.fichero}: JSON roto (${(e as Error).message})`); continue; }
    const r = validarHabitante(o, f.fichero);
    if (!r.ok) { problemas.push(...r.issues.map((i) => `${i.path}: ${i.message}`)); continue; }
    if (vistos.has(r.value.id)) { problemas.push(`${f.fichero}: id «${r.value.id}» repetido`); continue; }
    vistos.add(r.value.id); habitantes.push(r.value);
  }
  return { habitantes, problemas };
}
