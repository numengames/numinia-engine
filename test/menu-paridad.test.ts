// v2 paridad: the menus are the same on the computer, the phone and in VR. ONE list of sections
// (packages/render/src/menu-secciones.ts) gives each its id, icon, names, order and where it exists; the bar, the phone's
// «…» menu and the VR menu read it. This test fails when a section of the computer or the phone is not in VR without a
// written reason, when a button of the bar is not in the list, or when a file goes back to writing its own names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SECCIONES_MUNDO, seccion, nombreDe, iconoDe, tituloDe, seccionesEn, idsPanelVR, seccionDeReloj, excepcionesVR,
} from "../packages/render/src/menu-secciones.ts";
import { SECCIONES, ETIQUETAS, ICONOS, BOTONES_RELOJ, NOMBRES_RELOJ } from "../packages/render/src/menu-vr.ts";
import { pathsIcono } from "../apps/plaza/iconos.ts";

const leer = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const FUENTES = ["main.ts", "gente.ts", "gente-comun.ts", "avisos.ts", "mapa.ts", "movil.ts", "graboso.ts", "pantalla.ts", "voz.ts", "xr-menu.ts"].map((f) => leer(`apps/plaza/${f}`)).join("\n") + leer("apps/plaza/index.html");

/** The exceptions: a section of the computer or the phone that VR does not have. Adding one means editing this list
 * AND giving it a reason in menu-secciones.ts (`sinVR`). `debe: true` = VR still owes it (the pending list). */
const EXCEPCIONES = {
  camara: false, compartir: false, pantalla: false, teclas: true, interactuar: false, ar: false, vr: false,
} as const;

test("the list is well formed: unique ids and order, both languages, a real icon, a key that looks like one", () => {
  assert.equal(new Set(SECCIONES_MUNDO.map((s) => s.id)).size, SECCIONES_MUNDO.length);
  assert.equal(new Set(SECCIONES_MUNDO.map((s) => s.orden)).size, SECCIONES_MUNDO.length);
  for (const s of SECCIONES_MUNDO) {
    assert.ok(s.es && s.en, `${s.id}: needs es and en`);
    assert.ok(pathsIcono(s.icono).length > 0, `${s.id}: the icon «${s.icono}» is not in apps/plaza/iconos.ts`);
    assert.ok(s.botones.length > 0 && s.aparatos.length > 0, `${s.id}: a button and a device`);
    if (s.tecla) assert.match(s.tecla, /^([A-Z]|F\d+)$/, `${s.id}: key`);
  }
  assert.equal(nombreDe("gente"), "Gente"); assert.equal(nombreDe("gente", "en"), "People");
  assert.equal(tituloDe("gente"), "Gente (L)"); assert.equal(tituloDe("ar"), "Entrar en AR");
  assert.equal(iconoDe("bolsa"), "package");
  assert.throws(() => seccion("nope"));
});

test("PARITY: every section of the computer or the phone is in VR, or is a written exception", () => {
  for (const s of SECCIONES_MUNDO) {
    const enVR = s.aparatos.includes("vr");
    if (enVR) assert.ok(s.vr, `${s.id}: it is in VR, so it says where (panel or watch)`);
    else {
      assert.ok(s.sinVR?.motivo && s.sinVR.motivo.length > 10, `${s.id}: not in VR, so it needs a reason (sinVR.motivo)`);
      assert.ok(s.aparatos.some((a) => a === "pc" || a === "movil"), `${s.id}: lives nowhere`);
    }
  }
  const reales = Object.fromEntries(excepcionesVR().map((e) => [e.id, e.debe]));
  assert.deepEqual(reales, EXCEPCIONES, "the exceptions to «the same on every device» changed: update this list on purpose");
  assert.deepEqual(excepcionesVR().filter((e) => e.debe).map((e) => e.id), ["teclas"], "what VR still owes");
});

