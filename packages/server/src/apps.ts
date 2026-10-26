// apps (M19, slice 1): the app format — one plain folder per app that the engine READS, VALIDATES and LISTS; nothing in it runs.
//   <mundo>/apps/<id>/
//     app.json        numinia-engine/app@1: who/what/licence, the model, the files by hash, the properties and events with
//                     their schema, the accessible card; for an app imported from a .hyp, what is still to be ported (H11)
//     main.ts         the app's script. This file only STORES, hashes and lists it; apps-ejecutar.ts runs it in the SES sandbox (M20)
//     assets/<sha256>.<ext>   the app's files, named by the SHA-256 of their bytes (the same names as datos/activos/ and /a/)
//     README.md, IMPORTADO.md  for people (optional)
//     por-portar/     a script written for another engine (Hyperfy), kept apart and marked «por portar»; never run
// Why a folder (principles in AGENTS.md): AI-native — an agent reads and writes it with no tool but a file editor; the schema
// is the one a builder's inspector (M22) paints its fields from, and the card is what a screen reader and an agent read
// (the same rule as every feature: a spoken name, an announcement or "silent", a card). The ids are camelCase like every
// engine verb and event. A world's apps/ is another part of the world folder (see docs/EXTENDER.md «Apps»).
// Rules that make a bad app fail loud and early (each problem says the file and the JSON path):
//   - a key the format does not know is an error (a typo must not pass for a setting);
//   - every file is named by its hash and the hash is checked: a file whose bytes are not its name is refused;
//   - every file is checked as the engine checks an upload (comprobarFichero: kind, size, real structure);
//   - licences (docs/SABER.md §3.3): an app that INCLUDES files or a script needs an admitted licence for each; a file whose
//     licence is unknown or not admitted is never included — it is listed as «omitido» with the reason, so the importer
//     marks it and a person decides.
// Pure and offline: reads a folder, never writes it; the server wires it (server.ts) and tools/apps.ts runs it by hand.
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Issue } from "../../core/src/index.ts";
import { SOUNDS } from "../../feature/src/index.ts";
import { comprobarFichero, TIPOS, topeBytes } from "../../net/src/ficheros.ts";

export const APP_ESQUEMA = "numinia-engine/app@1";
export const APP_FICHERO = "app.json";
export const APP_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** Properties and event fields are read by scripts as plain names (props.color): camelCase, letters and digits. */
export const APP_CLAVE = /^[a-z][a-zA-Z0-9]{0,31}$/;
/** An app's file: «<sha256>.<ext>», the same name the world's datos/activos/ and /a/ use. */
export const APP_ARCHIVO = /^([0-9a-f]{64})\.([a-z0-9]{1,8})$/;
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const LICENCIA = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,39}$/;
export const LICENCIA_DESCONOCIDA = "desconocida";

// published limits (limits.json «app_*»)
export const APP_JSON_MAX = 64 * 1024;          // bytes of app.json
export const APP_MAIN_MAX = 256 * 1024;         // bytes of main.ts (a script, not a bundle)
export const APP_ACTIVOS_MAX = 32;              // files per app
export const APP_ACTIVOS_MB = 64;               // MB of files per app, together
export const APP_PROPIEDADES_MAX = 32;
export const APP_EVENTOS_MAX = 16;
export const APPS_MAX = 200;                    // apps per world

/** What an app (or one of its files) may carry. CC0 and CC BY for art, the permissive code licences the engine's own
 * dependencies use, and AGPL-3.0-only for work that is Numinia's own. Never GPL, BUSL, «all rights reserved»: docs/SABER.md §3.3. */
