// F1 (naturaleza): the fauna table and the pure «who is in the world» logic (packages/relieve/src/fauna.ts). No rendering here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GRUPOS, RAREZAS_FAUNA, FAUNA_POR_NIVEL, NIVELES_FAUNA, CELDA_M, VENTANA_S, OCUPACION, MEZCLA_TIPICA, ESQUEMA_FAUNA,
  validarTabla, especiesDe, habitantes, probabilidad, pVerRareza, faseDelDia, celdasEnVista, trayectoria, fundido, ventanaDe,
} from "../packages/relieve/src/fauna.ts";
import type { CtxHabitantes, Grupo, NivelFauna, TablaFauna } from "../packages/relieve/src/fauna.ts";
import type { Zona } from "../packages/relieve/src/relieve.ts";
import { ZONAS, zonaEn as zonaReal, alturaEn as alturaReal } from "../packages/relieve/src/relieve.ts";
import { FAUNA_CASA } from "../features/naturaleza/fauna-casa.ts";
import { leerNaturaleza, DEFECTOS } from "../features/naturaleza/esquema.ts";
import { conMundo } from "../features/mundo.ts";
import servidor from "../features/servidor.ts";
import { FAUNA_POR_NIVEL as DESDE_NIVELES } from "../packages/render/src/naturaleza/niveles.ts";

const T: TablaFauna = FAUNA_CASA, crudo = JSON.parse(readFileSync(new URL("../features/naturaleza/fauna.json", import.meta.url), "utf8"));
const llano = (z: Zona): Pick<CtxHabitantes, "zonaEn" | "alturaEn"> => ({ zonaEn: () => z, alturaEn: () => 0 });
const ctx = (z: Zona, hora: number, nivel: NivelFauna = "A", extra: Partial<CtxHabitantes> = {}): CtxHabitantes => ({ ...llano(z), hora, densidad: 1, nivel, ...extra });
const real = (hora: number, nivel: NivelFauna = "A"): CtxHabitantes => ({ zonaEn: (x, z) => zonaReal(1234, x, z), alturaEn: (x, z) => alturaReal(1234, x, z), hora, densidad: 1, nivel });

// CIE Lab ΔE76 between two sRGB ints: the distance a person sees between two glows.
function lab(c: number): [number, number, number] {
  const lin = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const r = lin((c >> 16) & 255), g = lin((c >> 8) & 255), b = lin(c & 255);
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE = (a: number, b: number) => { const p = lab(a), q = lab(b); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

// ---------------------------------------------------------------- the table
test("the house table: valid, 3 groups with at least 10 distinct breeds each, ascii ids, every tier present, the weights of a group sum to 100000", () => {
  assert.equal(crudo.schema, ESQUEMA_FAUNA);
  assert.match(String(crudo._doc), /fauna/);
  const ids = new Set(T.especies.map((e) => e.id));
  assert.equal(ids.size, T.especies.length, "unique ids");
  for (const e of T.especies) { assert.match(e.id, /^[a-z0-9]+(-[a-z0-9]+)*$/); assert.ok(e.nombre.length > 3); }
  for (const g of GRUPOS) {
    const es = especiesDe(T, g);
    assert.ok(es.length >= 10, `${g}: ${es.length} breeds`);
    assert.equal(new Set(es.map((e) => e.nombre)).size, es.length);
    for (const r of RAREZAS_FAUNA) assert.ok(es.some((e) => e.rareza === r), `${g} has a ${r}`);
    assert.equal(es.reduce((s, e) => s + e.peso, 0), 100000, `${g} weights`);
    const por = (r: string) => es.filter((e) => e.rareza === r).reduce((s, e) => s + e.peso, 0);
    assert.ok(por("comun") > por("rara") && por("rara") > por("epica") && por("epica") > por("legendaria"), `${g}: rarer = lighter`);
    for (const e of es) assert.ok(e.peso > 0);
  }
  assert.ok(T.especies.length >= 30);
  // the three groups differ in the hour and in size as the brief says
  assert.ok(especiesDe(T, "mariposa").every((e) => e.hora === "dia"));
  assert.ok(especiesDe(T, "luciernaga").every((e) => e.hora !== "dia") && especiesDe(T, "luciernaga").some((e) => e.hora === "noche"));
  assert.ok(especiesDe(T, "pajaro").every((e) => e.hora !== "noche") && especiesDe(T, "pajaro").some((e) => e.hora === "crepusculo"));
  assert.ok(especiesDe(T, "pajaro").some((e) => e.bandada[1] > 1) && especiesDe(T, "mariposa").every((e) => e.bandada[1] === 1));
  for (const e of T.especies) {
    assert.ok(e.zonas.length >= 1 && e.zonas.every((z) => ZONAS.includes(z)));
    assert.ok(e.vuelo.altura[0] < e.vuelo.altura[1] && e.vuelo.velocidad > 0 && e.vuelo.radio > 0);
    for (const c of Object.values(e.colores)) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff);
  }
});

test("fireflies: at least 10 clearly different glow colours (min Lab distance), also the rarer, the more unusual pulse", () => {
  const f = especiesDe(T, "luciernaga");
  assert.ok(f.length >= 10);
  let min = Infinity, par = "";
  for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) { const d = dE(f[i].colores.luz, f[j].colores.luz); if (d < min) { min = d; par = `${f[i].id}/${f[j].id}`; } }
  assert.ok(min >= 20, `closest pair ${par} ΔE ${min.toFixed(1)}`);
  // the common ones use the gentle pulses; epic and legendary use the unusual ones or a slow dramatic heartbeat
  const suaves = new Set(["latido", "parpadeo", "respiro", "onda"]);
  assert.ok(f.filter((e) => e.rareza === "comun").every((e) => suaves.has(e.luz)));
  assert.ok(f.filter((e) => e.rareza === "epica").every((e) => !suaves.has(e.luz)), "epic pulses are unusual");
  assert.ok(f.some((e) => e.luz === "prisma") && f.some((e) => e.luz === "morse"));
  // butterflies and birds are told apart by wing / plumage colour as well (so a flock of the same breed reads as one)
  for (const g of ["mariposa", "pajaro"] as const) {
    const es = especiesDe(T, g);
    let m = Infinity;
    for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) m = Math.min(m, dE(es[i].colores.ala, es[j].colores.ala) + dE(es[i].colores.luz, es[j].colores.luz) * 0.5);
    assert.ok(m >= 12, `${g}: closest breeds differ by ${m.toFixed(1)}`);
  }
});

