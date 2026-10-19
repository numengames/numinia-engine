// pesca en VR — qué hacer ahora, en una frase (pura: sin three ni DOM; test/pesca-mango.test.ts). Pablo, en las gafas:
// «cuando pica ¿tengo que estar agitando la caña o qué? hay que poner instrucciones». Una por fase, sobre la caña.
// No cambia el gesto ni el servidor: dice lo que ya pasa (lanzar = golpe de muñeca; tirón = hacia arriba; recoger = gatillo).
export type FaseVR = "nada" | "espera" | "mordisqueo" | "picada" | "pelea";
export type EntradaInstruccion = { fase: FaseVR; tension: number; arrancada: "no" | "aviso" | "si"; /** acabo de pescar y aún tengo la caña */ capturado?: boolean };

export const INSTRUCCION = {
  reposo: "Lanza con un golpe de muñeca hacia delante",
  espera: "Espera a que pique",
  mordisqueo: "No tires todavía",
  picada: "¡TIRÓN hacia arriba ahora!",
  pelea: "Mantén el gatillo para recoger; suelta si tensa mucho",
  tensa: "¡Suelta el gatillo, que tensa mucho!",
  capturado: "Agarre otra vez para dejar la caña",
} as const;

/** The one line to show above the rod I hold. In the fight it switches to «let go» when the line is about to snap or the fish surges. */
export function instruccion(e: EntradaInstruccion): string {
  switch (e.fase) {
    case "nada": return e.capturado ? INSTRUCCION.capturado : INSTRUCCION.reposo;
    case "espera": return INSTRUCCION.espera;
    case "mordisqueo": return INSTRUCCION.mordisqueo;
    case "picada": return INSTRUCCION.picada;
    case "pelea": return e.arrancada !== "no" || e.tension >= 80 ? INSTRUCCION.tensa : INSTRUCCION.pelea;
  }
}

/** Break a sentence into lines of at most `max` characters at spaces (the gauge is a small card). */
export function envolver(texto: string, max = 24): string[] {
  const out: string[] = [];
  let linea = "";
  for (const w of texto.split(" ")) {
    if (linea && (linea + " " + w).length > max) { out.push(linea); linea = w; } else linea = linea ? linea + " " + w : w;
  }
  if (linea) out.push(linea);
  return out;
}
