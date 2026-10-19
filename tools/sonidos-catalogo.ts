// S6 · el catálogo de sonidos de la casa: copia los lotes `nucleo` y `funcion` de la biblioteca de sonido (el trabajo
// de la historia S2, fuera del repo) a `activos/sonidos/` y escribe `features/sonido/catalogo.json` y
// `activos/sonidos/LICENCIAS.md`. Idempotente: con la misma biblioteca escribe los mismos bytes.
//
//   node tools/sonidos-catalogo.ts [--biblioteca <dir>] [--comprobar]
//
// `--comprobar` no escribe nada: solo dice si lo que hay en el repo coincide con la biblioteca (lo que mira la CI de
// un humano; el test que vigila el repo por sí mismo es `test/sonidos.test.ts`, que no necesita la biblioteca).
//
// Por qué los ficheros van a `activos/`: es la biblioteca de la casa (CC0 u obra propia, cada cosa con su licencia al
// lado) y el servidor la sirve POR SU CONTENIDO en `GET /a/<sha256>.<ext>` (`packages/server/src/activos.ts`), con un
// año de caché e `immutable`. Así los .opus NO entran en el paquete de arranque de la página (lo que mide
// `tools/tamano.mjs` es el grafo de imports estático del HTML): se bajan cuando suenan, igual que los .glb y los .vrm.
// Las camas y capas de zona (`bed-*`, `capa-*`) NO están aquí: son material de mundo y van a `numinia-assets`.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
/** Dónde está la biblioteca de sonido (historia S2). No es parte del repo: 331 MiB de fuentes sin recortar. */
const BIBLIOTECA_DEF = join(ROOT, "../../.hermes/profiles/ursa/work/motor-ar/sonido/biblioteca");
/** Los dos lotes que entran al repo del motor. `zona` (camas y capas) es de mundo: va en numinia-assets. */
export const LOTES = ["nucleo", "funcion"] as const;

/** Prioridad (0-100, como Wwise: más alto = se aparta más tarde) y cooldown en ms de cada id. La interfaz va a 100:
 *  un aviso no se calla nunca (accesibilidad, DISENO-SONIDO §2). Los cooldown salen de la cadencia real de cada cosa:
 *  una pisada cada 90 ms como mucho, un golpe cada 50, un dado cada 300. */
export const MEZCLA: Record<string, { prioridad: number; cooldown_ms: number }> = {
  "ui-pulsar": { prioridad: 100, cooldown_ms: 40 },
  "ui-confirmar": { prioridad: 100, cooldown_ms: 80 },
  "ui-error": { prioridad: 100, cooldown_ms: 120 },
  "ui-aviso": { prioridad: 100, cooldown_ms: 150 },
  "ui-chat": { prioridad: 100, cooldown_ms: 150 },
  "ui-gente": { prioridad: 100, cooldown_ms: 250 },
  "ui-logro": { prioridad: 100, cooldown_ms: 400 },
  "ui-cuenta-atras": { prioridad: 100, cooldown_ms: 40 },
  "pasos-piedra": { prioridad: 60, cooldown_ms: 90 },
  "pasos-madera": { prioridad: 60, cooldown_ms: 90 },
  "pasos-hierba": { prioridad: 60, cooldown_ms: 90 },
  "pasos-metal": { prioridad: 60, cooldown_ms: 90 },
  "pasos-agua": { prioridad: 60, cooldown_ms: 90 },
  aterrizaje: { prioridad: 70, cooldown_ms: 150 },
  "coger-soltar": { prioridad: 65, cooldown_ms: 80 },
  "golpe-material": { prioridad: 60, cooldown_ms: 50 },
  puerta: { prioridad: 70, cooldown_ms: 200 },
  cerradura: { prioridad: 75, cooldown_ms: 200 },
  "pesca-lanzar": { prioridad: 70, cooldown_ms: 150 },
  "pesca-chapuzon": { prioridad: 70, cooldown_ms: 150 },
  "pesca-cobrar": { prioridad: 75, cooldown_ms: 200 },
  "dardo-lanzar": { prioridad: 65, cooldown_ms: 80 },
  "dardo-impacto": { prioridad: 70, cooldown_ms: 80 },
  dados: { prioridad: 70, cooldown_ms: 300 },
  teleport: { prioridad: 85, cooldown_ms: 300 },
  renacer: { prioridad: 90, cooldown_ms: 500 },
  maquina: { prioridad: 65, cooldown_ms: 300 },
  // ── el colchón de ambiente (fichero, no sale de la biblioteca S2) ──
  "ambiente-numinia": { prioridad: 100, cooldown_ms: 0 },
  // ── los seis ids que solo tienen receta (sin fichero): S6f ──
  salto: { prioridad: 70, cooldown_ms: 150 },
  dano: { prioridad: 85, cooldown_ms: 120 },
  moneda: { prioridad: 60, cooldown_ms: 80 },
  "pesca-picada": { prioridad: 75, cooldown_ms: 150 },
  "ui-abrir": { prioridad: 100, cooldown_ms: 60 },
  "ui-cerrar": { prioridad: 100, cooldown_ms: 60 },
};