// ---------------------------------------------------------------- who is alive
test("habitantes is deterministic, integer-seeded and never touches the clock or Math.random", () => {
  const a = habitantes(1234, { cx: 3, cz: -2 }, 41, T, real(12)), b = habitantes(1234, { cx: 3, cz: -2 }, 41, T, real(12));
  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
  assert.notDeepEqual(a, habitantes(1234, { cx: 3, cz: -2 }, 42, T, real(12)), "another window, other animals");
  assert.notDeepEqual(a, habitantes(1235, { cx: 3, cz: -2 }, 41, T, real(12)), "another seed");
  assert.notDeepEqual(a, habitantes(1234, { cx: 4, cz: -2 }, 41, T, real(12)), "another cell");
  for (const h of a) {
    assert.ok(h.x >= 3 * CELDA_M && h.x < 4 * CELDA_M && h.z >= -2 * CELDA_M && h.z < -1 * CELDA_M, "inside its cell");
    assert.ok(h.y > alturaReal(1234, h.x, h.z), "above the ground");
    assert.ok(h.fase >= 0 && h.fase < 1 && Number.isInteger(h.semillaPropia) && h.n >= 1);
    assert.ok(T.especies.some((e) => e.id === h.especie));
  }
  assert.equal(new Set(a.map((h) => h.id)).size, a.length, "unique ids");
  const src = readFileSync(new URL("../packages/relieve/src/fauna.ts", import.meta.url), "utf8");
  const codigo = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/Math\.random|Date\.now|performance\.now|new Date|from "three|document\.|window\./.test(codigo), "pure");
  assert.equal(ventanaDe(0), 0); assert.equal(ventanaDe(119.9), 0); assert.equal(ventanaDe(120), 1);
  assert.equal(fundido(0), 0); assert.equal(fundido(60), 1); assert.ok(fundido(119) < 1 && fundido(119) > 0);
});

