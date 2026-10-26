// J18b story 4, first slice (MIS-222 t_1b395abe): the brush as numbers (apps/plaza/pincel.ts) and painting from code (pintar.ts).
// What the hand will feed is checked here with the SAME checker the server runs on an upload (comprobarTrazo), and the tube generator
// of story 2 (tuboDe) must be able to draw what comes out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { comprobarTrazo, TRAZO, sha256Hex } from "../packages/net/src/ficheros.ts";
import { tuboDe } from "../packages/render/src/trazo-tubo.ts";
import { crearPincel, GROSORES_M, GIRO_MIN_GRADOS, PASO_MIN_M } from "../apps/plaza/pincel.ts";
import { montarPintar } from "../apps/plaza/pintar.ts";

const leer = (fichero: string) => { const r = comprobarTrazo(new TextEncoder().encode(fichero)); assert.ok(r.ok, r.ok ? "" : JSON.stringify(r.issues)); return r.value; };

test("pincel: a hand at 90 frames/s keeps one control point every 1.5 cm, not one per frame", () => {
  const p = crearPincel({ color: 2, grosor: GROSORES_M[1] });
  let nuevos = 0;
  for (let i = 0; i <= 900; i++) { const r = p.mover({ x: 3 + i * 0.001, y: 1.2, z: -4 }); if (r === "añadido" || r === "primero") nuevos++; } // 0.9 m at 1 mm per frame
  assert.ok(p.puntos >= 59 && p.puntos <= 62, `0.9 m / 1.5 cm ≈ 60 points, got ${p.puntos}`);
  assert.equal(nuevos, p.puntos);
  const h = p.terminar()!;
  assert.ok(h.bytes < 4000, `${h.bytes} bytes for a 90 cm line`);
});

test("pincel: a turn of more than 10° keeps a point even after a short move; a straight creep does not", () => {
  const recto = crearPincel({ color: 0, grosor: 0.015 });
  recto.mover({ x: 0, y: 0, z: 0 }); recto.mover({ x: 0.02, y: 0, z: 0 });
  assert.equal(recto.mover({ x: 0.0235, y: 0, z: 0 }), "igual", "3.5 mm straight on: not a point");
  const giro = crearPincel({ color: 0, grosor: 0.015 });
  giro.mover({ x: 0, y: 0, z: 0 }); giro.mover({ x: 0.02, y: 0, z: 0 });
  const rad = ((GIRO_MIN_GRADOS + 5) * Math.PI) / 180;
  assert.equal(giro.mover({ x: 0.02 + 0.004 * Math.cos(rad), y: 0.004 * Math.sin(rad), z: 0 }), "añadido", "4 mm at 15°: a corner is kept");
  assert.equal(giro.mover({ x: 0.0244, y: 0.0015, z: 0 }), "igual", "under 3 mm never counts");
  assert.ok(PASO_MIN_M === 0.015);
});

test("pincel: the file is a valid trazo@1 (the server's own checker), relative to its centre, in mm, and the tube generator draws it", () => {
  const p = crearPincel({ color: 5, grosor: 0.04 });
  for (let i = 0; i < 80; i++) p.mover({ x: 10 + Math.cos(i / 8) * 0.3, y: 1.5 + i * 0.004, z: -20 + Math.sin(i / 8) * 0.3, presion: i / 79 });
  const h = p.terminar()!;
  const t = leer(h.fichero);
  assert.equal(t.color, 5); assert.equal(t.grosor, 0.04); assert.equal(t.pincel, "tubo");
  assert.ok(Math.abs(h.centro.x - 10) < 0.31 && Math.abs(h.centro.z + 20) < 0.31, "the centre is in the world where it was painted");
  assert.ok(t.puntos.every((q) => Math.abs(q[0]) <= 0.31 && Math.abs(q[1]) <= 0.2), "points are relative to the centre");
  assert.ok(t.puntos[0]![3] === 0 && t.puntos.at(-1)![3] === 1, "pressure travels with the points");
  const tubo = tuboDe(t, {});
  assert.ok(tubo.triangulos > 0 && tubo.triangulos <= 9600);
  // a world position put back = centre + relative point, to the mm
  assert.ok(Math.abs(h.centro.x + t.puntos[0]![0] - (10 + Math.cos(0) * 0.3)) < 0.002);
});