/** S6f · **El colchón de ambiente**. No sale de la biblioteca S2: es un fichero que un amigo de Numinia hizo a
 *  propósito para Numinia y cedió en **CC0**; vive ya en `activos/sonidos/ambiente-numinia/` y este constructor lo
 *  CONSERVA en vez de rehacerlo (ver `work/motor-vr/audio-esquematico/ambiente/LEEME.md`).
 *
 *  **TODO (Pablo): poner aquí el nombre del autor.** Está pendiente de que Pablo lo diga; no se lo inventa nadie. En
 *  cuanto esté, se cambia `autor` aquí, se vuelve a correr `npm run sonidos` y el nombre entra en LICENCIAS.md y en
 *  los créditos del motor. CC0 no obliga a citar; lo citamos igual.
 *
 *  Suena como CAMA ÚNICA EN BUCLE por streaming (`MediaElementAudioSourceNode`), nunca descodificada: son 113,5 s
 *  estéreo, que en PCM float32 a 48 kHz serían ~46 MB de RAM. El fichero está subido a −23 LUFS desde los −50,6 LUFS
 *  del original, y la ganancia por defecto del mundo (×0,042, `AMBIENTE_GANANCIA_DEF` en `audio/sonar.ts`) devuelve
 *  exactamente el volumen que quiso su autor. Solo suena si el mundo lo pide (`ficha.json` → `audio.ambiente`). */
export const COLCHON: Sonido = {
  id: "ambiente-numinia",
  uso: "colchon de ambiente del mundo",
  bus: "ambiente",
  lote: "nucleo",
  prioridad: MEZCLA["ambiente-numinia"].prioridad,
  cooldown_ms: MEZCLA["ambiente-numinia"].cooldown_ms,
  texto: "ambiente de fondo del mundo, muy bajo y continuo",
  duracion_s: 113.5065,
  bucle: true,
  licencia: "CC0-1.0",
  autor: ["pendiente (Pablo lo dirá)"],
  fuente: ["cedido por un amigo de Numinia para Numinia (CC0, dicho por Pablo el 2026-10-19)"],
  variantes: [{
    fichero: "activos/sonidos/ambiente-numinia/numinia-ambiente-bucle.opus",
    sha256: "d805da80605c3d218ab3dad9f4ac363b911fe4d61d49db2a4381bd099e6a3252",
    bytes: 829030,
    peso: 1,
    respaldo: "activos/sonidos/ambiente-numinia/numinia-ambiente-bucle.m4a",
    respaldo_sha256: "bba229c7ba9b0aab2ac93c4df92ddbc48915286a5b8102f1e71ab65b37b7a9ac",
    respaldo_bytes: 935571,
  }],
};

