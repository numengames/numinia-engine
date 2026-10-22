// U24: the phone layout's rules (packages/client/src/movil.ts): the one contextual action, the glyph table per device
// (no «pulsa E» on touch), chat states, long press, sizes, the «…» menu, the left third of the screen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GLIFOS, ayudaDe, conGlifo, cercaDeAlguien, contextoDe, elegirAccion, siguienteChat, esPulsacionLarga, tamanoOk, entradasDelMenu, enZonaAndar, ZONA_ANDAR_MOVIL, ZONA_ANDAR_ANTES, esMovil, ultimaLinea, SALTAR, ZONA_SEGURA_SIMULADA } from "../packages/client/src/movil.ts";
import { APARATOS } from "../packages/client/src/aparato.ts";
import { readFileSync } from "node:fs";

const CLASES = APARATOS.filter((a) => a !== "auto");

test("the contextual action names the verb of what is near: Hablar / Recoger / Poner tu obra / Pescar", () => {
  assert.equal(contextoDe("hablar con Alma, la guía").verbo, "Hablar");
  assert.equal(contextoDe("coger la naranja").verbo, "Recoger");
  assert.equal(contextoDe("recoger la llave").verbo, "Recoger");
  assert.equal(contextoDe("poner tu obra en este hueco").verbo, "Poner tu obra");
  assert.equal(contextoDe("cambiar la obra de este hueco").verbo, "Poner tu obra");
  assert.equal(contextoDe("pescar").verbo, "Pescar");
  assert.equal(contextoDe("tirar los dados").verbo, "Tirar");
  assert.equal(contextoDe("tirar dardos").verbo, "Tirar");
  assert.equal(contextoDe("abrir la puerta").verbo, "Abrir", "an unknown verb keeps its first word");
  assert.equal(contextoDe("").verbo, "Usar");
});

test("one button: something near wins, nothing near jumps, fishing and talking hand the corner over", () => {
  const cerca = { feature: "misiones", key: "pnj:1", prompt: "hablar con Iria" };
  assert.equal(elegirAccion({ cerca })!.verbo, "Hablar");
  assert.deepEqual(elegirAccion({ cerca: null }), SALTAR);
  assert.equal(elegirAccion({ cerca, pescando: true }), null);
  assert.equal(elegirAccion({ cerca: null, ocupado: true }), null);
});

test("no help on a touch device names a key; a keyboard still does", () => {
  for (const c of CLASES) {
    const claves = Object.keys(GLIFOS[c]) as (keyof (typeof GLIFOS)["escritorio"])[];
    for (const a of claves) {
      const t = `${ayudaDe(c, a, "hablar con Alma")} | ${conGlifo(c, a, "Cerrar")} | ${cercaDeAlguien(c)}`;
      if (c === "movil-vertical" || c === "movil-horizontal") {
        assert.equal(GLIFOS[c][a], null, `${c}.${a} has no glyph`);
        assert.doesNotMatch(t, /\bE\b|\bpulsa\b|\btecla\b|\bEsc\b|\bIntro\b|\bEspacio\b|\(M\)|\(I\)|\(J\)/, `${c}.${a}: ${t}`);
      }
    }
  }
  assert.equal(ayudaDe("escritorio", "interactuar", "hablar con Alma"), "E: hablar con Alma");
  assert.equal(ayudaDe("movil-vertical", "interactuar", "hablar con Alma"), "Hablar con Alma");
  assert.equal(conGlifo("escritorio", "cerrar", "Adiós"), "Adiós (Esc)");
  assert.equal(conGlifo("movil-horizontal", "cerrar", "Adiós"), "Adiós");
  assert.equal(cercaDeAlguien("escritorio"), "acércate y pulsa E");
  assert.match(cercaDeAlguien("movil-vertical"), /toca el botón/);
  assert.equal(ayudaDe("vr", "interactuar", "pescar"), "gatillo: pescar");
});

test("chat: hidden → one line → full; ▾ folds to the line, ✕ hides", () => {
  assert.equal(siguienteChat("oculto", "tocar"), "linea");
  assert.equal(siguienteChat("linea", "tocar"), "completo");
  assert.equal(siguienteChat("completo", "plegar"), "linea");
  assert.equal(siguienteChat("completo", "ocultar"), "oculto");
  assert.equal(siguienteChat("linea", "ocultar"), "oculto");
});

test("a long press needs time and a still finger", () => {
  assert.equal(esPulsacionLarga({ ms: 600, dx: 2, dy: 3 }), true);
  assert.equal(esPulsacionLarga({ ms: 300, dx: 0, dy: 0 }), false);
  assert.equal(esPulsacionLarga({ ms: 900, dx: 30, dy: 0 }), false, "a scroll is not a long press");
});

