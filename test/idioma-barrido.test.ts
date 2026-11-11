// i18n sweep: no player-visible Spanish-only literal in the page's code. A string that reads as Spanish must be written as
// tx("English", "Español") / T(en, es) / ligar(el, campo, en, es) (packages/client/src/idioma.ts), or carry `// i18n-ok: <why>` on its
// line (proper names, developer logs, internal ids, voice grammar), or live in a file that declares `// i18n-ok-file: <why>` in its
// first 6 lines. English is the source text; this test is what stops a new Spanish-only literal from coming back.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const ACENTOS = /[áéíóúñ¿¡ÁÉÍÓÚÑ]/;
const PALABRAS = /\b(el|la|los|las|tu|tus|con|para|del|que|más|aquí|abre|pulsa|haz|elige|cierra|nuevo|nueva|mensaje|jugador|mundo|no hay|sin|ya|esta|este|desde|cuando|hacia|ahora|nadie|todo|todos)\b/i;
/** Single words a Spanish-only button or title is made of (a lone «Cerrar» has no accent and no second word to give it away). */
const VOCABULARIO = /^\s*(Cerrar|Abrir|Guardar|Cancelar|Aceptar|Volver|Atrás|Siguiente|Anterior|Borrar|Quitar|Añadir|Elegir|Enviar|Gente|Bolsa|Misiones|Ajustes|Cámara|Menú|Mapa|Ficha|Construir|Mochila|Cargando|Sentarse|Levantarse|Hablar|Coger|Soltar|Ayuda|Avisos|Frases|Tú|Sí|Todo|Nada|Buscar|Listo|Hecho)\b[\s.:()\w]*$/;
const ENVOLTORIOS = new Set(["tx", "T", "ligar"]);

/** Replaces comments with spaces (same length) so positions survive; strings are kept. */
export function sinComentarios(src: string): string {
  let out = "", i = 0;
  while (i < src.length) {
    const c = src[i];
    if (src.startsWith("//", i)) { const j = src.indexOf("\n", i); const f = j < 0 ? src.length : j; out += " ".repeat(f - i); i = f; continue; }
    if (src.startsWith("/*", i)) { const j = src.indexOf("*/", i + 2); const f = j < 0 ? src.length : j + 2; out += src.slice(i, f).replace(/[^\n]/g, " "); i = f; continue; }
    if (c === "`") { // a template: its text is kept, each ${...} (nested strings and templates included) is blanked, so only the template's own words are judged
      let j = i + 1, t = "`";
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") { t += src.slice(j, j + 2); j += 2; continue; }
        if (src[j] === "$" && src[j + 1] === "{") {
          let d = 0, k = j + 1;
          for (; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) break; }
          t += "$" + "{}"; j = k + 1; continue;
        }
        t += src[j]; j++;
      }
      out += t + "`"; i = j + 1; continue;
    }
    if (c === "\"" || c === "'") {
      let j = i + 1; while (j < src.length && src[j] !== c) { if (src[j] === "\\") j++; j++; }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "/" && /[=(,:;!&|?{}\[]\s*$/.test(out.slice(-3)) ) { // a regex literal: skip it whole
      let j = i + 1; while (j < src.length && src[j] !== "/" && src[j] !== "\n") { if (src[j] === "\\") j++; j++; }
      if (src[j] === "/") { out += " ".repeat(j + 1 - i); i = j + 1; continue; }
    }
    out += c; i++;
  }
  return out;
}

const parecEspanol = (s0: string): boolean => { const s = s0.replace(/<[^>]*>/g, " "); return VOCABULARIO.test(s) || /[A-Za-záéíóúñ]{2}/.test(s) && (ACENTOS.test(s) || (/\s/.test(s.trim()) && PALABRAS.test(s))); };

