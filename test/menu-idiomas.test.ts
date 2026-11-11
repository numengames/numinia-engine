// i18n 4/5: every text of the settings menu exists in English AND Spanish (English is the official language and the fallback).
// It reads the engine's own settings (AJUSTES_MOTOR + the Language setting), the group names, the option names, the notes, and the
// fixed text of apps/plaza/index.html (`data-en` / `data-es` pairs). The checks are pure functions over data, so the last tests
// feed them a text with a missing value and prove they notice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AJUSTES_MOTOR, AJUSTE_IDIOMA, GRUPOS_MOTOR, ES_GRUPOS, ES_OPCIONES, ES_NOTAS } from "../packages/client/src/ajustes-motor.ts";
import { resolverTexto } from "../packages/client/src/ajustes.ts";

const lleno = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
/** A name made of no letters at all («24», «15°», «80 %») reads the same in every language: it needs no Spanish. */
const neutro = (s: string): boolean => !/\p{L}/u.test(s);

/** A `{ en, es }` text must carry both, non-empty. Returns the problems found (empty list = fine). */
export function faltasDeTexto(donde: string, t: unknown): string[] {
  if (typeof t !== "object" || t === null) return [`${donde}: it is not an { en, es } text (a plain string has no Spanish)`];
  const o = t as Record<string, unknown>;
  return (["en", "es"] as const).filter((l) => !lleno(o[l])).map((l) => `${donde}: missing «${l}»`);
}

type Decl = { grupo?: string; id: string; nombre: unknown; describe: unknown; nota?: string; opciones?: { valor: string; nombre: string }[] };
/** All the problems of a list of settings: texts, options (Spanish in `esOpciones`), notes (Spanish in `esNotas`). */
export function faltasDeAjustes(lista: readonly Decl[], esOpciones: Readonly<Record<string, Readonly<Record<string, string>>>>, esNotas: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  for (const d of lista) {
    const k = `${d.grupo}.${d.id}`;
    out.push(...faltasDeTexto(`${k} nombre`, d.nombre), ...faltasDeTexto(`${k} describe`, d.describe));
    for (const o of d.opciones ?? []) {
      if (!lleno(o.nombre)) out.push(`${k} option «${o.valor}»: missing «en»`);
      else if (!neutro(o.nombre) && !lleno(esOpciones[k]?.[o.valor])) out.push(`${k} option «${o.valor}» («${o.nombre}»): missing «es»`);
    }
    if (d.nota !== undefined) {
      if (!lleno(d.nota)) out.push(`${k} nota: missing «en»`);
      if (!lleno(esNotas[k])) out.push(`${k} nota: missing «es»`);
    }
  }
  return out;
}

/** The groups: each has an English name and a Spanish one. */
export function faltasDeGrupos(grupos: readonly { id: string; nombre: string }[], es: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  for (const g of grupos) {
    if (!lleno(g.nombre)) out.push(`group ${g.id}: missing «en»`);
    if (!lleno(es[g.id])) out.push(`group ${g.id}: missing «es»`);
  }
  return out;
}

/** The fixed text of a page: every `data-en[-attr]` has its `data-es[-attr]` (and the other way round), both non-empty, and the
 * markup itself reads the English (so the page is English before any script runs). */
export function faltasDePagina(html: string): string[] {
  const out: string[] = [];
  const decodificar = (s: string): string => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>/g)) {
    const [, tag, attrs] = m;
    if (!/\bdata-(en|es)\b/.test(attrs ?? "")) continue;
    const a = new Map<string, string>();
    for (const x of (attrs ?? "").matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) a.set(x[1] as string, decodificar(x[2] ?? ""));
    const id = a.get("id") ? `#${a.get("id")}` : `<${tag}> line ${html.slice(0, m.index).split("\n").length}`;
    for (const campo of [null, "title", "aria-label", "placeholder"]) {
      const suf = campo ? `-${campo}` : "", en = a.get(`data-en${suf}`), es = a.get(`data-es${suf}`);
      const nombre = `${id} ${campo ?? "text"}`;
      if (en === undefined && es === undefined) continue;
      if (!lleno(en)) out.push(`${nombre}: missing «en»`);
      if (!lleno(es)) out.push(`${nombre}: missing «es»`);
      if (campo && lleno(en) && a.get(campo) !== en) out.push(`${nombre}: the markup does not read the English (data-en${suf})`);
      if (!campo && lleno(en)) { // the content of a simple element (no children) must be the English text
        const tras = html.slice((m.index ?? 0) + m[0].length), cierre = tras.indexOf("<");
        if (cierre >= 0 && tras.slice(cierre).startsWith(`</${tag}>`) && decodificar(tras.slice(0, cierre)) !== en) out.push(`${nombre}: the markup does not read the English (data-en)`);
      }
    }
  }
  return out;
}