test("sizes: frequent controls ≥ 44, secondary ≥ 28", () => {
  assert.equal(tamanoOk(44, 44, true), true);
  assert.equal(tamanoOk(43, 60, true), false);
  assert.equal(tamanoOk(28, 28, false), true);
  assert.equal(tamanoOk(27, 40, false), false);
});

test("the joystick owns the left third on a phone (the left half before); the rest of the screen looks", () => {
  assert.equal(ZONA_ANDAR_MOVIL, 1 / 3);
  assert.equal(enZonaAndar(100, 0, 390, ZONA_ANDAR_MOVIL), true);
  assert.equal(enZonaAndar(131, 0, 390, ZONA_ANDAR_MOVIL), false);
  assert.equal(enZonaAndar(180, 0, 390, ZONA_ANDAR_ANTES), true);
  assert.equal(enZonaAndar(200, 0, 390, ZONA_ANDAR_ANTES), false);
  assert.equal(esMovil("movil-vertical"), true); assert.equal(esMovil("escritorio"), false); assert.equal(esMovil("vr"), false); assert.equal(esMovil(undefined), false);
});

test("the «…» menu: Saltar first, the features' actions, then what lives behind «más»; no duplicates, no Recoger (it is the big button's)", () => {
  const e = entradasDelMenu([{ id: "saludar", label: "Saludar" }, { id: "bailar", label: "Bailar" }, { id: "recoger", label: "Recoger" }], [{ id: "mic", etiqueta: "Micrófono", icono: "microphone" }, { id: "saludar", etiqueta: "otra vez", icono: "x" }]);
  assert.deepEqual(e.map((x) => x.id), ["saltar", "saludar", "bailar", "mic"]);
  assert.equal(e.find((x) => x.id === "mic")!.masAlla, true);
  assert.equal(e.find((x) => x.id === "saludar")!.masAlla, undefined);
});

test("the one-line chat shows the last spoken line, not a notice", () => {
  assert.deepEqual(ultimaLinea([{ nombre: "Iria", texto: "hola", tuyo: false, tipo: "cerca" }, { nombre: "", texto: "silencio", tuyo: false, tipo: "aviso" }]), { quien: "Iria", texto: "hola" });
  assert.deepEqual(ultimaLinea([{ nombre: "Yo", texto: "vale", tuyo: true, tipo: "cerca" }]), { quien: "Tú", texto: "vale" });
  assert.equal(ultimaLinea([]), null);
});

test("simulated safe zones exist for both phone orientations", () => {
  assert.ok(ZONA_SEGURA_SIMULADA["movil-vertical"].t > 0 && ZONA_SEGURA_SIMULADA["movil-vertical"].b > 0);
  assert.ok(ZONA_SEGURA_SIMULADA["movil-horizontal"].l > 0 && ZONA_SEGURA_SIMULADA["movil-horizontal"].r > 0);
});

test("Galatea paseo: a phone offers no «Construir», and the skill slots show only while a creature is in reach", () => {
  const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  assert.doesNotMatch(leer("apps/plaza/movil.ts"), /\["construir", "construir"\]/, "the «…» menu does not carry Construir");
  assert.match(leer("apps/plaza/movil.css"), /body:not\(:has\(#objetivo:not\(\[hidden\]\)\)\) #habilidades \{ display: none !important; \}/);
  const css = leer("apps/plaza/tema.css");
  assert.match(css, /#habilidades \.hueco \.nom \{[^}]*font-size: 13px/, "the slot names are legible (≥ 13 px)");
  assert.doesNotMatch(css, /#habilidades[^{]*\{[^}]*font(-size)?: (10|11)px/, "no 10–11 px text left in the slots");
});

test("phone chat box leaves room for the 88 px action button (it ran 22 px under «Saltar» on a 360 px phone)", () => {
  const css = readFileSync(new URL("../apps/plaza/movil.css", import.meta.url), "utf8");
  const chat = /body #chat \{[^}]*max-width: calc\(100vw - var\(--sl\) - var\(--sr\) - var\(--m\) - 16px - 88px - 8px\)/;
  assert.match(css, chat, "#chat max-width reserves the action button (16 + 88) and 8 px of air");
  assert.match(css, /#accion \{[^}]*width: 88px/, "the button is still 88 px: if it changes, change the chat reserve too");
});

test("phone «…» menu: its buttons are wide enough for «Movimientos» (75 px at 12 px type spilled out of a 64 px button)", () => {
  const css = readFileSync(new URL("../apps/plaza/movil.css", import.meta.url), "utf8");
  assert.match(css, /#mas-menu \{[^}]*grid-template-columns: repeat\(3, 80px\)/, "portrait: 3 columns of 80 px");
  assert.match(css, /movil-horizontal"\] #mas-menu \{[^}]*grid-template-columns: repeat\(5, 80px\)/, "landscape: 5 columns of 80 px");
});
