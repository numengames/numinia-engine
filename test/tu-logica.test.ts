// «Tú» (rediseño v2, story B): which avatar you wear and its portrait, your badges, the line under your name, and the
// device's facts that moved to Ajustes. Plus: every house avatar has its three portraits (tools/retratos.mjs) in the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import catalogo from "../activos/avatares/catalogo.json" with { type: "json" };
import { retratoDe, avatarQueLlevas, insigniasDelLibro, desdeHace, lineaDeTu, CON_RETRATO } from "../apps/plaza/tu-logica.ts";
import { filasAparato, filasIdentidad } from "../apps/plaza/info-aparato.ts";

const raiz = new URL("../", import.meta.url);

test("every house avatar has its bust, body and back portrait as a real WebP in the page's public folder", () => {
  assert.equal(CON_RETRATO.size, catalogo.modelos.length);
  for (const m of catalogo.modelos) {
    for (const tipo of ["busto", "cuerpo", "espalda"] as const) {
      const url = retratoDe(m.id, tipo)!;
      assert.equal(url, `/retratos/${m.id}-${tipo}.webp`);
      const f = new URL(`apps/plaza/public${url}`, raiz);
      assert.ok(existsSync(f), `falta ${url}: node tools/retratos.mjs ${m.id}`);
      const b = readFileSync(f);
      assert.equal(b.subarray(0, 4).toString("latin1"), "RIFF"); assert.equal(b.subarray(8, 12).toString("latin1"), "WEBP");
      assert.ok(statSync(f).size < 60_000, `${url} pesa demasiado`);
    }
  }
});
test("an avatar with no portrait (an upload, an unknown id) gets none: the page draws the house silhouette", () => {
  assert.equal(retratoDe(undefined, "busto"), null);
  assert.equal(retratoDe("", "cuerpo"), null);
  assert.equal(retratoDe("subido-por-ana", "busto"), null);
  assert.equal(retratoDe("../../etc", "busto"), null);
});
test("the avatar you wear: your choice, else the renderer's per-entity default", () => {
  const ms = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(avatarQueLlevas(ms, 2, 0)?.id, "c");
  assert.equal(avatarQueLlevas(ms, undefined, 4)?.id, "b", "elegirAvatar: entity mod n");
  assert.equal(avatarQueLlevas(ms, undefined, -1)?.id, "a", "before the welcome: entity 0, as avatares.ts");
  assert.equal(avatarQueLlevas([], 0, 0), null);
  assert.equal(avatarQueLlevas(undefined, undefined, 0), null);
});
test("badges: a done quest's badges (not its objects) are earned, an active quest's are still to earn, each name once, earned first", () => {
  const l = insigniasDelLibro([
    { titulo: "El jardín", estado: "activa", recompensa: "Insignia «Regadera»" },
    { titulo: "La pesca", estado: "hecha", recompensa: "Insignia «Pescador» y Objeto «Caña»" },
    { titulo: "Sin premio", estado: "hecha", recompensa: "" },
    { titulo: "La pesca", estado: "hecha", recompensa: "Insignia «Pescador»" },
    { titulo: "Otra vez", estado: "activa", recompensa: "Insignia «Pescador»" },
  ]);
  assert.deepEqual(l, [
    { nombre: "Pescador", mision: "La pesca", conseguida: true },
    { nombre: "Regadera", mision: "El jardín", conseguida: false },
  ]);
  assert.deepEqual(insigniasDelLibro([]), []);
});
test("the line under your name leaves out what the page does not know", () => {
  assert.equal(desdeHace(0), ""); assert.equal(desdeHace(30_000), "acabas de llegar");
  assert.equal(desdeHace(12 * 60_000 + 5), "aquí desde hace 12 min");
  assert.equal(desdeHace(60 * 60_000), "aquí desde hace 1 h"); assert.equal(desdeHace(75 * 60_000), "aquí desde hace 1 h 15 min");
  assert.equal(lineaDeTu({ avatar: "Polybot", mundo: "la Plaza", ms: 12 * 60_000 }), "Polybot · en la Plaza · aquí desde hace 12 min");
  assert.equal(lineaDeTu({ avatar: null, mundo: " ", ms: 0 }), "");
  assert.equal(lineaDeTu({ avatar: "Skelly", ms: 0 }), "Skelly");
});
test("the facts that left the sheet are all in Ajustes: device, visit and identity", () => {
  const f = {
    view: { backend: "WebGL2", power: { mobile: false, battery: false, scale: 0.8, targetFps: (a: boolean) => (a ? 60 : 30) }, vr: { active: false }, ar: { state: "off" } },
    session: { entity: 7, who: { id: "abcdef123456", nombre: "Invitado QZ3Y" }, stats: { rttMs: 42, visible: 3 } },
    desde: () => 1000, ahora: () => 1000 + 13 * 60_000,
  };
  const a = Object.fromEntries(filasAparato(f));
  assert.deepEqual(Object.keys(a), ["Gráficos", "Clase", "Cuadros por segundo", "Resolución", "Modo batería", "Viendo en", "Conectado", "Ping", "Personas a la vista"]);
  assert.equal(a["Gráficos"], "WebGL2"); assert.equal(a["Resolución"], "80 % (bajada para no calentar)"); assert.equal(a["Conectado"], "13 min");
  assert.equal(a["Ping"], "42 ms"); assert.equal(a["Personas a la vista"], "3");
  const i = Object.fromEntries(filasIdentidad(f));
  assert.equal(i["Nombre"], "Invitado QZ3Y"); assert.match(i["Identificador de invitado"], /^abcdef…/); assert.equal(i["Tu número en esta zona"], "7");
  assert.equal(Object.fromEntries(filasIdentidad({ session: { ...f.session, who: null, entity: -1 } }))["Tu número en esta zona"], "—");
});
test("«Tú» keeps three tabs and no «Próximamente»; the sheet no longer carries the device's numbers", () => {
  const src = readFileSync(new URL("apps/plaza/ficha.ts", raiz), "utf8");
  assert.ok(!/Próximamente/i.test(src.replace(/\/\/.*$/gm, "")), "nothing «Próximamente» in what the player reads");
  assert.ok(!/Cuadros por segundo|Identificador de invitado|Ping/.test(src));
  for (const id of ["personaje", "reserva", "insignias"]) assert.ok(src.includes(`id: "${id}"`));
  assert.ok(!src.includes('id: "misiones"') && !src.includes('id: "gente"'));
});