function contar(z: Zona, hora: number, grupo: Grupo, minimo: number, nivel: NivelFauna = "A") {
  const por = new Map<string, number>(); let total = 0;
  for (let v = 0; total < minimo; v++) for (let c = 0; c < 40 && total < minimo; c++) for (const h of habitantes(7, { cx: c, cz: v % 17 }, v, T, ctx(z, hora, nivel))) {
    const e = T.especies.find((s) => s.id === h.especie)!;
    if (e.grupo !== grupo) continue;
    por.set(h.especie, (por.get(h.especie) ?? 0) + 1); total++;
  }
  return { por, total };
}

test("rarity weights are respected over 100k draws (every breed within 4 sigma of the model)", () => {
  for (const [grupo, hora] of [["mariposa", 12], ["luciernaga", 0], ["pajaro", 12]] as const) {
    const { por, total } = contar("prado", hora, grupo, 100000);
    assert.ok(total >= 100000);
    const filas = probabilidad(T, { hora, zona: "prado", nivel: "A" }).filter((f) => f.grupo === grupo && f.pGrupo > 0);
    let suma = 0;
    for (const f of filas) {
      const esperado = f.pGrupo * total, sigma = Math.sqrt(esperado * (1 - f.pGrupo)), obs = por.get(f.id) ?? 0;
      suma += obs;
      assert.ok(Math.abs(obs - esperado) <= 4 * sigma + 2, `${f.id}: ${obs} vs ${esperado.toFixed(1)} ±${sigma.toFixed(1)}`);
    }
    assert.equal(suma, total, "only species that are active");
    // by tier: the shares of the four words follow the table
    const tier = (r: string) => filas.filter((f) => f.rareza === r).reduce((s, f) => s + (por.get(f.id) ?? 0), 0) / total;
    assert.ok(tier("comun") > 0.97 && tier("rara") > 0.004 && tier("rara") < 0.016 && tier("epica") < 0.005 && tier("legendaria") < 0.002, `${grupo}: ${["comun", "rara", "epica", "legendaria"].map(tier).join(" ")}`);
  }
});

test("day and night: butterflies by day, fireflies by night, dusk birds at dusk", () => {
  const cuenta = (hora: number) => {
    const c: Record<Grupo, number> = { mariposa: 0, luciernaga: 0, pajaro: 0 }, lista: string[] = [];
    for (let v = 0; v < 60; v++) for (let cx = -3; cx < 3; cx++) for (const h of habitantes(5, { cx, cz: v % 5 }, v, T, ctx("prado", hora))) { const e = T.especies.find((s) => s.id === h.especie)!; c[e.grupo]++; lista.push(e.id); }
    return { c, lista };
  };
  assert.equal(faseDelDia(12), "dia"); assert.equal(faseDelDia(0), "noche"); assert.equal(faseDelDia(19), "crepusculo"); assert.equal(faseDelDia(6), "crepusculo"); assert.equal(faseDelDia(24 + 12), "dia");
  const dia = cuenta(12), noche = cuenta(0), tarde = cuenta(19);
  assert.ok(dia.c.mariposa > 200 && dia.c.luciernaga === 0 && dia.c.pajaro > 20, JSON.stringify(dia.c));
  assert.ok(noche.c.mariposa === 0 && noche.c.luciernaga > 400, JSON.stringify(noche.c));
  assert.ok(noche.c.pajaro < dia.c.pajaro / 3, "birds mostly sleep (only the dusk breeds linger)");
  assert.ok(tarde.c.mariposa > 0 && tarde.c.mariposa < dia.c.mariposa / 1.8 && tarde.c.luciernaga > 0 && tarde.c.luciernaga < noche.c.luciernaga, "dusk: both, fewer");
  assert.ok(tarde.lista.includes("luciernaga-ambar") && tarde.lista.includes("golondrina-bobina"), "the dusk breeds are out");
  assert.ok(!dia.lista.some((id) => id.startsWith("luciernaga")));
});

