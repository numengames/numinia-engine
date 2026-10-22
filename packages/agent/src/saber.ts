// saber (E2): reads an inhabitant's knowledge file (habitante@1 `cerebro.saber`) from the adventure folder, for the
// inhabitants' service (main.ts) — the one place that touches the disk for it; formato.ts stays pure.
// The path was already checked as text by formato.ts (`problemaRutaSaber`: «saber/<nombre>.md|txt», no «..», not
// absolute); here it is checked against the DISK too: the file must really sit inside the adventure folder once
// symlinks are followed (a link to /etc/passwd is refused), be a plain file, weigh at most SABER_MAX and be text.
// Every refusal is a sentence in Spanish for the log; nothing here throws.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { problemaPesoSaber, problemaRutaSaber } from "./formato.ts";
import type { LectorSaber } from "./formato.ts";

/** A reader of knowledge files under the adventure folder `dir`. */
export function lectorSaber(dir: string): LectorSaber {
  return (ruta) => {
    const mal = problemaRutaSaber(ruta);
    if (mal) return { problema: `no es una ruta válida: ${mal}` };
    let raiz: string, real: string;
    try { raiz = realpathSync(dir); } catch { return { problema: "no puedo abrir la carpeta de la aventura" }; }
    try { real = realpathSync(join(raiz, ruta)); } catch { return { problema: "no existe en la aventura (tiene que viajar con el mundo, en aventura/saber/)" }; }
    if (!real.startsWith(raiz + sep)) return { problema: "se sale de la carpeta de la aventura (un enlace): solo se lee lo que está dentro" };
    try {
      const st = statSync(real);
      if (!st.isFile()) return { problema: "no es un fichero" };
      const peso = problemaPesoSaber(st.size);
      if (peso) return { problema: peso };
      const texto = readFileSync(real, "utf8");
      if (texto.includes("\0")) return { problema: "no es texto" };
      return { texto };
    } catch (e) { return { problema: `no se puede leer (${(e as Error).message.slice(0, 80)})` }; }
  };
}
