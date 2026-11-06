// mundo-hermes · lane M3 story 3: entorno.json `tema: "black-and-white"` makes the page's HUD pure black and white — for the hermes template ONLY.
// The reader (esquema + mundo), /status (`temaHud`, absent for every other world), the page module (flat CSS: only #000/#fff), the minimap palette,
// and the template carrying the flag. A world without the flag: no key in /status, nothing loaded, same file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { leerTema, validarEntorno, TEMAS } from "../features/entorno/esquema.ts";
import { temaDelMundo } from "../features/mundo.ts";
import { startServer } from "../packages/server/src/server.ts";
import { aplicarTemaByn, ACENTO, CLASE, CSS } from "../apps/plaza/tema-byn.ts";

const MOTOR = { build: "dev", commit: "0".repeat(40), imagen: "" };

test("tema: the reader — absent = none, the one value is accepted, anything else says what is allowed and keeps the rest of the file", () => {
  assert.deepEqual(TEMAS, ["black-and-white"]);
  assert.deepEqual(leerTema({}), { ok: true, value: null });
  assert.deepEqual(leerTema(null), { ok: true, value: null });
  assert.deepEqual(leerTema({ tema: "black-and-white" }), { ok: true, value: "black-and-white" });
  for (const mal of ["verde", "", 1, true, null, ["black-and-white"], { tema: 1 }]) {
    const r = leerTema({ tema: mal });
    assert.equal(r.ok, false, JSON.stringify(mal));
    if (!r.ok) assert.match(r.issues[0].message, /«black-and-white»/);
  }
  assert.equal(validarEntorno({ tema: "black-and-white" }).ok, true);
  const v = validarEntorno({ tema: "rosa" });
  assert.equal(v.ok, false); if (!v.ok) assert.equal(v.issues[0].path, "entorno.tema");
});

test("tema: temaDelMundo — a wrong value is said once and the world keeps the house look; no file = none", () => {
  const log: string[] = [];
  assert.equal(temaDelMundo(() => undefined, (l) => log.push(l)), null);
  assert.equal(temaDelMundo(() => ({ tema: "black-and-white" }), (l) => log.push(l)), "black-and-white");
  assert.equal(log.length, 0);
  assert.equal(temaDelMundo(() => ({ tema: "neon" }), (l) => log.push(l)), null);
  assert.equal(log.length, 1); assert.match(log[0], /tema de entorno\.json no se usa/);
});

test("tema: /status tells `temaHud` only to the world that asks; the others have no key and are byte-identical", async () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "tema-")); mkdirSync(join(dir, "entorno"), { recursive: true });
  const estado = async (temaHud: "black-and-white" | null | undefined) => {
    const s = await startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, motor: MOTOR, entorno: join(dir, "entorno"), ...(temaHud === undefined ? {} : { temaHud }) });
    try { const j = await (await fetch(`http://127.0.0.1:${s.port}/status`)).json() as Record<string, unknown>; delete j.uptime; return j; } finally { await s.close(); }
  };
  const con = await estado("black-and-white"), sin = await estado(undefined), nulo = await estado(null);
  assert.equal(con.temaHud, "black-and-white");
  assert.equal("temaHud" in sin, false); assert.equal("temaHud" in nulo, false);
  assert.equal(JSON.stringify(sin), JSON.stringify(nulo), "a world without the flag answers exactly as before");
  assert.equal("tema" in con, "tema" in sin, "the ficha's own `tema` is untouched");
});

test("tema: the template carries the flag (and ONLY it) — the other templates do not", () => {
  const raiz = new URL("../plantillas/", import.meta.url);
  const hermes = JSON.parse(readFileSync(new URL("hermes/entorno/entorno.json", raiz), "utf8"));
  assert.equal(hermes.tema, "black-and-white");
  assert.equal(validarEntorno(hermes).ok, true, "the template stays a valid environment");
  for (const t of readdirSync(raiz)) {
    if (t === "hermes") continue;
    const f = new URL(`${t}/entorno/entorno.json`, raiz);
    if (existsSync(f)) assert.equal((JSON.parse(readFileSync(f, "utf8")) as { tema?: unknown }).tema, undefined, t);
  }
});