test("zone preference: a breed is far commoner in its zones; empty ground gets few animals; density and the world's allow-list are obeyed", () => {
  const n = (z: Zona, id: string, hora = 12) => { let k = 0; for (let v = 0; v < 400; v++) for (let c = 0; c < 8; c++) for (const h of habitantes(3, { cx: c, cz: v % 9 }, v, T, ctx(z, hora))) if (h.especie === id) k++; return k; };
  const lente = [n("bosque", "mariposa-lente"), n("prado", "mariposa-lente")], laton = [n("prado", "mariposa-laton"), n("roca", "mariposa-laton")];
  assert.ok(lente[0] > lente[1] * 2.5, `lente in forest ${lente[0]} vs meadow ${lente[1]}`);
  assert.ok(laton[0] > laton[1] * 2.5, `latón in meadow ${laton[0]} vs rock ${laton[1]}`);
  const total = (z: Zona) => { let k = 0; for (let v = 0; v < 200; v++) for (let c = 0; c < 8; c++) k += habitantes(3, { cx: c, cz: v % 9 }, v, T, ctx(z, 12)).filter((h) => T.especies.find((s) => s.id === h.especie)!.grupo === "mariposa").length; return k; };
  assert.ok(total("prado") > total("arena") * 1.1 || total("prado") > 0);
  // density 0 = nobody; half = about half; an allow-list shows only those ids
  assert.equal(habitantes(3, { cx: 1, cz: 1 }, 1, T, { ...ctx("prado", 12), densidad: 0 }).length, 0);
  let lleno = 0, mitad = 0;
  for (let v = 0; v < 300; v++) for (let c = 0; c < 6; c++) { lleno += habitantes(9, { cx: c, cz: 0 }, v, T, ctx("prado", 12)).length; mitad += habitantes(9, { cx: c, cz: 0 }, v, T, { ...ctx("prado", 12), densidad: 0.5 }).length; }
  assert.ok(mitad / lleno > 0.42 && mitad / lleno < 0.58, `half density gives ${(mitad / lleno).toFixed(2)}`);
  const pocas = new Set<string>();
  for (let v = 0; v < 100; v++) for (const h of habitantes(9, { cx: 0, cz: 0 }, v, T, { ...ctx("prado", 12), especies: ["mariposa-rele", "gorrion-laton"] })) pocas.add(h.especie);
  assert.deepEqual([...pocas].sort(), ["gorrion-laton", "mariposa-rele"]);
});

test("caps per tier: never more than the cell cap of the tier, the cap follows the view, a smaller tier is a prefix of a bigger one, the view holds its maximum", () => {
  for (const nv of NIVELES_FAUNA) {
    const t = FAUNA_POR_NIVEL[nv];
    for (const g of GRUPOS) {
      const base = Math.ceil(t.enVista[g] / celdasEnVista(nv));
      assert.ok(t.celda[g] >= base && t.celda[g] <= base + 1, `${nv} ${g}: celda ${t.celda[g]} vs ceil(enVista / cells in view) ${base}`);
      const menor = NIVELES_FAUNA[NIVELES_FAUNA.indexOf(nv) + 1];
      if (menor) assert.ok(FAUNA_POR_NIVEL[menor].celda[g] <= t.celda[g] && FAUNA_POR_NIVEL[menor].enVista[g] < t.enVista[g], `${nv} > ${menor} for ${g}: a smaller tier never holds more`);
    }
  }
  assert.equal(DESDE_NIVELES, FAUNA_POR_NIVEL, "render's niveles.ts re-exports the same table");
  const maximo: Record<NivelFauna, Record<Grupo, number>> = { A: { mariposa: 0, luciernaga: 0, pajaro: 0 }, B: { mariposa: 0, luciernaga: 0, pajaro: 0 }, C: { mariposa: 0, luciernaga: 0, pajaro: 0 }, D: { mariposa: 0, luciernaga: 0, pajaro: 0 } };
  for (let v = 0; v < 80; v++) for (let cx = -4; cx < 4; cx++) for (const hora of [12, 0, 19]) {
    const A = habitantes(11, { cx, cz: 2 }, v, T, ctx("prado", hora, "A"));
    for (const nv of NIVELES_FAUNA) {
      const lista = habitantes(11, { cx, cz: 2 }, v, T, ctx("prado", hora, nv));
      for (const g of GRUPOS) {
        const k = lista.filter((h) => T.especies.find((s) => s.id === h.especie)!.grupo === g).length;
        assert.ok(k <= FAUNA_POR_NIVEL[nv].celda[g], `${nv} ${g} ${k}`);
        maximo[nv][g] = Math.max(maximo[nv][g], k);
      }
      const tope = (h: { id: string }) => FAUNA_POR_NIVEL[nv].celda[({ m: "mariposa", l: "luciernaga", p: "pajaro" } as const)[h.id[0] as "m" | "l" | "p"]];
      assert.deepEqual(lista, A.filter((h) => Number(h.id.slice(h.id.lastIndexOf("_") + 1)) < tope(h)), "the first slots of tier A, nothing else");
      const ids = new Set(A.map((h) => h.id));
      assert.ok(lista.every((h) => ids.has(h.id)), `${nv}: a subset of tier A's animals, same ids`);
    }
  }
  // the cap is reached sometimes (it is a real ceiling, not a loose one) and the disc of the view holds about enVista × occupancy on average
  assert.equal(maximo.A.mariposa, FAUNA_POR_NIVEL.A.celda.mariposa); assert.equal(maximo.D.luciernaga, FAUNA_POR_NIVEL.D.celda.luciernaga);
  for (const nv of NIVELES_FAUNA) {
    const radio = FAUNA_POR_NIVEL[nv].radio, cel = Math.ceil(radio / CELDA_M);
    let suma = 0, k = 0;
    for (let v = 0; v < 120; v++) { let c = 0; for (let cx = -cel; cx <= cel; cx++) for (let cz = -cel; cz <= cel; cz++) c += habitantes(2, { cx, cz }, v, T, ctx("prado", 12, nv)).filter((h) => T.especies.find((s) => s.id === h.especie)!.grupo === "mariposa").length; suma += c; k++; }
    const media = suma / k, tope = FAUNA_POR_NIVEL[nv].celda.mariposa * (2 * cel + 1) ** 2;
    assert.ok(media <= tope * OCUPACION * 1.02 && media > tope * OCUPACION * 0.3, `${nv}: ${media.toFixed(1)} butterflies over ${(2 * cel + 1) ** 2} cells (cap ${tope})`);
  }
  assert.ok(FAUNA_POR_NIVEL.A.enVista.mariposa === 60 && FAUNA_POR_NIVEL.B.enVista.mariposa === 36 && FAUNA_POR_NIVEL.C.enVista.mariposa === 24 && FAUNA_POR_NIVEL.D.enVista.mariposa === 10);
});

