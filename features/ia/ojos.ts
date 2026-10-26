// ia/ojos — the eyes of an AI say how big the model behind it is (card t_5096d6f4, MIS-229; Pablo 2026-10-17: «se vea en los
// ojos, con la escala que ya tenemos»). Pure: no three.js, no DOM, no world. FIRST SLICE: the scale and the way to read it from a
// model id; the card field that carries it and the draw on the avatar come next (see docs/RUNLOG.md).
//   · four steps: «sin modelo» (a script, escalón 0), pequeño, medio, grande — plus «no se sabe» (a model we cannot place).
//   · each step has a COLOUR and a SHAPE (a colour-blind person tells them by the shape: nothing is colour alone) and a text
//     for the card, so the card explains what the eyes mean.
//   · only the size travels, never the model's name: that is the organisation's data (the card's note).
//   · THE COLOURS ARE A PROPOSAL (Okabe–Ito, readable by the usual colour blindness): Pablo picks them; they live in ONE table.
export const TAMANOS = ["sin-modelo", "pequeno", "medio", "grande", "desconocido"] as const;
export type Tamano = (typeof TAMANOS)[number];
export type Ojos = { tamano: Tamano; color: number; forma: "punto" | "ranura" | "redondo" | "estrella"; texto: string };

/** The scale. Hex colours as three.js numbers; shapes are drawn in white when the eyes are too small to read a colour. */
export const ESCALA_OJOS: Readonly<Record<Tamano, Ojos>> = {
  "sin-modelo": { tamano: "sin-modelo", color: 0xd8d8d8, forma: "punto", texto: "Ojos de punto gris: un guion, sin modelo de lenguaje detrás." },
  pequeno: { tamano: "pequeno", color: 0x56b4e9, forma: "ranura", texto: "Ojos azules de ranura: un modelo pequeño (rápido y barato)." },
  medio: { tamano: "medio", color: 0xf0e442, forma: "redondo", texto: "Ojos amarillos y redondos: un modelo mediano." },
  grande: { tamano: "grande", color: 0xe69f00, forma: "estrella", texto: "Ojos naranja con brillo de estrella: un modelo grande (potente y caro)." },
  desconocido: { tamano: "desconocido", color: 0x999999, forma: "ranura", texto: "Ojos grises de ranura: hay un modelo detrás pero no sabemos su tamaño." },
};

/** Words in a model id that say its size, most specific first (the first rule that matches wins). Ids are matched in lower case. */
const REGLAS: readonly [RegExp, Tamano][] = [
  [/(opus|ultra|large|\bpro\b|\bmax\b|\bo[13]\b|gpt-?5(?!-(mini|nano))|(?:^|[^\d])(70|72|120|235|405)b\b)/, "grande"],
  [/(haiku|nano|mini|small|tiny|lite|flash|instant|(?:^|[^\d])(0?\.\d|1|2|3|4|7|8)b\b)/, "pequeno"],
  [/(sonnet|medium|turbo|(?:^|[^\d])(1[0-9]|2[0-9]|3[0-9])b\b)/, "medio"],
];

/** The size class of a model id («claude-sonnet-5» → medio, «anthropic/claude-opus-4:beta» → grande). Unknown ids are «desconocido», never guessed. */
export function tamanoDeModelo(modelo: string | undefined | null): Tamano {
  if (typeof modelo !== "string" || !modelo.trim()) return "desconocido";
  const m = modelo.toLowerCase();
  for (const [re, t] of REGLAS) if (re.test(m)) return t;
  return "desconocido";
}

/** What an inhabitant's file gives: escalón 0 is a script (no model), 2 and 4 think with `cerebro.modelo` (or, without one, the installer's default: `porDefecto`). */
export function tamanoDeHabitante(h: { escalon: number; modelo?: string }, porDefecto?: string): Tamano {
  if (h.escalon === 0) return "sin-modelo";
  return tamanoDeModelo(h.modelo ?? porDefecto);
}
export const ojosDe = (t: Tamano | string | undefined): Ojos => ESCALA_OJOS[(TAMANOS as readonly string[]).includes(t as string) ? (t as Tamano) : "desconocido"];