const html = readFileSync(new URL("../apps/plaza/index.html", import.meta.url), "utf8");
// «Language / Idioma» is bilingual on purpose (one label with both names, options each written in its own language, so whoever
// cannot read the current language still finds theirs): it has its own test below; its description is checked like the rest.
const TODOS: Decl[] = [...AJUSTES_MOTOR];
const IDIOMA_NOMBRES_PROPIOS = { en: "English", es: "Español" };

// ---- the real menu ----
test("every engine setting has its name and its description in en and es", () => {
  assert.ok(AJUSTES_MOTOR.length > 0);
  assert.deepEqual(faltasDeAjustes(TODOS, ES_OPCIONES, ES_NOTAS), []);
});

test("the Language setting: bilingual label, options in their own language, description in en and es", () => {
  assert.match(AJUSTE_IDIOMA.nombre as string, /Language/);
  assert.match(AJUSTE_IDIOMA.nombre as string, /Idioma/);
  assert.deepEqual(faltasDeTexto("interfaz.idioma describe", AJUSTE_IDIOMA.describe), []);
  assert.deepEqual(AJUSTE_IDIOMA.opciones?.map((o) => [o.valor, o.nombre]), Object.entries(IDIOMA_NOMBRES_PROPIOS));
});

test("resolving a setting's text in Spanish gives Spanish, and in English gives English", () => {
  for (const d of TODOS) {
    for (const campo of ["nombre", "describe"] as const) {
      const t = d[campo] as { en: string; es: string };
      assert.equal(resolverTexto(t, "es"), t.es, `${d.grupo}.${d.id} ${campo}`);
      assert.equal(resolverTexto(t, "en"), t.en, `${d.grupo}.${d.id} ${campo}`);
    }
  }
});

test("every engine group has its name in en and es", () => {
  assert.ok(GRUPOS_MOTOR.length > 0);
  assert.deepEqual(faltasDeGrupos(GRUPOS_MOTOR, ES_GRUPOS), []);
});

test("no Spanish option or note is left over for a setting or option that does not exist", () => {
  const ids = new Set(TODOS.map((d) => `${d.grupo}.${d.id}`));
  const sobran: string[] = [];
  for (const [k, ops] of Object.entries(ES_OPCIONES)) {
    const d = TODOS.find((x) => `${x.grupo}.${x.id}` === k);
    if (!d) { sobran.push(`ES_OPCIONES ${k}: no such setting`); continue; }
    for (const v of Object.keys(ops)) if (!d.opciones?.some((o) => o.valor === v)) sobran.push(`ES_OPCIONES ${k}.${v}: no such option`);
  }
  for (const k of Object.keys(ES_NOTAS)) if (!ids.has(k) || !TODOS.find((x) => `${x.grupo}.${x.id}` === k)?.nota) sobran.push(`ES_NOTAS ${k}: no such note`);
  for (const k of Object.keys(ES_GRUPOS)) if (!GRUPOS_MOTOR.some((g) => g.id === k)) sobran.push(`ES_GRUPOS ${k}: no such group`);
  assert.deepEqual(sobran, []);
});

test("apps/plaza/index.html: every fixed text has its data-en and data-es pair, and the markup reads English", () => {
  assert.ok((html.match(/data-en/g) ?? []).length >= 20, "the page should carry its pairs");
  assert.deepEqual(faltasDePagina(html), []);
});