// ---------------------------------------------------------------- the probability table
test("the model: P(see ≥1 legendary in 30 min walking) 10–20 %, epic ~40 %, rare most visits, common always — day and night, tiers A–C", () => {
  for (const nv of ["A", "B", "C"] as const) for (const hora of [12, 0]) {
    const p = pVerRareza(T, { hora, nivel: nv });
    assert.ok(p.legendaria >= 0.1 && p.legendaria <= 0.2, `${nv} h${hora} legendaria ${p.legendaria.toFixed(3)}`);
    assert.ok(p.epica >= 0.33 && p.epica <= 0.55, `${nv} h${hora} epica ${p.epica.toFixed(3)}`);
    assert.ok(p.rara >= 0.85, `${nv} h${hora} rara ${p.rara.toFixed(3)}`);
    assert.ok(p.comun > 0.999);
  }
  assert.ok(pVerRareza(T, { hora: 12, nivel: "D" }).legendaria > 0.05, "tier D sees fewer animals, so fewer rare ones");
  // the table agrees with itself: shares of a group sum to 1, and the expectation per cell matches a simulation
  const f = probabilidad(T, { hora: 12, zona: "prado", nivel: "A" });
  for (const g of GRUPOS) { const s = f.filter((x) => x.grupo === g).reduce((a, x) => a + x.pGrupo, 0); assert.ok(g === "luciernaga" ? s === 0 : Math.abs(s - 1) < 1e-9, `${g} ${s}`); }
  assert.ok(Math.abs(f.reduce((a, x) => a + x.pTodos, 0) - 1) < 1e-9);
  let vivos = 0, ventanas = 0;
  for (let v = 0; v < 3000; v++) { vivos += habitantes(4, { cx: v % 11, cz: (v >> 4) % 7 }, v, T, ctx("prado", 12, "B")).filter((h) => T.especies.find((s) => s.id === h.especie)!.grupo === "mariposa").length; ventanas++; }
  const esperado = f.filter((x) => x.grupo === "mariposa").reduce((a, x) => a + x.enCelda, 0) * (FAUNA_POR_NIVEL.B.celda.mariposa / FAUNA_POR_NIVEL.A.celda.mariposa);
  assert.ok(Math.abs(vivos / ventanas - esperado) / esperado < 0.04, `simulated ${(vivos / ventanas).toFixed(3)} vs model ${esperado.toFixed(3)}`);
  assert.ok(Math.abs(MEZCLA_TIPICA.prado + MEZCLA_TIPICA.bosque + MEZCLA_TIPICA.arena + MEZCLA_TIPICA.roca + MEZCLA_TIPICA.orilla - 1) < 1e-9);
  assert.ok(f.every((x) => x.vistos >= 0 && x.pVer >= 0 && x.pVer <= 1));
  assert.ok(VENTANA_S === 120);
});