/** The Spanish-looking literals of `src` that are not inside tx()/T()/ligar() and have no `i18n-ok` on their line. */
export function literalesSoloEspanol(src: string): { linea: number; texto: string }[] {
  const lineas = src.split("\n");
  if (lineas.slice(0, 6).some((l) => /i18n-ok-file:/.test(l))) return [];
  const limpio = sinComentarios(src), out: { linea: number; texto: string }[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const m of limpio.matchAll(re)) {
    const s = m[1] ?? m[2] ?? m[3] ?? "";
    if (!parecEspanol(s)) continue;
    const linea = limpio.slice(0, m.index).split("\n").length;
    if (/i18n-ok/.test(lineas[linea - 1] ?? "")) continue;
    // the enclosing call: walk back to the unmatched «(» and read the name before it
    let prof = 0, k = (m.index ?? 0) - 1, envuelto = false;
    for (; k >= 0; k--) {
      const ch = limpio[k];
      if (ch === ")" || ch === "]" || ch === "}") prof++;
      else if (ch === "(" || ch === "[" || ch === "{") {
        if (prof === 0) { if (ch === "(") { const n = /([A-Za-z_$][\w$]*)\s*$/.exec(limpio.slice(Math.max(0, k - 24), k))?.[1]; if (n && ENVOLTORIOS.has(n)) { envuelto = true; break; } } if (ch === "{" || ch === "[") { /* keep climbing: an object inside a call */ } }
        else prof--;
        if (prof < 0) break;
      }
      if (k < (m.index ?? 0) - 1500) break;
    }
    if (!envuelto) out.push({ linea, texto: s.slice(0, 80) });
  }
  return out;
}

/** Generated files that carry the Spanish diary on purpose (reported on the card: «what's new» stays Spanish until the diary is bilingual). */
const SALTAR: ReadonlySet<string> = new Set(["apps/plaza/novedades-datos.ts"]);

/** The files the sweep covers: apps/plaza/*.ts, packages/client/src/*.ts, features/<id>/client.ts. */
export function ficherosBarridos(): string[] {
  const ls = (d: string, f: (n: string) => boolean) => readdirSync(join(RAIZ, d)).filter(f).map((n) => join(d, n));
  return [
    ...ls("apps/plaza", (n) => n.endsWith(".ts")),
    ...ls("packages/client/src", (n) => n.endsWith(".ts")),
    ...readdirSync(join(RAIZ, "features")).map((f) => join("features", f, "client.ts")).filter((p) => { try { readFileSync(join(RAIZ, p)); return true; } catch { return false; } }),
  ];
}

test("the check notices a Spanish-only literal, and lets the wrapped, the marked and the English ones through", () => {
  assert.equal(literalesSoloEspanol('const a = "Añadir amigo";').length, 1);
  assert.equal(literalesSoloEspanol('const a = "Abre el libro de misiones";').length, 1);
  assert.equal(literalesSoloEspanol('const a = tx("Add friend", "Añadir amigo");').length, 0);
  assert.equal(literalesSoloEspanol('x(tx(\n  `Hello ${n}`,\n  `Hola ${n} con ñu`));').length, 0);
  assert.equal(literalesSoloEspanol('const a = "Añadir"; // i18n-ok: proper name').length, 0);
  assert.equal(literalesSoloEspanol('// i18n-ok-file: voice grammar\nconst a = "Añadir amigo";').length, 0);
  assert.equal(literalesSoloEspanol('const a = "Add a friend"; // Añadir amigo').length, 0);
  assert.equal(literalesSoloEspanol('f({ a: "en", b: "Añadir amigo" });').length, 1, "an object outside a wrapper is not wrapped");
});

test("no player-visible Spanish-only literal in the page's files", () => {
  const faltas: string[] = [];
  for (const f of ficherosBarridos().filter((x) => !SALTAR.has(x))) for (const l of literalesSoloEspanol(readFileSync(join(RAIZ, f), "utf8"))) faltas.push(`${f}:${l.linea}  «${l.texto}»`);
  assert.deepEqual(faltas.slice(0, 60), [], `${faltas.length} Spanish-only literals. Write them as tx("English", "Español") (packages/client/src/idioma.ts), or add // i18n-ok: <why> for proper names, developer logs and internal ids.`);
});