// ---- the checks themselves: they must fail when a value is missing ----
test("check: a setting without «es» (or with an empty one, or a plain string) is reported", () => {
  const ok = { grupo: "g", id: "a", nombre: { en: "A", es: "Á" }, describe: { en: "d", es: "d" } };
  assert.deepEqual(faltasDeAjustes([ok], {}, {}), []);
  assert.deepEqual(faltasDeAjustes([{ ...ok, describe: { en: "d" } }], {}, {}), ["g.a describe: missing «es»"]);
  assert.deepEqual(faltasDeAjustes([{ ...ok, nombre: { en: "A", es: "  " } }], {}, {}), ["g.a nombre: missing «es»"]);
  assert.deepEqual(faltasDeAjustes([{ ...ok, nombre: { es: "Á" } }], {}, {}), ["g.a nombre: missing «en»"]);
  assert.equal(faltasDeAjustes([{ ...ok, nombre: "Plain" }], {}, {}).length, 1);
});

test("check: an option or a note without Spanish is reported; a name made of no letters is not", () => {
  const base = { grupo: "g", id: "a", nombre: { en: "A", es: "Á" }, describe: { en: "d", es: "d" } };
  const conOpciones = { ...base, opciones: [{ valor: "x", nombre: "Low" }, { valor: "30", nombre: "30°" }] };
  assert.deepEqual(faltasDeAjustes([conOpciones], {}, {}), ["g.a option «x» («Low»): missing «es»"]);
  assert.deepEqual(faltasDeAjustes([conOpciones], { "g.a": { x: "Baja" } }, {}), []);
  const conNota = { ...base, nota: "A note" };
  assert.deepEqual(faltasDeAjustes([conNota], {}, {}), ["g.a nota: missing «es»"]);
  assert.deepEqual(faltasDeAjustes([conNota], {}, { "g.a": "Una nota" }), []);
});

test("check: a group without its Spanish name is reported", () => {
  assert.deepEqual(faltasDeGrupos([{ id: "g", nombre: "Group" }], {}), ["group g: missing «es»"]);
  assert.deepEqual(faltasDeGrupos([{ id: "g", nombre: "Group" }], { g: "Grupo" }), []);
});

test("check: a page text without data-es (or empty, or not reading English) is reported", () => {
  assert.deepEqual(faltasDePagina(`<button id="a" data-en="Close" data-es="Cerrar">Close</button>`), []);
  assert.deepEqual(faltasDePagina(`<button id="a" data-en="Close">Close</button>`), ["#a text: missing «es»"]);
  assert.deepEqual(faltasDePagina(`<button id="a" data-en="Close" data-es="">Close</button>`), ["#a text: missing «es»"]);
  assert.deepEqual(faltasDePagina(`<button id="a" data-es="Cerrar">Close</button>`), ["#a text: missing «en»"]);
  assert.deepEqual(faltasDePagina(`<button id="a" data-en="Close" data-es="Cerrar">Cerrar</button>`), ["#a text: the markup does not read the English (data-en)"]);
  assert.deepEqual(faltasDePagina(`<p id="b" title="Hi" data-en-title="Hi" data-es-title="Hola"></p>`), []);
  assert.deepEqual(faltasDePagina(`<p id="b" title="Hi" data-en-title="Hi"></p>`), ["#b title: missing «es»"]);
  assert.deepEqual(faltasDePagina(`<p id="b" aria-label="Hola" data-en-aria-label="Hi" data-es-aria-label="Hola"></p>`), ["#b aria-label: the markup does not read the English (data-en-aria-label)"]);
});

// ---- the window's own fixed texts (tabs, buttons, announcements) go through t() ----
test("apps/plaza/menu-ajustes-ui.ts: the window's fixed texts (tabs, buttons) have no Spanish-only literals", () => {
  const ui = readFileSync(new URL("../apps/plaza/menu-ajustes-ui.ts", import.meta.url), "utf8");
  const solo = [...ui.split("\n").entries()]
    .filter(([, l]) => !l.trimStart().startsWith("//"))
    .flatMap(([i, l]) => [...l.matchAll(/(?:nombre|textContent|ariaLabel|title):\s*"([^"]+)"|textContent\s*=\s*"([^"]+)"/g)].map((m) => `line ${i + 1}: ${m[1] ?? m[2]}`))
    .filter((s) => /[áéíóúñ¿¡]|: (Juego|Interfaz|Controles|Sonido|Accesibilidad|Cuenta)/.test(s));
  assert.deepEqual(solo, []);
});