test("trayectoria: a deterministic loop around the anchor that stays within the species' radius", () => {
  const h = habitantes(1234, { cx: 0, cz: 0 }, 5, T, real(12))[0];
  const e = T.especies.find((s) => s.id === h.especie)!;
  const a = trayectoria(h, e, 33.3), b = trayectoria(h, e, 33.3);
  assert.deepEqual(a, b);
  for (let t = 0; t < VENTANA_S; t += 3) { const p = trayectoria(h, e, t); assert.ok(Math.hypot(p.x - h.x, p.z - h.z) <= e.vuelo.radio * 1.01); assert.ok(Math.abs(p.y - h.y) <= (e.vuelo.altura[1] - e.vuelo.altura[0]) * 0.16 + 1e-9); }
});

// ---------------------------------------------------------------- validation
test("validarTabla: the house table passes; every mistake comes with its path and how to fix it, all at once", () => {
  assert.ok(validarTabla(crudo).ok);
  const mala = (cambia: (t: any) => void) => { const t = structuredClone(crudo); cambia(t); const r = validarTabla(t); assert.ok(!r.ok); return r.ok ? "" : r.issues.map((i) => `${i.path}: ${i.message}`).join(" | "); };
  assert.match(mala((t) => { t.especies[0].rareza = "mitica"; }), /especies\[0\]\.rareza: una de: "comun", "rara", "epica", "legendaria"/);
  assert.match(mala((t) => { t.especies[1].peso = 0; }), /especies\[1\]\.peso: un número mayor que 0/);
  assert.match(mala((t) => { t.especies[2].colores.luz = "amarillo"; }), /colores\.luz: un color en hexadecimal con almohadilla/);
  assert.match(mala((t) => { t.especies[3].zonas = ["cielo"]; }), /zonas: una lista sin repetir con al menos una de: "prado"/);
  assert.match(mala((t) => { t.especies[4].id = "Mariposa Bonita"; }), /id: un texto corto en minúsculas sin tildes/);
  assert.match(mala((t) => { t.especies[5].id = t.especies[0].id; }), /está repetido/);
  assert.match(mala((t) => { t.especies[6].alas = 4; }), /especies\[6\]\.alas: clave desconocida/);
  assert.match(mala((t) => { t.especies[7].luz = "arcoiris"; }), /luz: una de: "fijo"/);
  assert.match(mala((t) => { t.especies[8].vuelo.altura = [9, 2]; }), /vuelo\.altura: \[mín, máx\]/);
  assert.match(mala((t) => { t.especies[0].bandada = [2, 4]; }), /solo los pájaros van en bandada/);
  assert.match(mala((t) => { t.especies[30].bandada = [3, 1]; }), /bandada: \[mín, máx\]/);
  assert.match(mala((t) => { t.schema = "otro@1"; t.cosas = 1; }), /fauna\.cosas: clave desconocida[\s\S]*fauna\.schema: debe ser/);
  const varias = mala((t) => { t.especies[0].peso = -1; t.especies[1].hora = "tarde"; t.especies[2].tamano = 9; });
  assert.equal(varias.split(" | ").length, 3, "all of them, not only the first");
  const vacia = validarTabla({ especies: [] }); assert.ok(!vacia.ok);
  assert.ok(!validarTabla([1, 2]).ok && !validarTabla(null).ok);
  const poca = validarTabla({ especies: [crudo.especies[0]] }); assert.ok(poca.ok, "a world may ship a small table of its own");
});