/** S6f · las filas **sin fichero**: ids que el motor sintetiza con una receta de `packages/render/src/audio/sintesis.ts`.
 *  Están en el catálogo porque el catálogo es la ÚNICA lista de verdad: aquí declaran su bus, su prioridad, su cooldown
 *  y su texto accesible, igual que cualquier otro sonido, y así el validador de la pieza no se queja de ellos.
 *  `fuente: "receta"` (una cadena, no la lista de enlaces de atribución) es la marca; `licencia: "propia"` porque no
 *  hay fichero de nadie: la receta es código del motor. Si algún día uno de estos ids consigue un fichero CC0, se le
 *  quita la fila de aquí y entra por la biblioteca: **el fichero gana y la receta queda de respaldo.** */
export type SonidoReceta = Omit<Sonido, "fuente" | "variantes"> & { fuente: "receta"; variantes: [] };
export const RECETAS_CATALOGO: SonidoReceta[] = ([
  ["salto", "pasos-propios", "el salto de tu propio avatar", "saltas"],
  ["dano", "efectos", "recibir dano", "te hacen dano"],
  ["moneda", "efectos", "cobrar una moneda", "recoges una moneda"],
  ["pesca-picada", "efectos", "pesca: algo pica en el sedal", "algo ha picado en el sedal"],
  ["ui-abrir", "interfaz", "se abre un panel", "se abre un panel"],
  ["ui-cerrar", "interfaz", "se cierra un panel", "se cierra el panel"],
] as const).map(([id, bus, uso, texto]) => ({
  id, uso, bus, lote: "funcion",
  prioridad: MEZCLA[id].prioridad, cooldown_ms: MEZCLA[id].cooldown_ms,
  texto, duracion_s: 0, bucle: false,
  licencia: "propia", autor: [], fuente: "receta", variantes: [],
}));

/** Los ficheros de `activos/sonidos/` que NO salen de la biblioteca y el constructor no debe borrar. */
export const CONSERVAR: readonly string[] = COLCHON.variantes.flatMap((v) => [v.fichero, v.respaldo]);

/** Los siete avisos de la casa (`SOUNDS` de packages/feature) y el fichero que suena cada uno, más el acorde de
 *  «Misión completada». Es la tabla que deja de ser osciladores en apps/plaza/misiones.ts. `magia` es el único que no
 *  sale de un `ui-*`: el teletransporte tiene su propio sonido en el catálogo y encaja mucho mejor que un pitido. */
export const CASA: Record<string, string> = {
  suave: "ui-chat",
  aviso: "ui-aviso",
  exito: "ui-confirmar",
  error: "ui-error",
  paso: "ui-pulsar",
  // «campana» es el aviso de que algo importante ha pasado (un contador que llega a su tope): la cuenta atrás de la
  // casa es lo más parecido a una campana. `ui-gente` se queda libre para lo suyo (quien entra en tu cercanía).
  campana: "ui-cuenta-atras",
  // «magia» es lo que suena al aparecer en otro sitio: el sonido del teletransporte ES ese. Va por el bus «efectos»
  // (no es interfaz: es algo que pasa en el mundo), pero como aviso de la casa suena sin panner, en la cabeza.
  magia: "teleport",
  completada: "ui-logro",
};

type VarBib = { fichero: string; peso: number; bytes: number; sha256: string; duracion_s: number; respaldo_m4a: string; bytes_m4a: number; origen_fichero: string };
type SonidoBib = { id: string; uso: string; bus: string; lote: string; variantes: VarBib[]; duracion_s: number; licencia: string[]; autor: string[]; url_origen: string[]; accesible_texto: string; bucle: boolean };

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");
/** «CC0 1.0» de la biblioteca → el identificador SPDX que usa el resto del repo (features/objetos/biblioteca.json). */
const spdx = (l: string): string => (/^cc0/i.test(l) ? "CC0-1.0" : l);
const unicos = (xs: readonly string[]): string[] => [...new Set(xs)];