test("tema: the page CSS is flat — only #000, #fff and the ONE accent, no gradients, no translucency (but the backdrop), no shadows left on", () => {
  const colores = CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  assert.ok(colores.length > 10);
  for (const c of colores) assert.ok(c === "#000" || c === "#fff" || c.toUpperCase() === ACENTO, `colour ${c}`);
  assert.equal(ACENTO, "#FFD400");
  assert.ok(new Set(colores.map((c) => c.toLowerCase())).size <= 3, "black, white and one accent: nothing else");
  assert.equal(/gradient|rgba?\(|hsla?\(/.test(CSS), false);
  assert.match(CSS, /html\.tema-byn #minimapa canvas/);
  assert.match(CSS, /box-shadow: none/);
});

test("tema: aplicarTemaByn is idempotent, adds the class and one style, and undoes cleanly", () => {
  const clases = new Set<string>(), estilos: { id: string; textContent: string; removed: boolean }[] = [];
  const doc = {
    documentElement: { classList: { add: (c: string) => clases.add(c), remove: (c: string) => clases.delete(c) } },
    head: { appendChild: (e: (typeof estilos)[number]) => estilos.push(e) },
    getElementById: (id: string) => estilos.find((e) => e.id === id && !e.removed) ?? null,
    createElement: () => ({ id: "", textContent: "", removed: false, remove() { this.removed = true; } }),
  } as unknown as Document;
  const deshacer = aplicarTemaByn(doc);
  assert.ok(clases.has(CLASE)); assert.equal(estilos.length, 1); assert.equal(estilos[0].textContent, CSS);
  aplicarTemaByn(doc);
  assert.equal(estilos.length, 1, "the second call adds nothing");
  deshacer();
  assert.equal(clases.has(CLASE), false); assert.equal(estilos[0].removed, true);
});

test("tema: the minimap palette (mapa.ts imports CSS, so it is read as source here) swaps ground and marks, and the page calls it", () => {
  assert.match(readFileSync(new URL("../apps/plaza/mapa.ts", import.meta.url), "utf8"), /export function temaMapa\(byn: boolean\)/);
  assert.match(readFileSync(new URL("../apps/plaza/main.ts", import.meta.url), "utf8"), /temaHud === "black-and-white"\) void Promise\.all\(\[import\("\.\/tema-byn\.ts"\), import\("\.\/mapa\.ts"\)\]\)/);
  const fuente = readFileSync(new URL("../apps/plaza/mapa.ts", import.meta.url), "utf8");
  assert.match(fuente, /SUELO = byn \? "#000" : "#b7c6ab"/);
  assert.match(fuente, /const tinta = \(c: string\): string => \(BYN \? "#fff" : c\)/);
});

test("tema: while a card of the espejo is open (`ficha-espejo` on the root) the theme hides the action bar and the prompt; the rule is scoped to the theme and to that class", () => {
  const regla = CSS.split("\n").find((l) => l.includes("ficha-espejo"));
  assert.ok(regla, "the theme has the rule");
  assert.match(regla!, /^html\.tema-byn\.ficha-espejo :is\(#acciones, #interactuar\) \{ display: none !important; \}/);
  assert.equal(CSS.split("\n").filter((l) => l.includes("ficha-espejo")).length, 1, "one rule, nothing else keyed to the class");
  assert.equal(CSS.split("\n").some((l) => /^#acciones|^\.ficha-espejo|^html\.ficha-espejo/.test(l)), false, "never outside the theme's own selector");
});

test("tema: the action bar grows with its chips (height auto) so the second row is not cut; scoped to the theme", () => {
  const regla = CSS.split("\n").find((l) => l.startsWith("html.tema-byn[data-densidad-nivel] body #acciones"));
  assert.ok(regla, "the theme has the rule");
  assert.match(regla!, /\{ height: auto !important; \}/);
  assert.equal(CSS.split("\n").some((l) => /^#acciones|^html body #acciones/.test(l)), false);
});