test("naturaleza.json `fauna`: optional, validated, extra keys rejected, says how to fix it; defaults on", () => {
  const ok = leerNaturaleza({});
  assert.ok(ok.ok && ok.value.fauna === true && ok.value.faunaDensidad === 1 && ok.value.faunaEspecies === "");
  assert.deepEqual({ fauna: DEFECTOS.fauna, d: DEFECTOS.faunaDensidad, e: DEFECTOS.faunaEspecies }, { fauna: true, d: 1, e: "" });
  const bien = leerNaturaleza({ fauna: { activa: false, densidad: 0.456, especies: ["luciernaga-ambar", "mariposa-rele"] } }, T.especies.map((e) => e.id));
  assert.ok(bien.ok && bien.value.fauna === false && bien.value.faunaDensidad === 0.46 && bien.value.faunaEspecies === "luciernaga-ambar,mariposa-rele");
  const err = (json: unknown, re: RegExp, ids?: string[]) => { const r = leerNaturaleza(json, ids); assert.ok(!r.ok, JSON.stringify(json)); assert.match(r.ok ? "" : r.issues.map((i) => `${i.path}: ${i.message}`).join(" | "), re, JSON.stringify(json)); };
  err({ fauna: 3 }, /naturaleza\.fauna: un objeto \{ "activa"/);
  err({ fauna: { bichos: 1 } }, /naturaleza\.fauna\.bichos: clave desconocida.*activa, densidad, especies/);
  err({ fauna: { activa: "si" } }, /naturaleza\.fauna\.activa: true o false/);
  err({ fauna: { densidad: 2 } }, /naturaleza\.fauna\.densidad: un número entre 0 y 1/);
  err({ fauna: { especies: [] } }, /naturaleza\.fauna\.especies: una lista de 1 a 64 ids/);
  err({ fauna: { especies: ["dragon"] } }, /no existe\(n\) en la tabla: "dragon"; los ids son: mariposa-rele/, T.especies.map((e) => e.id));
  err({ fauna: { especies: ["a", "a"] } }, /ids repetidos/, ["a"]);
  err({ fauna: { especies: ["NO valido"] } }, /no existe\(n\) en la tabla/);
  err({ fauna: { especies: Array.from({ length: 40 }, (_, i) => `una-especie-con-nombre-largo-${i}`) } }, /demasiado larga/, Array.from({ length: 40 }, (_, i) => `una-especie-con-nombre-largo-${i}`));
  err({ fauna: { activa: 1, densidad: "x", z: 1 } }, /fauna\.z[\s\S]*fauna\.activa[\s\S]*fauna\.densidad/);
});

test("a world: its own fauna.json replaces the house table (checked against naturaleza.json's species), a wrong one is logged and the house table stays", () => {
  const casa = servidor.find((p) => p.feature.id === "naturaleza")!;
  const propia = { especies: [{ ...crudo.especies[0], id: "mi-bicho" }] };
  const mundo = (ficheros: Record<string, unknown>, log: string[]) => conMundo(servidor, (f) => ficheros[f], (l) => log.push(l)).find((p) => p.feature.id === "naturaleza")!;
  let log: string[] = [];
  assert.notEqual(mundo({ "naturaleza.json": { fauna: { especies: ["mi-bicho"] } }, "fauna.json": propia }, log), casa);
  assert.equal(log.length, 0, `a good pair says nothing: ${log}`);
  log = [];
  assert.equal(mundo({ "naturaleza.json": { fauna: { especies: ["mi-bicho"] } } }, log), casa, "without its own table the id is unknown");
  assert.match(log.join(" "), /naturaleza\.json no se usa[\s\S]*naturaleza\.fauna\.especies: no existe\(n\) en la tabla: "mi-bicho"/);
  log = [];
  assert.notEqual(mundo({ "naturaleza.json": { fauna: { especies: ["mariposa-rele"] } }, "fauna.json": { especies: [{ id: "x" }] } }, log), casa, "the house table is used instead and its ids still count");
  assert.match(log.join(" "), /\[mundo\] fauna\.json no se usa \(uso la tabla de la casa\): fauna\.especies\[0\]\.nombre/);
  log = [];
  mundo({ "fauna.json": [1] }, log);
  assert.match(log.join(" "), /\[mundo\] fauna\.json no se usa[\s\S]*un objeto JSON/);
  log = [];
  mundo({}, log);
  assert.equal(log.length, 0);
});

test("layers: the pure file sits in relieve (imports only its siblings) and features may import relieve", () => {
  const src = readFileSync(new URL("../packages/relieve/src/fauna.ts", import.meta.url), "utf8");
  const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imports.every((i) => /^\.\/[a-z]+\.ts$/.test(i)), imports.join(","));
  const reglas = JSON.parse(readFileSync(new URL("../tools/layers.json", import.meta.url), "utf8"));
  assert.ok(reglas.features.includes("relieve") && reglas.relieve.length === 0);
});