export type Variante = { fichero: string; sha256: string; bytes: number; peso: number; respaldo: string; respaldo_sha256: string; respaldo_bytes: number };
export type Sonido = {
  id: string; uso: string; bus: string; lote: string; prioridad: number; cooldown_ms: number; texto: string;
  duracion_s: number; bucle: boolean; licencia: string; autor: string[]; fuente: string[]; variantes: Variante[];
};

/** Lo que entra al repo: los dos lotes de la biblioteca, con el sha256 recalculado sobre los bytes de verdad, más las
 *  filas que no salen de la biblioteca (el colchón de ambiente y las seis filas de receta, S6f). */
export function construir(biblioteca: string): { sonidos: (Sonido | SonidoReceta)[]; copias: { de: string; a: string }[] } {
  const crudo = JSON.parse(readFileSync(join(biblioteca, "catalogo.json"), "utf8")) as { sonidos: SonidoBib[] };
  const sonidos: (Sonido | SonidoReceta)[] = [], copias: { de: string; a: string }[] = [];
  for (const s of crudo.sonidos) {
    if (!(LOTES as readonly string[]).includes(s.lote)) continue;
    const m = MEZCLA[s.id];
    if (!m) throw new Error(`tools/sonidos-catalogo.ts: «${s.id}» (lote ${s.lote}) no tiene prioridad ni cooldown en MEZCLA`);
    const variantes: Variante[] = [];
    for (const v of s.variantes) {
      const nombre = v.fichero.split("/").pop()!, respaldo = v.respaldo_m4a.split("/").pop()!;
      const deOpus = join(biblioteca, v.fichero), deM4a = join(biblioteca, v.respaldo_m4a);
      const opus = readFileSync(deOpus), m4a = readFileSync(deM4a);
      if (sha256(opus) !== v.sha256) throw new Error(`${v.fichero}: el sha256 de la biblioteca no es el del fichero`);
      const aOpus = `activos/sonidos/${s.id}/${nombre}`, aM4a = `activos/sonidos/${s.id}/${respaldo}`;
      copias.push({ de: deOpus, a: aOpus }, { de: deM4a, a: aM4a });
      variantes.push({
        fichero: aOpus, sha256: v.sha256, bytes: opus.length, peso: v.peso,
        respaldo: aM4a, respaldo_sha256: sha256(m4a), respaldo_bytes: m4a.length,
      });
    }
    sonidos.push({
      id: s.id, uso: s.uso, bus: s.bus, lote: s.lote, prioridad: m.prioridad, cooldown_ms: m.cooldown_ms,
      texto: s.accesible_texto, duracion_s: s.duracion_s, bucle: s.bucle,
      licencia: unicos(s.licencia.map(spdx)).join(", "), autor: unicos(s.autor), fuente: unicos(s.url_origen),
      variantes,
    });
  }
  sonidos.push(COLCHON, ...RECETAS_CATALOGO);
  sonidos.sort((a, b) => a.id.localeCompare(b.id));
  return { sonidos, copias };
}

const DESCRIBE = "S6 · los sonidos de la casa: cada id con sus variantes (y su peso: a más peso, más veces sale), su bus de los ocho del núcleo, su prioridad (0-100) y su cooldown en ms, el texto que lee quien no oye (XAUR), y la procedencia de cada fichero (licencia, autor, fuente, sha256). Los ficheros viven en activos/sonidos/ y el servidor los sirve en /a/<sha256>.opus (con un .m4a de respaldo para Safari): nunca entran en el paquete de arranque. Un id que falta o un sha256 que no cuadra se queda fuera con un aviso en el registro, y el mundo sigue sonando con los demás. Solo CC0 (docs/SABER.md §3.3). Las camas y capas de zona (bed-*, capa-*) NO están aquí: son de mundo y van en numinia-assets.";

export const catalogoJson = (sonidos: (Sonido | SonidoReceta)[]): string =>
  JSON.stringify({ schema: "numinia-engine/sonidos@1", describe: DESCRIBE, casa: CASA, sonidos }, null, 2) + "\n";