test("pincel: 600 points is full; a one-point scribble, a NaN tip and a bad palette are refused", () => {
  const p = crearPincel({ color: 1, grosor: 0.003 });
  let r = "";
  for (let i = 0; i < 700 && r !== "lleno"; i++) r = p.mover({ x: i * 0.02, y: 0, z: 0 });
  assert.equal(r, "lleno"); assert.equal(p.puntos, TRAZO.puntosMax); assert.ok(p.lleno);
  assert.equal(p.mover({ x: 99, y: 0, z: 0 }), "lleno", "nothing more is added");
  const h = p.terminar()!; assert.equal(h.puntos, TRAZO.puntosMax); assert.ok(h.bytes <= TRAZO.bytesMax, `${h.bytes} bytes`); leer(h.fichero);
  const uno = crearPincel({ color: 1, grosor: 0.01 }); uno.mover({ x: 1, y: 1, z: 1 }); assert.equal(uno.terminar(), null, "a tap is not a line");
  const nan = crearPincel({ color: 1, grosor: 0.01 }); assert.equal(nan.mover({ x: NaN, y: 0, z: 0 }), "igual"); assert.equal(nan.puntos, 0);
  assert.throws(() => crearPincel({ color: 8, grosor: 0.01 })); assert.throws(() => crearPincel({ color: 0, grosor: NaN }));
  assert.equal(crearPincel({ color: 0, grosor: 1 }).opciones.grosor, TRAZO.grosorMax, "thickness is clamped to the server's cap");
  const lejos = crearPincel({ color: 0, grosor: 0.01 }); lejos.mover({ x: 0, y: 0, z: 0 }); lejos.mover({ x: 250, y: 0, z: 0 });
  assert.equal(lejos.terminar(), null, "a line wider than the server reaches (100 m from its centre) is refused, not cut");
  const c = crearPincel({ color: 0, grosor: 0.01 }); c.mover({ x: 0, y: 0, z: 0 }); c.cancelar(); assert.equal(c.puntos, 0);
});

