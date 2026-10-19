// S6s: la máquina de pasos (pura): cuándo suena un paso, un salto y un aterrizaje.
import test from "node:test";
import assert from "node:assert/strict";
import { crearPasos, ZANCADA, AIRE_MIN_S } from "../apps/plaza/sonidos.ts";

const DT = 0.05;
test("quieto no suena", () => {
  const p = crearPasos();
  for (let i = 0; i < 40; i++) assert.deepEqual(p({ y: 0, speed: 0, grounded: true }, DT), []);
});

test("caminando a 4 m/s suena un paso cada zancada (≈ 2,9 por segundo)", () => {
  const p = crearPasos(); let n = 0;
  for (let i = 0; i < 20; i++) n += p({ y: 0, speed: 4, grounded: true }, DT).length; // 1 s
  assert.ok(n === 2 || n === 3, `${n} pasos en 1 s a 4 m/s (zancada ${ZANCADA.camina} m)`);
});

test("corriendo la zancada es mayor pero el ritmo es mayor", () => {
  const p = crearPasos(); let n = 0;
  for (let i = 0; i < 20; i++) n += p({ y: 0, speed: 8, grounded: true }, DT).length;
  assert.ok(n >= 4 && n <= 5, `${n}`);
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
// Lo LOCAL (botones, mis pasos, mi salto, mi aterrizaje) lo dispara la página. Lo COMPARTIDO (puerta, dados, dardos,
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