/** Solo las filas con fichero: las de receta no tienen nada que licenciar (son código del motor). */
const conFichero = (sonidos: (Sonido | SonidoReceta)[]): Sonido[] => sonidos.filter((s): s is Sonido => Array.isArray(s.fuente));

export function licenciasMd(todos: (Sonido | SonidoReceta)[]): string {
  const sonidos = conFichero(todos);
  const recetas = todos.filter((s) => !Array.isArray(s.fuente));
  const opus = sonidos.reduce((a, s) => a + s.variantes.reduce((b, v) => b + v.bytes, 0), 0);
  const m4a = sonidos.reduce((a, s) => a + s.variantes.reduce((b, v) => b + v.respaldo_bytes, 0), 0);
  const nVar = sonidos.reduce((a, s) => a + s.variantes.length, 0);
  const autores = unicos(sonidos.flatMap((s) => s.autor)).sort();
  const filas = sonidos.map((s) => `| \`sonidos/${s.id}/\` | ${s.uso} | ${s.variantes.length} | ${s.lote} | ${s.bus} | CC0-1.0 | ${s.autor.join("; ")} | ${s.fuente.map((u) => `<${u}>`).join(" ")} |`);
  return `# Licencias de los sonidos de la casa (S6)

Todo lo de \`activos/sonidos/\` es **CC0 1.0 Universal** (dominio público), de **Kenney.nl** y de
**OpenGameArt filtrando por CC0**, verificado fuente a fuente al construir la biblioteca
(\`work/motor-ar/sonido/biblioteca/THIRD_PARTY_AUDIO.md\` tiene la tabla completa, fichero a fichero, con el
sha256 del original descargado; aquí van solo las filas de lo que entra al repo), **más el colchón de ambiente
\`ambiente-numinia\`**, que no sale de esa biblioteca: lo hizo un amigo de Numinia a propósito para Numinia y lo
cedió en CC0 (dicho por Pablo el 2026-10-19). **TODO: falta el nombre de su autor**, pendiente de que Pablo lo
diga; en cuanto esté se pone en \`COLCHON.autor\` (\`tools/sonidos-catalogo.ts\`) y vuelve a salir aquí. CC0 no
obliga a citar; lo citamos igual.

**${recetas.length} ids del catálogo no tienen fichero** (\`${recetas.map((s) => s.id).join("`, `")}\`): los hace el
motor con una receta de \`packages/render/src/audio/sintesis.ts\`, que es código nuestro bajo la licencia del
repo. No hay nada de nadie que licenciar en ellos, así que no tienen fila en esta tabla. Cuando uno de esos ids
consiga un fichero CC0, entra por la biblioteca y **el fichero gana**: la receta se queda de respaldo.

**${sonidos.length} ids · ${nVar} variantes · ${nVar * 2} ficheros** (${nVar} \`.opus\` = ${opus.toLocaleString("es-ES")} B y
${nVar} \`.m4a\` de respaldo para Safari = ${m4a.toLocaleString("es-ES")} B; **${(opus + m4a).toLocaleString("es-ES")} B** en total).
Los sirve \`GET /a/<sha256>.opus\` (\`packages/server/src/activos.ts\`); la lista con el sha256 de cada fichero
está en \`features/sonido/catalogo.json\` y \`test/sonidos.test.ts\` comprueba que cada sha256 es el de su fichero
y que ninguna licencia deja de ser CC0.

**Cambio nuestro**: los ficheros son derivados (recorte del silencio de cabeza y cola, ganancia a RMS −18 dBFS
con techo de pico en −2 dBFS, recodificación a Opus 40 kbps VBR mono 48 kHz y a AAC 48 kbps), lo que CC0
permite sin condiciones. Se rehacen con \`python3 construir.py\` dentro de la biblioteca y se traen aquí con
\`node tools/sonidos-catalogo.ts\`.

Autores: ${autores.join(", ")}.

| Carpeta | Para qué | Variantes | Lote | Bus | Licencia | Autor | Fuente |
|---|---|---|---|---|---|---|---|
${filas.join("\n")}

Descartado a propósito por licencia, no por calidad: Sonniss #GameAudioGDC (su EULA prohíbe redistribuir los
sonidos dentro de un «asset pack» o un «software development kit», que es exactamente esto), BBC
RemArc (no comercial), Pixabay (licencia revocable, prohíbe distribuir el contenido «standalone»), Zapsplat,
Boom, Artlist, Epidemic, Mixkit, Soundsnap y Soundly (EULA de pago o no transferible). Fuera también CC BY,
CC BY-SA, CC BY-NC y OGA-BY, por preferencia absoluta por CC0.
`;
}