test("the seven sections of the computer's menu are the VR panel's first rows, in the same order, with the same names and icons; v7 adds Chat as the eighth", () => {
  const sieteDelOrdenador = seccionesEn("pc").filter((s) => s.orden <= 7).map((s) => s.id);
  assert.deepEqual(sieteDelOrdenador, ["tu", "gente", "bolsa", "misiones", "mapa", "construir", "ajustes"]);
  assert.deepEqual([...SECCIONES], [...sieteDelOrdenador, "chat"]);
  assert.deepEqual(idsPanelVR(), [...sieteDelOrdenador, "chat"]);
  for (const id of sieteDelOrdenador) {
    const s = seccion(id);
    // «Construir» is the one left off the phone: a phone walks and talks (Pablo, 2026-10-22)
    assert.deepEqual([...s.aparatos], id === "construir" ? ["pc", "vr"] : ["pc", "movil", "vr"], `${id} exists where it should`);
    assert.equal(ETIQUETAS[id as keyof typeof ETIQUETAS], s.es);
    assert.equal(ICONOS[id as keyof typeof ICONOS], s.icono);
  }
  // v7: «Chat» is the same section on the three devices (id, icon, name as the bar's «Chat» button)
  assert.deepEqual([...seccion("chat").aparatos], ["pc", "movil", "vr"]);
  assert.equal(ETIQUETAS.chat, "Chat"); assert.equal(ICONOS.chat, "chat-circle"); assert.equal(ETIQUETAS.chat, nombreDe("chat"));
  assert.deepEqual(seccion("chat").botones, ["chat-boton"]);
  assert.equal(ETIQUETAS.avisos, nombreDe("avisos")); assert.equal(ICONOS.avisos, "bell");
});

test("the watch's buttons are sections of the same list, with its names", () => {
  for (const b of BOTONES_RELOJ) {
    const s = seccionDeReloj(b);
    assert.ok(s.aparatos.includes("vr"));
    assert.equal(NOMBRES_RELOJ[b], s.es);
  }
  assert.deepEqual(BOTONES_RELOJ.map((b) => NOMBRES_RELOJ[b]), ["Menú", "Micrófono", "Foto", "Grabar", "Avisos", "Volver a la ciudad"]);
});

test("every section's button exists in the page, and every button of the bar is a section", () => {
  for (const s of SECCIONES_MUNDO) for (const id of s.botones) {
    const hay = new RegExp(`id="${id}"|id = "${id}"|id: "${id}"|"${id}"`).test(FUENTES);
    assert.ok(hay, `${s.id}: no element «${id}» in apps/plaza`);
  }
  // the ids the bar builds or moves into itself (main.ts) and the modules that add their own button to it
  const main = leer("apps/plaza/main.ts");
  const enLaBarra = [
    ...(main.match(/for \(const id of \[([^\]]+)\]\) \{ const e = document\.getElementById\(id\)/)?.[1].match(/"[^"]+"/g) ?? []).map((x) => x.slice(1, -1)),
    ...[...main.matchAll(/botonBarra\("([^"]+)"/g)].map((m) => m[1]),
    ...[...leer("apps/plaza/avisos.ts").matchAll(/boton\.id = "([^"]+)"/g)].map((m) => m[1]),
    ...[...leer("apps/plaza/gente.ts").matchAll(/id: "(gente-abrir)"/g)].map((m) => m[1]),
  ];
  assert.ok(enLaBarra.length >= 8, `found ${enLaBarra.join(",")}`);
  const conocidos = new Set(SECCIONES_MUNDO.flatMap((s) => [...s.botones]));
  for (const id of enLaBarra) assert.ok(conocidos.has(id), `the bar has «${id}» but menu-secciones.ts has no section for it`);
});

test("the bar, the phone and the VR menu read the list instead of writing their own names", () => {
  for (const f of ["main.ts", "gente-comun.ts", "avisos.ts", "mapa.ts", "movil.ts", "xr-menu.ts"]) assert.match(leer(`apps/plaza/${f}`), /menu-secciones/, `${f} reads menu-secciones`);
  assert.doesNotMatch(leer("apps/plaza/movil.ts"), /"Pantalla completa", "desktop"|"Ficha", icono: "user"/, "the phone's «…» menu names come from the list");
  assert.doesNotMatch(leer("apps/plaza/avisos.ts"), /title = "Avisos \(N\)"/);
  assert.doesNotMatch(leer("apps/plaza/gente.ts"), /title: "Gente \(L\)"/);
  assert.doesNotMatch(leer("apps/plaza/index.html"), /Tu ficha/);
});