// MIS-257: the sheet's Personaje screen carries what you wear and the adventures under way
import { equipoDeLaLista, aventurasEnCurso } from "../apps/plaza/tu-logica.ts";
const obj = (id: string, tipo: string, portado: boolean) => ({ id, tipo, clase: "", nombre: id, icono: "", color: "", valor: 1, n: 1, portado });
test("equipoDeLaLista: only what is carried, the one weapon and at most three relics; a bad list is an empty kit", () => {
  const e = equipoDeLaLista([obj("espada", "arma", true), obj("hacha", "arma", false), obj("r1", "reliquia", true), obj("r2", "reliquia", true), obj("r3", "reliquia", true), obj("r4", "reliquia", true), obj("pez", "captura", true), obj("semilla", "token", false)]);
  assert.equal(e.arma?.id, "espada");
  assert.deepEqual(e.reliquias.map((o) => o.id), ["r1", "r2", "r3"]);
  assert.deepEqual(equipoDeLaLista(undefined), { arma: null, reliquias: [] });
  assert.deepEqual(equipoDeLaLista([null, 3, "x"]), { arma: null, reliquias: [] });
});
test("aventurasEnCurso: active ones only, the followed one first, with the text of the step you are on", () => {
  const lista = [{ n: 0, texto: "Habla con Ana" }, { n: 1, texto: "Lleva la carta" }];
  const l = [
    { id: "a", titulo: "Vieja", estado: "hecha", paso: 2, pasos: 2, seguida: false, lista },
    { id: "b", titulo: "Primera", estado: "activa", paso: 0, pasos: 2, seguida: false, lista },
    { id: "c", titulo: "Seguida", estado: "activa", paso: 1, pasos: 2, seguida: true, lista },
  ];
  const a = aventurasEnCurso(l);
  assert.deepEqual(a.map((x) => x.id), ["c", "b"]);
  assert.equal(a[0].siguiente, "Lleva la carta"); assert.equal(a[1].siguiente, "Habla con Ana");
  assert.equal(a[0].pasos, 2);
  assert.deepEqual(aventurasEnCurso(null), []); assert.deepEqual(aventurasEnCurso([null, { estado: "activa" }]), []);
});
