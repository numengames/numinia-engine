// M4: the character HUD — what it draws from what reaches the page, and that the frame is in the table and the markup.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerHud, claseDePaso } from "../apps/plaza/hud-personaje.ts";
import { fuentesDeLucha, casillas, habilidadDeTecla, usar } from "../apps/plaza/combate.ts";
import { HABILIDADES, ECLIPSE } from "../features/lucha/habilidades.ts";
import { MARCOS_PLAZA, validarMarcos, marcosVisibles, cajaDe } from "../packages/client/src/densidad.ts";

const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("without a source nothing is invented: Estado, Carga and Aliento are null (their rows are not drawn)", () => {
  assert.deepEqual(leerHud({}), { nombre: "Tú", estado: null, carga: null, aliento: null });
  assert.equal(leerHud({ nombre: " Siroco " }).nombre, "Siroco");
});
test("with a source: the ladder index, the load and the breath, clamped", () => {
  assert.equal(leerHud({ estado: { actual: () => undefined } }).estado, -1, "a source that says nothing = Estable");
  assert.equal(leerHud({ estado: { actual: () => "Colapsado" } }).estado, 2);
  assert.equal(leerHud({ estado: { actual: () => "raro" } }).estado, -1);
  assert.deepEqual(leerHud({ carga: { actual: () => ({ valor: 64, max: 100 }) } }).carga, { valor: 64, max: 100, pct: 64 });
  assert.equal(leerHud({ carga: { actual: () => ({ valor: 150, max: 100 }) } }).carga!.pct, 100);
  assert.equal(leerHud({ carga: { actual: () => ({ valor: 5, max: 0 }) } }).carga, null);
  assert.equal(leerHud({ aliento: { actual: () => 78.4 } }).aliento!.pct, 78);
  assert.equal(leerHud({ aliento: { actual: () => NaN } }).aliento, null);
});
test("the steps' colour: lit up to the current one, amber for the first two, red for the last two", () => {
  assert.equal(claseDePaso(0, -1), "");
  assert.equal(claseDePaso(0, 0), "w");
  assert.equal(claseDePaso(1, 0), "");
  assert.equal(claseDePaso(1, 2), "w");
  assert.equal(claseDePaso(2, 2), "r");
});
test("the frame is in the table (movable and hideable by Editar interfaz) and in the page", () => {
  assert.deepEqual(validarMarcos(MARCOS_PLAZA), []);
  const m = MARCOS_PLAZA.find((x) => x.id === "hud.personaje")!;
  assert.ok(m && m.selector === "#hud-personaje" && m.cristal);
  assert.equal(cajaDe(m, "normal")!.ancla, "arriba-izquierda");
  assert.ok(!marcosVisibles("minimo").includes("hud.personaje") && marcosVisibles("normal").includes("hud.personaje"));
  assert.ok(leer("apps/plaza/index.html").includes('id="hud-personaje"'));
  assert.ok(leer("apps/plaza/marcos.ts").includes("montarHudPersonaje"));
  assert.ok(!/numinia/i.test(leer("apps/plaza/hud-personaje.ts").replace(/__numinia/g, "").replace(/Numinia[^\n]*/g, "")), "no brand in the UI text");
});

// ---- P2 (combate h2): Estado and Carga from the lucha client; the three slots are the Eclipse Mnémico kit ----
type FakeLucha = { activo(): boolean; carga(): number; estado(): string | undefined };
const falsa = (o: Partial<{ activo: boolean; carga: number; estado: string }> = {}): FakeLucha => ({ activo: () => o.activo ?? false, carga: () => o.carga ?? 0, estado: () => o.estado });