test("pintar: empezar → punto → soltar uploads the file once (HEAD first), places it as a «trazo» at its centre, and says why when the server refuses", async () => {
  const llamadas: string[] = [], enviados: { feature: string; intent: string; msg: Record<string, unknown> }[] = [], subidos = new Map<string, string>();
  const log: { feature: string; event: string; msg: Record<string, unknown> }[] = [];
  const stats = { events: 0 };
  let rechazar = "";
  const session = { features: {
    log, stats,
    send(feature: string, intent: string, msg: Record<string, unknown>) {
      enviados.push({ feature, intent, msg });
      setTimeout(() => { stats.events++; log.push(rechazar ? { feature: "objetos", event: "rechazado", msg: { motivo: rechazar } } : { feature: "objetos", event: "hecho", msg: { accion: "colocar", id: 7 } }); }, 5);
      return { ok: true as const };
    },
  } };
  const falso = (async (url: string, init?: RequestInit) => {
    llamadas.push(`${init?.method} ${String(url).replace(/[0-9a-f]{64}/, "<sha>")}`);
    if (init?.method === "HEAD") return new Response(null, { status: subidos.has(String(url)) ? 200 : 404 });
    subidos.set(String(url), new TextDecoder().decode(init!.body as Uint8Array));
    assert.equal((init!.headers as Record<string, string>).authorization, "Bearer BILLETE");
    return new Response("{}", { status: 201 });
  }) as unknown as typeof fetch;
  let puede = true;
  const pintar = montarPintar({ session, puede: () => puede, origen: "http://mundo", billete: () => "BILLETE", fetch: falso });
  const linea = () => { assert.deepEqual(pintar.empezar({ color: 3, grosor: 0.015 }), { ok: true }); for (let i = 0; i < 40; i++) pintar.punto({ x: 2 + i * 0.01, y: 1.4, z: -3, presion: 0.5 }); };

  assert.equal(pintar.punto({ x: 0, y: 0, z: 0 }).ok, false, "no stroke started");
  linea(); assert.equal(pintar.estado().pintando, true); assert.ok(pintar.estado().puntos >= 19);
  assert.deepEqual(await pintar.soltar(), { ok: true });
  assert.deepEqual(llamadas, ["HEAD http://mundo/a/<sha>.trazo", "PUT http://mundo/a/<sha>.trazo"]);
  const [nombre, texto] = [...subidos.entries()][0]!;
  assert.equal(nombre.split("/a/")[1], `${sha256Hex(new TextEncoder().encode(texto))}.trazo`, "named by its own sha256");
  leer(texto);
  const colocar = enviados[0]!;
  assert.deepEqual([colocar.feature, colocar.intent], ["objetos", "colocar"]);
  assert.equal(colocar.msg.tipo, "trazo"); assert.equal(colocar.msg.ext, "trazo"); assert.equal(colocar.msg.decorado, true); assert.equal(colocar.msg.nombre, "");
  assert.ok(Math.abs((colocar.msg.x as number) - 2.195) < 0.02 && colocar.msg.y === 1.4 && colocar.msg.z === -3, "placed at the middle of the line");
  assert.equal(pintar.estado().trazos, 1); assert.equal(pintar.estado().pintando, false);

  // the same stroke again: already on the server, no second upload
  llamadas.length = 0; linea(); assert.deepEqual(await pintar.soltar(), { ok: true });
  assert.deepEqual(llamadas, ["HEAD http://mundo/a/<sha>.trazo"]);

  // a server that says no: the reason comes back
  rechazar = "El mundo ya tiene todos los trazos que caben: borra alguno."; linea();
  const r = await pintar.soltar(); assert.equal(r.ok, false); assert.match((r as { why: string }).why, /todos los trazos que caben/);
  assert.equal(pintar.estado().rechazados, 1);

  // no permission: nothing starts; cancel drops the stroke
  puede = false; assert.equal(pintar.empezar({ color: 0, grosor: 0.01 }).ok, false); puede = true;
  pintar.empezar({ color: 0, grosor: 0.01 }); pintar.punto({ x: 0, y: 0, z: 0 }); pintar.cancelar(); assert.equal(pintar.estado().pintando, false);
  assert.equal((await pintar.soltar()).ok, false);
});

test("pintar: a stroke that fills up is sent and another starts where it ended", async () => {
  const enviados: Record<string, unknown>[] = [], log: { feature: string; event: string; msg: Record<string, unknown> }[] = [], stats = { events: 0 };
  const session = { features: { log, stats, send(_f: string, _i: string, msg: Record<string, unknown>) { enviados.push(msg); setTimeout(() => { stats.events++; log.push({ feature: "objetos", event: "hecho", msg: { accion: "colocar", id: enviados.length } }); }, 1); return { ok: true as const }; } } };
  const falso = (async (_u: string, init?: RequestInit) => new Response(null, { status: init?.method === "HEAD" ? 404 : 201 })) as unknown as typeof fetch;
  const pintar = montarPintar({ session, puede: () => true, origen: "http://m", billete: () => "B", fetch: falso });
  pintar.empezar({ color: 0, grosor: 0.01 });
  for (let i = 0; i < 1300; i++) pintar.punto({ x: i * 0.02, y: 1, z: 0 });
  assert.deepEqual(await pintar.soltar(), { ok: true });
  assert.ok(enviados.length >= 2, `${enviados.length} strokes for 1300 points`);
});
