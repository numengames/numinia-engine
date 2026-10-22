// S6s: la máquina de pasos (pura): cuándo suena un paso, un salto y un aterrizaje.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crearPasos, PASO_M, AIRE_MIN_S } from "../apps/plaza/sonidos.ts";

const DT = 0.05;
test("quieto no suena", () => {
  const p = crearPasos();
  for (let i = 0; i < 40; i++) assert.deepEqual(p({ y: 0, speed: 0, grounded: true }, DT), []);
});

const contar = (speed: number, s = 1) => { const p = crearPasos(); const q: string[] = []; for (let i = 0; i < s / DT; i++) q.push(...p({ y: 0, speed, grounded: true }, DT)); return q; };

test("caminando (1,5 m/s) suenan ≈ 2 pasos por segundo: la cadencia de una persona, un sonido por pie", () => {
  const n = contar(1.5, 4).length / 4;
  assert.ok(n >= 1.8 && n <= 2.2, `${n} pasos/s (cada pie ${PASO_M.camina} m)`);
});

test("corriendo (4 m/s) el ritmo sube, ≈ 2,9 por segundo, sin ametrallar", () => {
  const n = contar(4, 4).length / 4;
  assert.ok(n >= 2.6 && n <= 3.1, `${n} pasos/s`);
});

test("los pies se turnan, empezando por el derecho, y vuelven a empezar tras pararse", () => {
  const q = contar(1.5, 3);
  assert.equal(q[0], "derecho");
  q.forEach((x, i) => { if (i) assert.notEqual(x, q[i - 1], `dos «${x}» seguidos en ${i}`); });
  const p = crearPasos(); const r: string[] = [];
  for (let i = 0; i < 12; i++) r.push(...p({ y: 0, speed: 1.5, grounded: true }, DT));
  for (let i = 0; i < 10; i++) p({ y: 0, speed: 0, grounded: true }, DT);
  const tras: string[] = []; for (let i = 0; i < 12; i++) tras.push(...p({ y: 0, speed: 1.5, grounded: true }, DT));
  assert.equal(tras[0], "derecho");
});

test("al arrancar, el primer pie apoya a medio paso (≈ 0,25 s caminando), no al instante", () => {
  const p = crearPasos(); let t = 0;
  while (!p({ y: 0, speed: 1.5, grounded: true }, DT).length) t += DT;
  assert.ok(t >= 0.15 && t <= 0.35, `${t} s`);
});

test("el salto suena al despegar y el aterrizaje al caer tras un rato en el aire", () => {
  const p = crearPasos();
  p({ y: 0, speed: 0, grounded: true }, DT);
  assert.deepEqual(p({ y: 0.3, speed: 0, grounded: false }, DT), ["salto"]);
  let t = DT;
  while (t < AIRE_MIN_S + DT) { assert.deepEqual(p({ y: 1, speed: 0, grounded: false }, DT), []); t += DT; }
  assert.deepEqual(p({ y: 0, speed: 0, grounded: true }, DT), ["aterrizaje"]);
});

test("bajar un escalón (poco aire) no es un golpe y caerse de un borde no es un salto", () => {
  const p = crearPasos();
  p({ y: 1, speed: 4, grounded: true }, DT);
  assert.deepEqual(p({ y: 0.9, speed: 4, grounded: false }, DT), []); // cae, no sube: sin «salto»
  assert.ok(!p({ y: 0.6, speed: 4, grounded: true }, DT).includes("aterrizaje"));
});

// ———————————————————————————— S6f · el reparto de autoridad en la página ————————————————————————————
// Lo LOCAL (mis pasos, mi salto, mi aterrizaje) lo dispara la página. Lo COMPARTIDO (puerta, dados, dardos,
// pez cobrado, teleport) lo manda el SERVIDOR con su semilla (D-048): la página se niega a tocarlo, porque si cada
// una lo disparara por su cuenta, dos personas al lado oirían cosas distintas.

/** Una puerta de mentira que apunta qué le piden, para ver quién dispara qué sin montar Web Audio. */
function puertaFalsa() {
  const pedidos: { id: string; o: Record<string, unknown> }[] = [];
  return {
    pedidos,
    ids: () => pedidos.map((p) => p.id),
    sonar(id: string, o: Record<string, unknown> = {}) { pedidos.push({ id, o }); return true; },
    paso(m?: string) { pedidos.push({ id: `pasos-${m ?? "piedra"}`, o: {} }); return true; },
    fuenteDe: () => "fichero" as const,
    ambiente: () => false,
    parar() {}, olvidar() {},
    estado: () => ({ ficheros: 0, recetas: 0, fallados: 0, guardados: 0, memoria: 0, colchon: null, sintetizado: [], avisos: [] }),
  };
}

/** Una página de mentira: la sesión, las cerraduras y la pesca, cada una con su aviso a mano. */
function paginaFalsa(suelo?: () => string | null) {
  let cerr: ((q: string) => void) | null = null, pes: ((q: string) => void) | null = null;
  let fase = "nada";
  return {
    p: {
      session: { entity: 1, selfPosition: () => ({ y: 0, speed: 0, grounded: true }) },
      cerraduras: { alCambiar: (fn: (q: string) => void) => { cerr = fn; return null; } },
      pesca: { estado: () => ({ fase }), alCambiar: (fn: (q: string) => void) => { pes = fn; return null; } },
      suelo,
    },
    abrirCerradura: () => cerr?.("abierta"),
    lanzarCaña: () => { fase = "espera"; pes?.("estado"); },
  };
}