test("P2: with no fighting in the world Estado and Carga stay null (rows left out), even though the hooks are plugged", () => {
  const f = fuentesDeLucha(falsa());
  const v = leerHud({ estado: f.estado, carga: f.carga });
  assert.equal(v.estado, null);
  assert.equal(v.carga, null);
});
test("P2: once there is fighting the HUD shows the real Carga and Estado — and Aliento stays null (no source yet)", () => {
  const l = { activo: true, carga: 36, estado: "Confundido" };
  const f = fuentesDeLucha(falsa(l));
  const v = leerHud({ estado: f.estado, carga: f.carga });
  assert.equal(v.estado, 1);
  assert.deepEqual(v.carga, { valor: 36, max: 100, pct: 36 });
  assert.equal(v.aliento, null);
  assert.equal(leerHud({ estado: fuentesDeLucha(falsa({ activo: true })).estado }).estado, -1, "fighting but stable = Estable");
  assert.equal(leerHud({ estado: fuentesDeLucha(falsa({ activo: true, estado: "Aletargado" })).estado }).estado, 3);
});
test("P2: the hooks follow the client live (a getter, not a copy): they appear when fighting starts", () => {
  let activo = false;
  const f = fuentesDeLucha({ activo: () => activo, carga: () => 12, estado: () => undefined });
  assert.equal(leerHud({ carga: f.carga }).carga, null);
  activo = true;
  assert.equal(leerHud({ carga: f.carga }).carga!.valor, 12);
});
test("P2: the three slots are the kit in order, lit by what the Carga pays, each with a Spanish accessible name", () => {
  const c = casillas(0);
  assert.deepEqual(c.map((x) => [x.tecla, x.clave, x.lista]), [[1, "corte-breve", true], [2, "incision-semantica", false], [3, "discontinuidad", false]]);
  assert.deepEqual(c.map((x) => x.nombre), HABILIDADES.map((k) => ECLIPSE[k].nombre));
  assert.ok(c[0].etiqueta.startsWith("Habilidad 1, Corte Breve: 12 de daño, enfriamiento 1 s, da 12 de Carga") && !c[0].etiqueta.includes("Te falta"));
  assert.ok(c[1].etiqueta.includes("cuesta 30 de Carga") && c[1].etiqueta.endsWith("Te falta Carga"));
  assert.deepEqual(casillas(55).map((x) => x.lista), [true, true, true]);
  assert.equal(casillas(NaN)[0].lista, true);
});
test("P2: keys 1–3 ask for the ability; no modifier, no repeat, nothing else", () => {
  assert.equal(habilidadDeTecla({ key: "1" }), "corte-breve");
  assert.equal(habilidadDeTecla({ key: "2" }), "incision-semantica");
  assert.equal(habilidadDeTecla({ key: "3" }), "discontinuidad");
  assert.equal(habilidadDeTecla({ key: "4" }), null);
  assert.equal(habilidadDeTecla({ key: "a" }), null);
  assert.equal(habilidadDeTecla({ key: "1", repeat: true }), null);
  for (const m of ["ctrlKey", "metaKey", "altKey", "shiftKey"]) assert.equal(habilidadDeTecla({ key: "1", [m]: true }), null, m);
});
test("P2: using a slot only ASKS (the intent goes out with the ability's key); a refusal on the page's side is said in words", () => {
  const pedidas: string[] = [], dichas: string[] = [];
  usar({ habilidad: (k) => { pedidas.push(k); return { ok: true }; } }, "discontinuidad", (t) => dichas.push(t));
  assert.deepEqual(pedidas, ["discontinuidad"]);
  assert.deepEqual(dichas, []);
  usar({ habilidad: () => ({ ok: false, why: "no hay ninguna criatura cerca" }) }, "corte-breve", (t) => dichas.push(t));
  assert.deepEqual(dichas, ["No hay ninguna criatura cerca."]);
});
test("P2: wiring — main.ts plugs the hooks into __numinia and mounts the slots; the placeholder left objetivo.ts; Escape/layers are asked before a key acts", () => {
  const main = leer("apps/plaza/main.ts");
  assert.ok(main.includes("montarCombate({ lucha })") && main.includes("estado: fuentesLucha.estado, carga: fuentesLucha.carga"));
  assert.ok(!leer("apps/plaza/objetivo.ts").includes("Próximamente\""), "objetivo.ts no longer draws the placeholder slots");
  const c = leer("apps/plaza/combate.ts");
  assert.ok(c.includes("capas.arriba()") && c.includes("escribiendo(e)"), "typing and open layers own the digits");
  assert.ok(c.includes("aria-keyshortcuts") && c.includes("aria-label"));
  assert.ok(!/numinia/i.test(c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")), "no brand in the UI text");
});

test("ux2 integration (Pablo: «nada de Próximamente»): the card and the skill bar leave out what the page does not receive", () => {
  const code = (f: string) => leer(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  for (const f of ["apps/plaza/hud-personaje.ts", "apps/plaza/combate.ts"]) assert.ok(!/Próximamente/i.test(code(f)), `${f} draws no «Próximamente»`);
  assert.ok(/<section id="habilidades"[^>]*\bhidden\b/.test(leer("apps/plaza/index.html")), "the skill bar starts hidden");
  assert.ok(code("apps/plaza/combate.ts").includes("hab.hidden = !activo"), "and shows only with fighting");
});