// ---- la mano: copiar y escribir ----

function escribirSi(ruta: string, texto: string, comprobar: boolean, cambios: string[]): void {
  const antes = existsSync(ruta) ? readFileSync(ruta, "utf8") : null;
  if (antes === texto) return;
  cambios.push(relative(ROOT, ruta));
  if (!comprobar) { mkdirSync(join(ruta, ".."), { recursive: true }); writeFileSync(ruta, texto); }
}

function main(): void {
  const args = process.argv.slice(2);
  const comprobar = args.includes("--comprobar");
  const i = args.indexOf("--biblioteca");
  const biblioteca = i >= 0 ? args[i + 1] : BIBLIOTECA_DEF;
  if (!existsSync(join(biblioteca, "catalogo.json"))) {
    console.error(`no encuentro la biblioteca de sonido en ${biblioteca} (pásala con --biblioteca <dir>).`);
    console.error("No es parte del repo: es el trabajo de la historia S2 (work/motor-ar/sonido/biblioteca).");
    process.exit(2);
  }
  const { sonidos, copias } = construir(biblioteca);
  const destino = join(ROOT, "activos/sonidos");
  const cambios: string[] = [];
  // lo que haya de más en activos/sonidos/ y no esté en el catálogo, fuera (un id que se quita no deja basura).
  // El colchón de ambiente no sale de la biblioteca, así que va en CONSERVAR: no se toca.
  const queremos = new Set([...copias.map((c) => c.a), ...CONSERVAR]);
  if (existsSync(destino)) {
    for (const d of readdirSync(destino, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      for (const f of readdirSync(join(destino, d.name))) {
        const rel = `activos/sonidos/${d.name}/${f}`;
        if (!queremos.has(rel)) { cambios.push(`− ${rel}`); if (!comprobar) rmSync(join(ROOT, rel)); }
      }
    }
  }
  for (const c of copias) {
    const a = join(ROOT, c.a);
    const igual = existsSync(a) && statSync(a).size === statSync(c.de).size && sha256(readFileSync(a)) === sha256(readFileSync(c.de));
    if (igual) continue;
    cambios.push(c.a);
    if (!comprobar) { mkdirSync(join(a, ".."), { recursive: true }); copyFileSync(c.de, a); }
  }
  escribirSi(join(ROOT, "features/sonido/catalogo.json"), catalogoJson(sonidos), comprobar, cambios);
  escribirSi(join(destino, "LICENCIAS.md"), licenciasMd(sonidos), comprobar, cambios);
  const conF = conFichero(sonidos);
  const nVar = conF.reduce((a, s) => a + s.variantes.length, 0);
  const bytes = conF.reduce((a, s) => a + s.variantes.reduce((b, v) => b + v.bytes + v.respaldo_bytes, 0), 0);
  console.log(`[sonidos] ${sonidos.length} ids (${sonidos.length - conF.length} de receta, sin fichero) · ${nVar} variantes · ${nVar * 2} ficheros · ${bytes.toLocaleString("es-ES")} B`);
  if (!cambios.length) { console.log("[sonidos] el repo ya está al día"); return; }
  console.log(`[sonidos] ${comprobar ? "haría" : "hice"} ${cambios.length} cambio(s):`);
  for (const c of cambios.slice(0, 12)) console.log(`  ${c}`);
  if (cambios.length > 12) console.log(`  … y ${cambios.length - 12} más`);
  if (comprobar) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