export const LICENCIAS_ADMITIDAS: readonly string[] = ["CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "AGPL-3.0-only"];
/** CC BY asks for credit: the app must say who made it (`autor`). */
const EXIGE_CREDITO = new Set(["CC-BY-4.0", "CC-BY-3.0"]);
export const licenciaAdmitida = (l: string): boolean => LICENCIAS_ADMITIDAS.includes(l);
/** Why a licence is not taken, in one line (for the lists and the importer's report). */
export function motivoLicencia(l: string): string {
  if (l === LICENCIA_DESCONOCIDA) return "su licencia es desconocida: sin licencia no se trae (pide al autor una CC0, CC BY o MIT, o rehazlo)";
  return `la licencia «${l}» no está entre las admitidas (${LICENCIAS_ADMITIDAS.join(", ")}): docs/SABER.md §3.3`;
}

export const TIPOS_PROPIEDAD = ["texto", "numero", "rango", "interruptor", "lista", "color", "fichero"] as const;
export type TipoPropiedad = (typeof TIPOS_PROPIEDAD)[number];
export const TIPOS_CAMPO = ["texto", "numero", "interruptor"] as const;
export type Propiedad = {
  id: string; tipo: TipoPropiedad; etiqueta: string; hablado?: string; ayuda?: string;
  porDefecto?: string | number | boolean; min?: number; max?: number; paso?: number; opciones?: string[];
};
export type Anuncio = { texto: string; sonido: (typeof SOUNDS)[number] };
export type EventoApp = { id: string; describe: string; campos: Record<string, (typeof TIPOS_CAMPO)[number]>; anuncio: Anuncio | "silent" };
export type ActivoApp = { archivo: string; licencia: string; autor?: string; fuente?: string; estado: "incluido" | "omitido"; motivo?: string };
/** H11: a script written for another engine, kept apart. `por-portar` = its file is in por-portar/; `omitido` = not copied (its licence). */
export type Portar = { estado: "por-portar" | "omitido"; origen: string; fichero?: string; sha256?: string; bytes?: number; motivo: string };
export type OrigenApp = { formato: string; archivo: string; sha256: string; id?: string };
export type App = {
  schema: typeof APP_ESQUEMA; id: string; nombre: string; version: string; descripcion?: string; autor?: string; fuente?: string; notas?: string;
  licencia: string; modelo?: string; main?: string; activos: ActivoApp[]; propiedades: Propiedad[]; eventos: EventoApp[];
  ficha: { hablado: string; describe: string }; portar?: Portar; origen?: OrigenApp;
};

const CLAVES_APP = new Set(["schema", "id", "nombre", "version", "descripcion", "autor", "fuente", "notas", "licencia", "modelo", "main", "activos", "propiedades", "eventos", "ficha", "portar", "origen"]);
const CLAVES_PROPIEDAD = new Set(["id", "tipo", "etiqueta", "hablado", "ayuda", "porDefecto", "min", "max", "paso", "opciones"]);

const esObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown, max: number): v is string => typeof v === "string" && v.trim().length > 0 && v.length <= max;
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** app.json → an App, or every problem with where it is (JSON path) and how to fix it. Pure: looks at no file. */
export function validarApp(raw: unknown, idCarpeta?: string): { ok: true; app: App } | { ok: false; issues: Issue[] } {
  const is: Issue[] = [];
  const mal = (path: string, message: string) => { is.push({ path, message }); };
  if (!esObj(raw)) return { ok: false, issues: [{ path: "app.json", message: "tiene que ser un objeto JSON: { \"schema\": \"numinia-engine/app@1\", \"id\": …, … } (mira apps/ejemplo en plantillas/ o docs/EXTENDER.md «Apps»)" }] };
  const a = raw;
  for (const k of Object.keys(a)) if (!CLAVES_APP.has(k)) mal(k, `«${k}» no es un campo de app@1 (los hay: ${[...CLAVES_APP].join(", ")}); si es una nota para personas, va en «notas»`);
  if (a.schema !== APP_ESQUEMA) mal("schema", `tiene que ser exactamente "${APP_ESQUEMA}" (es ${JSON.stringify(a.schema)})`);
  if (typeof a.id !== "string" || !APP_ID.test(a.id)) mal("id", "minúsculas, cifras y guiones, 1–32 caracteres, empieza por letra o cifra («silla-giratoria»); es el nombre de la carpeta");
  else if (idCarpeta !== undefined && a.id !== idCarpeta) mal("id", `dice «${a.id}» pero la carpeta se llama «${idCarpeta}»: que sean iguales`);
  if (!texto(a.nombre, 60)) mal("nombre", "el nombre que ve la gente, 1–60 caracteres");
  if (typeof a.version !== "string" || !SEMVER.test(a.version)) mal("version", "tres números con puntos, «1.0.0» (la versión de ESTA app, no la del motor)");
  for (const [k, max] of [["descripcion", 500], ["autor", 120], ["fuente", 300], ["notas", 1000]] as const) if (a[k] !== undefined && !texto(a[k], max)) mal(k, `texto de 1–${max} caracteres, o quita el campo`);
  if (typeof a.fuente === "string" && !/^https?:\/\/\S+$/.test(a.fuente)) mal("fuente", "una dirección https://… de donde viene (o quita el campo)");
  if (typeof a.licencia !== "string" || !(a.licencia === LICENCIA_DESCONOCIDA || LICENCIA.test(a.licencia))) mal("licencia", `la licencia de la app como id SPDX («CC0-1.0», «AGPL-3.0-only»…) o «${LICENCIA_DESCONOCIDA}» si no se sabe; admitidas: ${LICENCIAS_ADMITIDAS.join(", ")}`);
  const licencia = typeof a.licencia === "string" ? a.licencia : LICENCIA_DESCONOCIDA;

  // the files
  const activos: ActivoApp[] = [];
  if (!Array.isArray(a.activos)) mal("activos", "una lista (puede ir vacía): [{ \"archivo\": \"<sha256>.glb\", \"licencia\": \"CC0-1.0\" }, …]");
  else {
    if (a.activos.length > APP_ACTIVOS_MAX) mal("activos", `${a.activos.length} ficheros: el tope es ${APP_ACTIVOS_MAX} por app (limits.json app_files_max)`);
    const vistos = new Set<string>();
    a.activos.slice(0, APP_ACTIVOS_MAX).forEach((x, i) => {
      const p = `activos[${i}]`;
      if (!esObj(x)) return mal(p, "tiene que ser { archivo, licencia, estado? }");
      for (const k of Object.keys(x)) if (!["archivo", "licencia", "autor", "fuente", "estado", "motivo"].includes(k)) mal(`${p}.${k}`, `«${k}» no es un campo de un activo (archivo, licencia, autor, fuente, estado, motivo)`);
      const m = typeof x.archivo === "string" ? APP_ARCHIVO.exec(x.archivo) : null;
      if (!m) return mal(`${p}.archivo`, "el nombre es el SHA-256 de sus bytes y la extensión: «<64 hex>.glb» (se calcula con sha256sum)");
      if (vistos.has(x.archivo as string)) mal(`${p}.archivo`, "este fichero ya está en la lista");
      vistos.add(x.archivo as string);
      const lic = x.licencia;
      if (typeof lic !== "string" || !(lic === LICENCIA_DESCONOCIDA || LICENCIA.test(lic))) mal(`${p}.licencia`, `la licencia de este fichero (id SPDX) o «${LICENCIA_DESCONOCIDA}»`);
      const estado = x.estado === undefined ? "incluido" : x.estado;
      if (estado === "incluido" && !TIPOS[m[2]]) mal(`${p}.archivo`, `.${m[2]} no es un tipo que el motor admita (${Object.keys(TIPOS).join(", ")})`);
      if (estado !== "incluido" && estado !== "omitido") mal(`${p}.estado`, "«incluido» (el fichero está en assets/) u «omitido» (no se trajo; di por qué en «motivo»)");
      if (estado === "omitido" && !texto(x.motivo, 300)) mal(`${p}.motivo`, "un fichero omitido dice por qué (licencia, falta, no vale), 1–300 caracteres");
      if (x.autor !== undefined && !texto(x.autor, 120)) mal(`${p}.autor`, "texto de 1–120 caracteres, o quita el campo");
      if (x.fuente !== undefined && !texto(x.fuente, 300)) mal(`${p}.fuente`, "texto de 1–300 caracteres, o quita el campo");
      if (typeof lic === "string" && estado === "incluido") {
        if (!licenciaAdmitida(lic)) mal(`${p}.licencia`, `no se incluye: ${motivoLicencia(lic)}; márcalo con "estado": "omitido" y quita el fichero de assets/`);
        else if (EXIGE_CREDITO.has(lic) && !texto(x.autor, 120)) mal(`${p}.autor`, `${lic} exige el crédito: pon quién es el autor`);
      }
      if (typeof x.archivo === "string" && (estado === "incluido" || estado === "omitido") && typeof lic === "string") {
        activos.push({ archivo: x.archivo, licencia: lic, ...(typeof x.autor === "string" ? { autor: x.autor } : {}), ...(typeof x.fuente === "string" ? { fuente: x.fuente } : {}), estado, ...(typeof x.motivo === "string" ? { motivo: x.motivo } : {}) });
      }
    });
  }
  const incluidos = new Set(activos.filter((x) => x.estado === "incluido").map((x) => x.archivo));
  const enLista = new Set(activos.map((x) => x.archivo));

  if (a.modelo !== undefined) {
    if (typeof a.modelo !== "string" || !APP_ARCHIVO.test(a.modelo)) mal("modelo", "el fichero del modelo, «<sha256>.glb», uno de los de «activos»");
    else if (!/\.(glb|vrm)$/.test(a.modelo)) mal("modelo", "el modelo es un .glb o un .vrm");
    else if (!enLista.has(a.modelo)) mal("modelo", `«${a.modelo}» no está en «activos»: añádelo allí con su licencia`);
    else if (!incluidos.has(a.modelo)) mal("modelo", `«${a.modelo}» está omitido: sin su fichero la app no tiene modelo; quita «modelo» o trae el fichero con licencia`);
  }
  if (a.main !== undefined && a.main !== "main.ts") mal("main", "solo «main.ts» (el script va en un fichero con ese nombre, junto a app.json)");

  // properties: the schema a builder's inspector paints its fields from
  const propiedades: Propiedad[] = [];
  if (a.propiedades !== undefined && !Array.isArray(a.propiedades)) mal("propiedades", "una lista de { id, tipo, etiqueta, … } (o quita el campo)");
  else {
    const lista = (a.propiedades ?? []) as unknown[];
    if (lista.length > APP_PROPIEDADES_MAX) mal("propiedades", `${lista.length} propiedades: el tope es ${APP_PROPIEDADES_MAX} (limits.json app_properties_max)`);
    const ids = new Set<string>();
    lista.slice(0, APP_PROPIEDADES_MAX).forEach((x, i) => {
      const p = `propiedades[${i}]`;
      if (!esObj(x)) return mal(p, "tiene que ser { id, tipo, etiqueta, … }");
      for (const k of Object.keys(x)) if (!CLAVES_PROPIEDAD.has(k)) mal(`${p}.${k}`, `«${k}» no es un campo de propiedad (${[...CLAVES_PROPIEDAD].join(", ")})`);
      if (typeof x.id !== "string" || !APP_CLAVE.test(x.id)) mal(`${p}.id`, "camelCase, letras y cifras, empieza por minúscula (el script la lee como props.<id>): «colorSilla»");
      else if (ids.has(x.id)) mal(`${p}.id`, `«${x.id}» ya está en la lista`);
      else ids.add(x.id);
      const tipo = x.tipo as TipoPropiedad;
      if (!TIPOS_PROPIEDAD.includes(tipo)) return mal(`${p}.tipo`, `«${String(x.tipo)}» no es un tipo de propiedad; uno de: ${TIPOS_PROPIEDAD.join(", ")}`);
      if (!texto(x.etiqueta, 60)) mal(`${p}.etiqueta`, "el nombre que ve quien construye en el inspector, 1–60 caracteres");
      if (x.hablado !== undefined && !texto(x.hablado, 80)) mal(`${p}.hablado`, "cómo se dice en voz alta, 1–80 caracteres");
      if (x.ayuda !== undefined && !texto(x.ayuda, 200)) mal(`${p}.ayuda`, "una frase de ayuda, 1–200 caracteres");
      const d = x.porDefecto;
      if (tipo === "texto" && d !== undefined && !(typeof d === "string" && d.length <= 200)) mal(`${p}.porDefecto`, "un texto de hasta 200 caracteres");
      if (tipo === "interruptor" && d !== undefined && typeof d !== "boolean") mal(`${p}.porDefecto`, "true o false");
      if (tipo === "color" && d !== undefined && !(typeof d === "string" && /^#[0-9a-fA-F]{6}$/.test(d))) mal(`${p}.porDefecto`, "un color «#rrggbb»");
      if (tipo === "numero" || tipo === "rango") {
        for (const k of ["min", "max", "paso"] as const) if (x[k] !== undefined && !num(x[k])) mal(`${p}.${k}`, "un número");
        if (tipo === "rango" && !(num(x.min) && num(x.max) && x.min < x.max)) mal(`${p}`, "un rango lleva min y max, con min menor que max");
        if (num(x.min) && num(x.max) && x.min >= x.max && tipo === "numero") mal(`${p}.max`, "max tiene que ser mayor que min");
        if (x.paso !== undefined && !(num(x.paso) && x.paso > 0)) mal(`${p}.paso`, "el paso es un número mayor que 0");
        if (d !== undefined) {
          if (!num(d)) mal(`${p}.porDefecto`, "un número");
          else if ((num(x.min) && d < x.min) || (num(x.max) && d > x.max)) mal(`${p}.porDefecto`, `${d} queda fuera de ${x.min ?? "−∞"}…${x.max ?? "∞"}`);
        }
      } else for (const k of ["min", "max", "paso"] as const) if (x[k] !== undefined) mal(`${p}.${k}`, `un «${tipo}» no lleva ${k} (solo «numero» y «rango»)`);
      if (tipo === "lista") {
        if (!Array.isArray(x.opciones) || x.opciones.length < 1 || x.opciones.length > 32 || !x.opciones.every((o) => texto(o, 60)) || new Set(x.opciones).size !== x.opciones.length) mal(`${p}.opciones`, "una lista de 1–32 textos distintos, de hasta 60 caracteres");
        else if (d !== undefined && !x.opciones.includes(d)) mal(`${p}.porDefecto`, `«${String(d)}» no es una de las opciones (${x.opciones.join(", ")})`);
        else if (d !== undefined && typeof d !== "string") mal(`${p}.porDefecto`, "una de las opciones");
      } else if (x.opciones !== undefined) mal(`${p}.opciones`, `un «${tipo}» no lleva opciones (solo «lista»)`);
      if (tipo === "fichero" && d !== undefined) {
        if (typeof d !== "string" || !APP_ARCHIVO.test(d)) mal(`${p}.porDefecto`, "el fichero por defecto, «<sha256>.<ext>», uno de los de «activos»");
        else if (!incluidos.has(d)) mal(`${p}.porDefecto`, `«${d}» no es un fichero incluido de «activos»`);
      }
      if (typeof x.id === "string" && x.etiqueta && TIPOS_PROPIEDAD.includes(tipo)) propiedades.push(x as unknown as Propiedad);
    });
  }

  // events: the same accessible rule as every feature (an announcement, or silent)
  const eventos: EventoApp[] = [];
  if (a.eventos !== undefined && !Array.isArray(a.eventos)) mal("eventos", "una lista de { id, describe, campos, anuncio } (o quita el campo)");
  else {
    const lista = (a.eventos ?? []) as unknown[];
    if (lista.length > APP_EVENTOS_MAX) mal("eventos", `${lista.length} eventos: el tope es ${APP_EVENTOS_MAX} (limits.json app_events_max)`);
    const ids = new Set<string>();
    lista.slice(0, APP_EVENTOS_MAX).forEach((x, i) => {
      const p = `eventos[${i}]`;
      if (!esObj(x)) return mal(p, "tiene que ser { id, describe, campos, anuncio }");
      for (const k of Object.keys(x)) if (!["id", "describe", "campos", "anuncio"].includes(k)) mal(`${p}.${k}`, `«${k}» no es un campo de evento (id, describe, campos, anuncio)`);
      if (typeof x.id !== "string" || !APP_CLAVE.test(x.id)) mal(`${p}.id`, "camelCase, letras y cifras («alPulsar»; con guion o snake_case el motor no lo entrega)");
      else if (ids.has(x.id)) mal(`${p}.id`, `«${x.id}» ya está en la lista`);
      else ids.add(x.id);
      if (!texto(x.describe, 200)) mal(`${p}.describe`, "qué pasa, en una frase de hasta 200 caracteres");
      const campos: EventoApp["campos"] = {};
      if (x.campos !== undefined) {
        if (!esObj(x.campos)) mal(`${p}.campos`, "un objeto { nombre: \"texto\"|\"numero\"|\"interruptor\" }");
        else for (const [k, t] of Object.entries(x.campos)) {
          if (!APP_CLAVE.test(k)) mal(`${p}.campos.${k}`, "camelCase, letras y cifras");
          else if (!(TIPOS_CAMPO as readonly unknown[]).includes(t)) mal(`${p}.campos.${k}`, `«${String(t)}» no es un tipo de campo; uno de: ${TIPOS_CAMPO.join(", ")}`);
          else campos[k] = t as (typeof TIPOS_CAMPO)[number];
        }
      }
      const an = x.anuncio;
      if (an === undefined) mal(`${p}.anuncio`, "di qué oye y lee una persona: { \"texto\": \"Alguien pulsa la silla\", \"sonido\": \"suave\" }, o \"silent\" si no se puede ver ni oír (todo evento lo declara, como en las funciones)");
      else if (an !== "silent") {
        if (!esObj(an) || !texto(an.texto, 120)) mal(`${p}.anuncio.texto`, "el texto que dice un lector de pantalla, 1–120 caracteres (puede llevar {campo})");
        else for (const m of an.texto.matchAll(/\{(\w+)\}/g)) if (!(m[1] in campos)) mal(`${p}.anuncio.texto`, `«{${m[1]}}» no es un campo de este evento (campos: ${Object.keys(campos).join(", ") || "ninguno"})`);
        if (esObj(an) && !(SOUNDS as readonly unknown[]).includes(an.sonido)) mal(`${p}.anuncio.sonido`, `uno de los sonidos del motor: ${SOUNDS.join(", ")} (ningún aviso sin sonido)`);
      }
      if (typeof x.id === "string" && texto(x.describe, 200) && an !== undefined) eventos.push({ id: x.id, describe: x.describe, campos, anuncio: an as EventoApp["anuncio"] });
    });
  }

  // the accessible card
  let ficha: App["ficha"] = { hablado: "", describe: "" };
  if (!esObj(a.ficha)) mal("ficha", "la ficha accesible, { \"hablado\": \"una silla que gira\", \"describe\": \"…\" }: lo que lee un lector de pantalla y una IA");
  else {
    for (const k of Object.keys(a.ficha)) if (k !== "hablado" && k !== "describe") mal(`ficha.${k}`, `«${k}» no es un campo de la ficha (hablado, describe)`);
    if (!texto(a.ficha.hablado, 80)) mal("ficha.hablado", "cómo se nombra en voz alta, 1–80 caracteres");
    if (!texto(a.ficha.describe, 300)) mal("ficha.describe", "qué es y qué hace, 1–300 caracteres");
    ficha = { hablado: String(a.ficha.hablado ?? ""), describe: String(a.ficha.describe ?? "") };
  }

  // H11: what is left to port
  let portar: Portar | undefined;
  if (a.portar !== undefined) {
    const x = a.portar;
    if (!esObj(x)) mal("portar", "{ estado, origen, fichero?, sha256?, bytes?, motivo }");
    else {
      for (const k of Object.keys(x)) if (!["estado", "origen", "fichero", "sha256", "bytes", "motivo"].includes(k)) mal(`portar.${k}`, `«${k}» no es un campo de portar`);
      if (x.estado !== "por-portar" && x.estado !== "omitido") mal("portar.estado", "«por-portar» (el script está en por-portar/) u «omitido» (no se copió)");
      if (!texto(x.origen, 40)) mal("portar.origen", "de qué motor viene el script («hyperfy»)");
      if (!texto(x.motivo, 400)) mal("portar.motivo", "por qué hay que portarlo o por qué no se copió, 1–400 caracteres");
      if (x.estado === "por-portar" && x.fichero !== "por-portar/script.js") mal("portar.fichero", "un script por portar está en «por-portar/script.js»");
      if (x.estado === "omitido" && x.fichero !== undefined) mal("portar.fichero", "un script omitido no tiene fichero");
      if (x.sha256 !== undefined && !(typeof x.sha256 === "string" && /^[0-9a-f]{64}$/.test(x.sha256))) mal("portar.sha256", "64 cifras hexadecimales");
      if (x.bytes !== undefined && !(Number.isInteger(x.bytes) && (x.bytes as number) >= 0)) mal("portar.bytes", "un entero");
      if (x.estado === "por-portar" || x.estado === "omitido") portar = x as unknown as Portar;
    }
  }
  let origen: OrigenApp | undefined;
  if (a.origen !== undefined) {
    const x = a.origen;
    if (!esObj(x) || !texto(x.formato, 20) || !texto(x.archivo, 200) || !(typeof x.sha256 === "string" && /^[0-9a-f]{64}$/.test(x.sha256))) mal("origen", "{ formato: \"hyp\", archivo: \"nombre.hyp\", sha256: \"<64 hex del fichero de origen>\" }");
    else origen = x as unknown as OrigenApp;
  }

  // an app that carries anything needs its own admitted licence
  const traeAlgo = incluidos.size > 0 || a.main !== undefined || portar?.estado === "por-portar";
  if (traeAlgo && typeof a.licencia === "string" && !licenciaAdmitida(a.licencia)) mal("licencia", `la app trae ${a.main !== undefined ? "un script" : "ficheros"} y ${motivoLicencia(a.licencia)}`);
  if (traeAlgo && EXIGE_CREDITO.has(licencia) && !texto(a.autor, 120)) mal("autor", `${licencia} exige el crédito: pon quién es el autor`);

  if (is.length) return { ok: false, issues: is };
  const app: App = {
    schema: APP_ESQUEMA, id: a.id as string, nombre: a.nombre as string, version: a.version as string,
    ...(a.descripcion !== undefined ? { descripcion: a.descripcion as string } : {}), ...(a.autor !== undefined ? { autor: a.autor as string } : {}),
    ...(a.fuente !== undefined ? { fuente: a.fuente as string } : {}), ...(a.notas !== undefined ? { notas: a.notas as string } : {}),
    licencia, ...(a.modelo !== undefined ? { modelo: a.modelo as string } : {}), ...(a.main !== undefined ? { main: "main.ts" } : {}),
    activos, propiedades, eventos, ficha, ...(portar ? { portar } : {}), ...(origen ? { origen } : {}),
  };
  return { ok: true, app };
}

export type AppCargada = {
  app: App; carpeta: string;
  /** main.ts as stored: its hash and size. `ejecuta` is always false HERE (this reader runs nothing); apps-ejecutar.ts runs it and GET /apps says so. */
  main: { fichero: "main.ts"; sha256: string; bytes: number; ejecuta: false } | null;
  /** the files read, hash-checked and kind-checked (what the server may serve at /a/<sha256>.<ext>) */
  activos: { archivo: string; sha256: string; ext: string; bytes: number }[];
  avisos: string[];
};
export type LecturaApp = { ok: true; cargada: AppCargada } | { ok: false; id: string; issues: Issue[] };

/** Reads ONE app folder: app.json, main.ts, assets/, por-portar/. Never throws; never writes; never runs anything. */
export function leerApp(carpeta: string, id: string): LecturaApp {
  const base = `apps/${id}`;
  const falla = (issues: Issue[]): LecturaApp => ({ ok: false, id, issues: issues.map((i) => ({ path: i.path.startsWith("apps/") ? i.path : i.path === APP_FICHERO ? `${base}/${APP_FICHERO}` : `${base}/${APP_FICHERO}#${i.path}`, message: i.message })) });
  const raiz = (p: string, motivo: string): LecturaApp => ({ ok: false, id, issues: [{ path: `${base}/${p}`, message: motivo }] });
  let ficheros: string[];
  try { if (!lstatSync(carpeta).isDirectory()) return raiz("", "no es una carpeta"); ficheros = readdirSync(carpeta); } catch (e) { return raiz("", `no se puede leer: ${(e as Error).message}`); }
  const rutaJson = join(carpeta, APP_FICHERO);
  let st; try { st = lstatSync(rutaJson); } catch { return raiz(APP_FICHERO, `falta app.json: una app es una carpeta con app.json (schema "${APP_ESQUEMA}")`); }
  if (!st.isFile()) return raiz(APP_FICHERO, "app.json tiene que ser un fichero normal (no un enlace ni una carpeta)");
  if (st.size > APP_JSON_MAX) return raiz(APP_FICHERO, `pesa ${st.size} bytes: el tope es ${APP_JSON_MAX} (limits.json app_json_max_kb)`);
  let crudo: unknown;
  try { crudo = JSON.parse(readFileSync(rutaJson, "utf8")); } catch (e) { return raiz(APP_FICHERO, `no es JSON válido: ${(e as Error).message}`); }
  const v = validarApp(crudo, id);
  if (!v.ok) return falla(v.issues);
  const app = v.app, is: Issue[] = [], avisos: string[] = [];
  const mal = (path: string, message: string) => { is.push({ path: `${base}/${path}`, message }); };

  // main.ts: stored, hashed, read as text; not parsed, not run (apps-ejecutar.ts does that, M20)
  let main: AppCargada["main"] = null;
  const rutaMain = join(carpeta, "main.ts");
  if (app.main) {
    let sm; try { sm = lstatSync(rutaMain); } catch { sm = null; }
    if (!sm) mal("main.ts", "app.json dice «main»: «main.ts» y el fichero no está");
    else if (!sm.isFile()) mal("main.ts", "tiene que ser un fichero normal (no un enlace)");
    else if (sm.size > APP_MAIN_MAX) mal("main.ts", `pesa ${sm.size} bytes: el tope es ${APP_MAIN_MAX} (limits.json app_main_max_kb)`);
    else {
      const b = readFileSync(rutaMain);
      try { new TextDecoder("utf-8", { fatal: true }).decode(b); } catch { mal("main.ts", "no es texto UTF-8: un script es texto"); }
      main = { fichero: "main.ts", sha256: sha256(b), bytes: b.length, ejecuta: false };
    }
  } else if (ficheros.includes("main.ts")) avisos.push("hay un main.ts pero app.json no dice «main»: no se lista");

  // assets/: every included file is there, is what its name says and passes the engine's own upload check
  const dirAssets = join(carpeta, "assets");
  const activos: AppCargada["activos"] = [];
  let total = 0;
  for (const [i, x] of app.activos.entries()) {
    if (x.estado !== "incluido") continue;
    const m = APP_ARCHIVO.exec(x.archivo)!, ruta = join(dirAssets, x.archivo), p = `activos[${i}] ${x.archivo}`;
    let sa; try { sa = lstatSync(ruta); } catch { sa = null; }
    if (!sa) { mal(`assets/${x.archivo}`, `app.json lo lista (${p}) y no está en assets/: pon el fichero o márcalo "estado": "omitido"`); continue; }
    if (!sa.isFile()) { mal(`assets/${x.archivo}`, "tiene que ser un fichero normal (no un enlace)"); continue; }
    if (sa.size > topeBytes(m[2])) { mal(`assets/${x.archivo}`, `pesa ${sa.size} bytes: el tope de un .${m[2]} es ${topeBytes(m[2])} (limits.json upload_max_*_mb)`); continue; }
    total += sa.size;
    const b = readFileSync(ruta), real = sha256(b);
    if (real !== m[1]) { mal(`assets/${x.archivo}`, `sus bytes dan el SHA-256 ${real}: renómbralo así (y cambia el nombre en app.json) o trae el fichero que es`); continue; }
    const c = comprobarFichero(m[2], b);
    if (!c.ok) { mal(`assets/${x.archivo}`, c.issues.map((q) => `${q.path}: ${q.message}`).join("; ")); continue; }
    activos.push({ archivo: x.archivo, sha256: m[1], ext: m[2], bytes: b.length });
  }
  if (total > APP_ACTIVOS_MB * 1024 * 1024) mal("assets", `${(total / 1048576).toFixed(1)} MB de ficheros: el tope es ${APP_ACTIVOS_MB} MB por app (limits.json app_assets_max_mb)`);
  if (existsSync(dirAssets)) {
    const listados = new Set(app.activos.map((x) => x.archivo));
    for (const f of readdirSync(dirAssets)) if (!listados.has(f)) avisos.push(`assets/${f} no está en app.json: no se carga`);
  }
  for (const x of app.activos) if (x.estado === "omitido") avisos.push(`${x.archivo} omitido: ${x.motivo}`);

  // por-portar/script.js: only checked against its recorded hash
  if (app.portar?.estado === "por-portar") {
    const r = join(carpeta, "por-portar", "script.js");
    let sp; try { sp = lstatSync(r); } catch { sp = null; }
    if (!sp?.isFile()) mal("por-portar/script.js", "app.json dice que el script está por portar y el fichero no está");
    else if (app.portar.sha256 && sha256(readFileSync(r)) !== app.portar.sha256) mal("por-portar/script.js", "su SHA-256 no es el que app.json guardó al importar: alguien lo cambió; vuelve a importar o actualiza portar.sha256");
    avisos.push(`el script de ${app.portar.origen} está por portar a main.ts (${app.portar.motivo})`);
  } else if (app.portar) avisos.push(`el script de ${app.portar.origen} no se copió: ${app.portar.motivo}`);
  if (app.licencia === LICENCIA_DESCONOCIDA) avisos.push(motivoLicencia(app.licencia));
  if (is.length) return { ok: false, id, issues: is };
  return { ok: true, cargada: { app, carpeta, main, activos, avisos } };
}

export type LecturaApps = { apps: AppCargada[]; rechazadas: { id: string; issues: Issue[] }[] };

/** Reads every app folder in `dir` (null or missing = none). A bad app is rejected with where and why; the good ones load. */
export function leerApps(dir: string | null): LecturaApps {
  const out: LecturaApps = { apps: [], rechazadas: [] };
  if (!dir) return out;
  let nombres: string[];
  try { nombres = readdirSync(dir).filter((n) => !n.startsWith(".")).sort(); } catch { return out; }
  const vistas = new Set<string>();
  for (const n of nombres.slice(0, APPS_MAX)) {
    const carpeta = join(dir, n);
    let esCarpeta = false; try { esCarpeta = lstatSync(carpeta).isDirectory(); } catch { /* unreadable: skipped */ }
    if (!esCarpeta) continue;
    if (!APP_ID.test(n)) { out.rechazadas.push({ id: n, issues: [{ path: `apps/${n}`, message: "el nombre de la carpeta de una app: minúsculas, cifras y guiones, 1–32 caracteres" }] }); continue; }
    const r = leerApp(carpeta, n);
    if (r.ok) { if (!vistas.has(n)) out.apps.push(r.cargada); vistas.add(n); } else out.rechazadas.push({ id: r.id, issues: r.issues });
  }
  if (nombres.length > APPS_MAX) out.rechazadas.push({ id: "*", issues: [{ path: "apps", message: `hay ${nombres.length} carpetas: el tope es ${APPS_MAX} apps por mundo (limits.json apps_per_world_max); leo las ${APPS_MAX} primeras` }] });
  return out;
}

/** What the sandbox says about one script (apps-ejecutar.ts `estado`), copied here so this file stays free of the runner. */
export type EstadoGuionApp = { id: string; estado: string; version: number; sha256: string; bytes: number; cortes: { cpu: number; memoria: number; error: number }; informes: { cuando: string; motivo: string; detalle: string }[]; porQue?: string };
function scriptDe(main: NonNullable<AppCargada["main"]>, e: EstadoGuionApp | undefined) {
  if (!e) return { fichero: main.fichero, sha256: main.sha256, bytes: main.bytes, ejecuta: false };
  return {
    fichero: main.fichero, sha256: e.sha256 || main.sha256, bytes: e.bytes || main.bytes, ejecuta: e.estado !== "sin-sitio" && e.estado !== "cerrada",
    estado: e.estado, version: e.version, cortes: e.cortes, informes: e.informes, ...(e.porQue ? { porQue: e.porQue } : {}),
  };
}

/** The list GET /apps answers and `tools/apps.ts listar` prints: what an inspector and an agent need, no disk paths. */
export function listaDeApps(l: LecturaApps, guiones: EstadoGuionApp[] = []) {
  const g = new Map(guiones.map((e) => [e.id, e]));
  return {
    schema: "numinia-engine/apps@1",
    apps: l.apps.map(({ app, main, activos, avisos }) => ({
      id: app.id, nombre: app.nombre, version: app.version, licencia: app.licencia, ficha: app.ficha,
      ...(app.descripcion ? { descripcion: app.descripcion } : {}), ...(app.autor ? { autor: app.autor } : {}),
      modelo: app.modelo ?? null, propiedades: app.propiedades, eventos: app.eventos,
      script: main ? scriptDe(main, g.get(app.id)) : null,
      porPortar: app.portar ? { estado: app.portar.estado, origen: app.portar.origen, motivo: app.portar.motivo } : null,
      activos: activos.map((x) => ({ archivo: x.archivo, bytes: x.bytes, url: `/a/${x.archivo}` })),
      omitidos: app.activos.filter((x) => x.estado === "omitido").map((x) => ({ archivo: x.archivo, licencia: x.licencia, motivo: x.motivo })),
      avisos,
    })),
    rechazadas: l.rechazadas.map((r) => ({ id: r.id, problemas: r.issues.map((i) => `${i.path}: ${i.message}`) })),
  };
}

/** The same list as plain text for a person at a terminal. */
export function textoDeApps(l: LecturaApps): string {
  const o: string[] = [`${l.apps.length} app${l.apps.length === 1 ? "" : "s"} cargada${l.apps.length === 1 ? "" : "s"}${l.rechazadas.length ? `, ${l.rechazadas.length} rechazada${l.rechazadas.length === 1 ? "" : "s"}` : ""}`];
  for (const { app, main, activos, avisos } of l.apps) {
    o.push(`- ${app.id} · ${app.nombre} ${app.version} · ${app.licencia} · ${app.propiedades.length} propiedades, ${app.eventos.length} eventos, ${activos.length} ficheros${main ? `, main.ts (${main.bytes} B, no se ejecuta aquí: lo ejecuta el servidor en su caja)` : ""}${app.portar ? `, script ${app.portar.estado}` : ""}`);
    for (const a of avisos) o.push(`    aviso: ${a}`);
  }
  for (const r of l.rechazadas) for (const i of r.issues) o.push(`✗ ${i.path}: ${i.message}`);
  return o.join("\n") + "\n";
}