test("S6f: la página NO dispara lo compartido: eso lo manda el servidor con su semilla (D-048)", async () => {
  const { montarSonidos, COMPARTIDOS } = await import("../apps/plaza/sonidos.ts");
  const q = puertaFalsa();
  const f = paginaFalsa();
  const m = montarSonidos(f.p as never, q as never);
  const avisos: string[] = [];
  const antes = console.warn;
  console.warn = (x: string) => { avisos.push(String(x)); };
  try {
    for (const id of COMPARTIDOS) assert.equal(m.sonarLocal(id), false, `«${id}» lo manda el servidor: la página no lo toca`);
    // y se dice UNA vez por id, no en cada intento
    for (const id of COMPARTIDOS) m.sonarLocal(id);
  } finally { console.warn = antes; }
  assert.deepEqual(q.ids(), [], "no llegó ni un disparo compartido a la puerta");
  assert.equal(avisos.length, COMPARTIDOS.length, `${avisos.length} avisos para ${COMPARTIDOS.length} ids: debería ser uno por id`);
  assert.ok(avisos.every((a) => /lo manda el servidor/.test(a)));
  // la lista es exactamente la del reparto acordado
  assert.deepEqual([...COMPARTIDOS].sort(), ["dados", "dardo-impacto", "dardo-lanzar", "pesca-cobrar", "puerta", "teleport"]);
  m.desmontar();
});

test("S6f: lo LOCAL sí lo dispara la página, y todo por la puerta única", async () => {
  const { montarSonidos } = await import("../apps/plaza/sonidos.ts");
  const q = puertaFalsa();
  const f = paginaFalsa();
  const m = montarSonidos(f.p as never, q as never);
  assert.equal(m.sonarLocal("ui-abrir"), true);
  assert.equal(m.paso(), true);
  assert.equal(m.paso("madera"), true);
  // la cerradura y el lanzamiento de la caña siguen siendo locales (al primero le falta el sitio en el evento del
  // servidor; el segundo es mi mano y solo lo oigo yo)
  f.abrirCerradura();
  f.lanzarCaña();
  assert.deepEqual(q.ids(), ["ui-abrir", "pasos-piedra", "pasos-madera", "cerradura", "pesca-lanzar"]);
  assert.ok(q.pedidos.every((p) => typeof p.o === "object"), "todo pasó por la puerta, con sus opciones");
  m.desmontar();
});

test("S6f: el material de los pasos sale del suelo de la zona si el mundo lo dice; piedra si no", async () => {
  const { montarSonidos } = await import("../apps/plaza/sonidos.ts");
  let tipo: string | null = "hierba";
  const q = puertaFalsa();
  const m = montarSonidos(paginaFalsa(() => tipo).p as never, q as never);
  m.paso();
  tipo = "roca"; m.paso();
  tipo = null; m.paso();
  // el tercero es el mismo id que el segundo en el mismo instante: el freno de 120 ms de la página lo corta (por eso
  // solo hay dos). Lo que importa aquí es que el id sale del material, no cuántos pasaron.
  assert.deepEqual(q.ids(), ["pasos-hierba", "pasos-piedra"]);
  m.desmontar();

  // sin `suelo` en la página (un mundo que no lo dice), piedra siempre
  const q2 = puertaFalsa();
  const m2 = montarSonidos(paginaFalsa().p as never, q2 as never);
  m2.paso();
  assert.deepEqual(q2.ids(), ["pasos-piedra"]);
  m2.desmontar();
});

test("sonar.ts: las piezas de VR suenan por la puerta única de la página, y lo compartido no pasa", async () => {
  const { montarSonidos } = await import("../apps/plaza/sonidos.ts");
  const { sonar, puente } = await import("../apps/plaza/sonar.ts");
  assert.equal(sonar("coger-soltar"), false, "sin montar: silencio, no error");
  const q = puertaFalsa();
  const m = montarSonidos(paginaFalsa().p as never, q as never);
  const antes = console.warn;
  console.warn = () => {};
  try {
    assert.equal(sonar("coger-soltar", { gain: 0.5 }), true, "mi mano coge un dardo: local");
    assert.equal(sonar("dardo-lanzar"), false, "el dardo lanzado lo manda el servidor (D-048): VR no lo duplica");
  } finally { console.warn = antes; }
  assert.deepEqual(q.ids(), ["coger-soltar"]);
  m.desmontar();
  assert.equal(puente.sonar, null, "al desmontar se suelta el puente");
  assert.equal(sonar("coger-soltar"), false);
});

test("Galatea: each ground steps on its own sound — grass is grass, sand and earth are sand, snow is snow, the rest stone", async () => {
  const { materialDeSuelo, PASO_DE, MATERIALES } = await import("../packages/render/src/audio/sonar.ts");
  const de = (t: string | null) => PASO_DE[materialDeSuelo(t)];
  assert.deepEqual(["hierba", "arena", "tierra", "nieve", "roca", "liso", "madera", null].map(de),
    ["pasos-hierba", "pasos-arena", "pasos-arena", "pasos-nieve", "pasos-piedra", "pasos-piedra", "pasos-madera", "pasos-piedra"]);
  const cat = JSON.parse(readFileSync(new URL("../features/sonido/catalogo.json", import.meta.url), "utf8")) as { sonidos: { id: string; variantes: { autor?: string; origen?: string; licencia?: string }[] }[] };
  for (const m of MATERIALES) assert.ok(cat.sonidos.some((s) => s.id === PASO_DE[m]), `${PASO_DE[m]} has files`);
  const hierba = JSON.stringify(cat.sonidos.find((s) => s.id === "pasos-hierba"));
  assert.match(hierba, /kenney/i, "grass steps are Kenney's footstep_grass, no longer Fantozzi's sand takes");
  assert.doesNotMatch(hierba, /Fantozzi/);
});
