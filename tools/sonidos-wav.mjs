// Vuelca los sonidos esquemáticos a .wav para ESCUCHARLOS fuera del navegador.
//   node tools/sonidos-wav.mjs [carpeta]          → un .wav por id + muestrario por grupos en la carpeta
// Por defecto escribe en $TMPDIR/sonidos-wav. Cada bucle se oye dos veces seguidas para juzgar la costura.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IDS, RECETAS, SR, generar, aWav } from "../packages/render/src/audio/sintesis.ts";

const dir = process.argv[2] ?? join(process.env.TMPDIR ?? ".", "sonidos-wav");
mkdirSync(dir, { recursive: true });
const grupos = { "1-interfaz": /^ui-/, "2-cuerpo": /^(pasos|aterrizaje|salto|dano)/, "3-objetos": /^(coger|golpe|puerta|cerradura|pesca|dardo|dados|teleport|renacer|moneda|maquina)/, "4-ambiente": /^(bed|capa|amb)-/ };
const pegar = (ss) => {
  const huecos = Math.floor(SR * 0.45), largo = ss.reduce((n, s) => n + s.datos.length + huecos, 0), datos = new Float32Array(largo);
  let o = 0;
  for (const s of ss) { datos.set(s.datos, o); o += s.datos.length + huecos; }
  return { id: "muestrario", datos, sr: SR };
};
for (const id of IDS) writeFileSync(join(dir, `${id}.wav`), aWav(generar(id)));
for (const [g, re] of Object.entries(grupos)) {
  const ss = IDS.filter((i) => re.test(i)).flatMap((i) => { const s = generar(i); return RECETAS[i].bucle ? [s, s] : [s]; });
  writeFileSync(join(dir, `muestrario-${g}.wav`), aWav(pegar(ss)));
  console.log(`${g}: ${IDS.filter((i) => re.test(i)).join(" ")}`);
}
console.log(`${IDS.length} sonidos en ${dir}`);
