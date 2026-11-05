// mundo-hermes · historia 3: the `espejo` piece, server part. The outside source is played by the test through the seam (`enlace`):
// alta / cambio / baja / lote. A thing is placed with `at` and a card; a function switched OFF rejects; a world without espejo.json is
// byte-identical to one without the piece. Real Instance + real ClientSession, like test/burbujas.test.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { crearRoles } from "../packages/server/src/roles-mundo.ts";
import { REFERENCE, referenceRecording, replayFingerprint, setBody, stateHash } from "../packages/sim/src/index.ts";
import { fx } from "../packages/core/src/index.ts";
import { conMundo } from "../features/mundo.ts";
import funciones from "../features/servidor.ts";
import { conEspejo, claveDe } from "../features/espejo/server.ts";
import type { EnlaceEspejo } from "../features/espejo/server.ts";
import { espejo as decl, ALCANCE_M } from "../features/espejo/feature.ts";
import { ESQUEMA } from "../features/espejo/esquema.ts";

const sign = signer("una-clave-de-prueba-larga");
const ADMIN = "codigo-de-administracion-largo";
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
const ESPEJO = { schema: ESQUEMA, funciones: { cron: true, sesiones: true }, zonas: [
  { id: "z7", nombre: "El reloj", centro: { x: 40, z: -10 }, ancho: 16, fondo: 16, alto: 6, tipos: ["cron"] },
  { id: "z3", nombre: "El archivo", centro: { x: 0, z: 0 }, ancho: 28, fondo: 24, alto: 6, tipos: ["sesion"] },
] };
const cron = (id: string, extra: Record<string, unknown> = {}) => ({ tipo: "cron", id, titulo: `Tarea ${id}`, estado: "programado", zona: "z7", acciones: ["cron.pausar"], ...extra });

function mundo(n: number, o: { espejo?: unknown } = {}) {
  const archivos = new Map<string, unknown>(o.espejo === undefined ? [] : [["espejo.json", o.espejo]]);
  const log: string[] = [];
  const roles = crearRoles({ construir: false, admin: ADMIN, firmar: sign, cerrar: (e) => inst.disconnect(e), ahora: () => Date.parse("2026-11-05T10:00:00Z"), log: (l) => log.push(l) });
  const lista = conMundo([...funciones, roles.part], (f) => archivos.get(f), (l) => log.push(l));
  const inst: Instance = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign, puede: (w, a) => roles.puede(w, a) });
  const gente = Array.from({ length: n }, (_, i) => {
    const t = inst.join(i), s = new ClientSession(t, { features: [], identity: keeper() });
    const dicho: { event: string; msg: Record<string, unknown> }[] = [];
    s.features.tap((f, e, m) => { if (f === "espejo") dicho.push({ event: e, msg: m as Record<string, unknown> }); });
    return { t, s, dicho };
  });
  const pump = (k = 3) => { for (let i = 0; i < k; i++) { for (const p of gente) p.t.flush(); inst.tick(); for (const p of gente) p.t.flush(); } };
  const poner = (p: { s: ClientSession }, x: number, z: number) => setBody(inst.sim, p.s.entity, { x: fx(x), y: 0, z: fx(z), vy: 0, air: 0, buf: 0 });
  const parte = lista.find(conEspejo);
  pump(2);
  return { inst, gente, pump, poner, log, enlace: parte?.enlace as EnlaceEspejo, lista };
}

test("espejo: the declaration meets the plug's rules and is in the server list", () => {
  assert.deepEqual(decl.issues, []);
  assert.ok(funciones.some((f) => f.feature.id === "espejo"));
});

test("espejo: a world WITHOUT espejo.json is inert — nothing placed, the seam refuses with a reason, the shared state is the same as with no piece at all", () => {
  const W = mundo(1);
  assert.equal(W.enlace.config(), null); assert.deepEqual(W.enlace.funciones(), []);
  const r = W.enlace.alta(cron("a")); assert.equal(r.ok, false); assert.match(r.ok ? "" : r.motivo, /no tiene el espejo encendido/);
  W.pump(4);
  assert.equal(W.gente[0].s.features.stateOf("espejo").size, 0);
  assert.equal(W.gente[0].s.features.cards().filter((c) => c.feature === "espejo").length, 0);
  assert.equal(W.gente[0].dicho.length, 0, "no events");
  // byte-identical to the same world built WITHOUT the piece in the list (the sim fingerprint ignores features; the state/cards must not move either)
  const sin = (() => {
    const log: string[] = [];
    const lista = conMundo(funciones.filter((f) => f.feature.id !== "espejo"), () => undefined, (l) => log.push(l));
    const inst = new Instance({ seed: 1, capacity: 16, k: 50, snapshotEvery: 2, features: lista, log: (l) => log.push(l), identitySign: sign });
    const t = inst.join(0), s = new ClientSession(t, { features: [], identity: keeper() });
    for (let i = 0; i < 6; i++) { t.flush(); inst.tick(); t.flush(); }
    return { s, inst };
  })();
  const huella = (s: ClientSession) => JSON.stringify([...(s.features.catalog?.features ?? [])].filter((f) => f.id !== "espejo" && f.id !== "roles").map((f) => [f.id, f.version, [...s.features.stateOf(f.id)]]));
  assert.equal(huella(W.gente[0].s), huella(sin.s), "the rest of the world's shared state is the same");
  assert.equal(W.inst.sim.tick, sin.inst.sim.tick);
  assert.equal(stateHash(W.inst.sim), stateHash(sin.inst.sim), "the live simulation state hashes the same with and without the piece");
  assert.equal(replayFingerprint(referenceRecording(REFERENCE.seed, REFERENCE.ticks, REFERENCE.n)), 0x7e630965, "the pinned reference fingerprint is untouched");
});

test("espejo: a broken espejo.json is not used at all and every issue is logged with its path", () => {
  const W = mundo(1, { espejo: { schema: ESQUEMA, funciones: { zzz: true }, zonas: "no" } });
  assert.equal(W.enlace.config(), null);
  assert.ok(W.log.some((l) => /espejo\.json no se usa/.test(l) && /espejo\.funciones\.zzz/.test(l) && /espejo\.zonas/.test(l)), W.log.join("\n"));
  assert.equal(W.enlace.alta(cron("a")).ok, false);
});

test("espejo: alta puts a thing in the world WITH `at` and a card (role, name, place) that a screen reader and an agent read; the person near hears it", () => {
  const W = mundo(2, { espejo: ESPEJO });
  assert.deepEqual(W.enlace.funciones(), ["cron", "sesiones"]);
  W.poner(W.gente[0], 40, -10); W.poner(W.gente[1], -300, 300); // one at the clock, one far away
  W.pump(4); W.gente[0].dicho.length = 0; W.gente[1].dicho.length = 0;
  const r = W.enlace.alta(cron("8bc0", { subtitulo: "próxima: 09:00" }));
  assert.deepEqual(r, { ok: true, puestas: 1 });
  W.pump(4);
  const [a, b] = W.gente;
  assert.deepEqual(a.s.features.stateOf("espejo").get(claveDe("cron", "8bc0")), { titulo: "Tarea 8bc0", subtitulo: "próxima: 09:00", estado: "programado", zona: "z7", x: 40, z: -10, luz: false, acciones: "cron.pausar", url: "", grupo: "", descripcion: "", tablero: "" });
  const c = a.s.features.cards().find((x) => x.feature === "espejo");
  assert.ok(c, "the card exists"); assert.deepEqual([c.role, c.name, c.at], ["objeto", "Tarea 8bc0", { x: 40, z: -10 }]);
  assert.deepEqual(a.s.features.reachable(40, -10).map((x) => [x.feature, x.intent]), [["espejo", "usar"]], "usable from near");
  assert.equal(b.s.features.stateOf("espejo").size, 0, "far away: not told (interest by place)");
  assert.match(String(a.dicho.find((d) => d.event === "cambiado")?.msg.texto), /Nuevo: Tarea «Tarea 8bc0»: programado/);
  assert.equal(b.dicho.some((d) => d.event === "cambiado"), false);
});

test("espejo: cambio updates in place and speaks only a real change; baja removes; unknown ones say why", () => {
  const W = mundo(1, { espejo: ESPEJO });
  W.poner(W.gente[0], 40, -10); W.pump(3);
  W.enlace.alta(cron("a")); W.pump(3);
  const a = W.gente[0]; a.dicho.length = 0;
  assert.deepEqual(W.enlace.cambio(cron("a", { estado: "pausado" })), { ok: true, puestas: 1 }); W.pump(3);
  assert.equal(a.s.features.stateOf("espejo").get("cron/a")?.estado, "pausado");
  assert.match(String(a.dicho.at(-1)?.msg.texto), /Tarea «Tarea a»: en pausa/);
  const n = a.dicho.length;
  W.enlace.cambio(cron("a", { estado: "pausado", subtitulo: "otro texto" })); W.pump(3);
  assert.equal(a.dicho.length, n, "same title and state: no spoken change");
  const mal = W.enlace.cambio(cron("zzz")); assert.equal(mal.ok, false); assert.match(mal.ok ? "" : mal.motivo, /no hay ninguna cosa «cron\/zzz»/);
  assert.deepEqual(W.enlace.baja({ tipo: "cron", id: "a" }), { ok: true, quitadas: 1 }); W.pump(3);
  assert.equal(a.s.features.stateOf("espejo").size, 0);
  assert.equal(W.enlace.baja({ tipo: "cron", id: "a" }).ok, false);
});

test("espejo: a lote with a thing for a zone the world does not have keeps the valid ones and reports the dropped ones; schema and size errors still reject it whole", () => {
  const W = mundo(1, { espejo: ESPEJO });
  W.poner(W.gente[0], 40, -10); W.pump(3);
  W.enlace.alta(cron("viejo"));
  const r = W.enlace.lote([cron("a"), cron("q", { zona: "no-existe" }), { tipo: "sesion", id: "s9", titulo: "Charla", zona: "z7", acciones: [] }, cron("b")]);
  assert.equal(r.ok, true); if (!r.ok) return;
  assert.deepEqual([r.puestas, r.quitadas], [2, 1], "the two valid crons are in, the old one left, as for any lote");
  assert.deepEqual(r.descartadas?.map((d) => [d.tipo, d.id]), [["cron", "q"], ["sesion", "s9"]]);
  assert.match(r.descartadas![0].motivo, /no hay ninguna zona «no-existe» \(hay: /);
  assert.match(r.descartadas![1].motivo, /la zona «z7» no admite el tipo «sesion»/);
  W.pump(3);
  assert.deepEqual([...W.gente[0].s.features.stateOf("espejo").keys()].sort(), ["cron/a", "cron/b"]);
  // a clean lote reports nothing dropped
  assert.equal("descartadas" in (W.enlace.lote([cron("a")]) as object), false);
  // an object with NO zone (or a zone that is not text) is a schema error: the whole lote is refused and the world keeps what it had
  W.pump(3); const antes = JSON.stringify([...W.gente[0].s.features.stateOf("espejo")]);
  for (const mala of [{ tipo: "cron", id: "z", titulo: "Sin zona", estado: "programado", acciones: [] }, cron("z", { zona: 7 as unknown as string })]) {
    const x = W.enlace.lote([cron("a"), mala]); assert.equal(x.ok, false);
  }
  // a dropped thing does not hide a real error beside it
  assert.equal(W.enlace.lote([cron("q", { zona: "no-existe" }), cron("p"), cron("p")]).ok, false);
  W.pump(3); assert.equal(JSON.stringify([...W.gente[0].s.features.stateOf("espejo")]), antes);
});

test("espejo: lote replaces EVERYTHING (adds, changes, removes), is all-or-nothing on a bad one, and caps its size", () => {
  const W = mundo(1, { espejo: ESPEJO });
  W.poner(W.gente[0], 40, -10); W.pump(3);
  W.enlace.alta(cron("viejo")); W.enlace.alta(cron("sigue"));
  const r = W.enlace.lote([cron("sigue", { estado: "pausado" }), cron("nuevo"), { tipo: "sesion", id: "s1", titulo: "Charla", zona: "z3", acciones: ["sesion.nueva"] }]);
  assert.deepEqual(r, { ok: true, puestas: 3, quitadas: 1 }); W.pump(3);
  const st = W.gente[0].s.features.stateOf("espejo");
  assert.deepEqual([...st.keys()].sort(), ["cron/nuevo", "cron/sigue", "sesion/s1"]);
  assert.equal(st.get("cron/sigue")?.estado, "pausado");
  assert.equal(W.enlace.alta(cron("x")).ok, true); W.pump(3);
  // a bad thing in the batch: nothing changes
  const antes = JSON.stringify([...W.gente[0].s.features.stateOf("espejo")]);
  const bad = W.enlace.lote([cron("p"), cron("q", { titulo: "" }), cron("p")]);
  assert.equal(bad.ok, false); assert.match(bad.ok ? "" : bad.motivo, /lote\[1\]/); assert.ok(!bad.ok && bad.problemas!.some((p) => /repetida/.test(p.message)));
  W.pump(3); assert.equal(JSON.stringify([...W.gente[0].s.features.stateOf("espejo")]), antes, "a bad batch changes nothing");
  assert.equal(W.enlace.lote(Array.from({ length: 201 }, (_, i) => cron(`c${i}`))).ok, false);
  assert.equal(W.enlace.lote("no" as unknown as unknown[]).ok, false);
  assert.deepEqual(W.enlace.lote([]), { ok: true, puestas: 0, quitadas: 4 }); // the source says «nothing exists»: the world empties
});

test("espejo: a function switched OFF rejects its things — nothing is placed — while the ones that are on still go in", () => {
  const W = mundo(1, { espejo: { ...ESPEJO, funciones: { cron: true, sesiones: false } } });
  assert.deepEqual(W.enlace.funciones(), ["cron"], "hola.funciones will say only cron");
  const r = W.enlace.alta({ tipo: "sesion", id: "s1", titulo: "Charla", zona: "z3" });
  assert.equal(r.ok, false); assert.match(r.ok ? "" : r.motivo, /función de «sesion» está apagada/);
  const l = W.enlace.lote([cron("a"), { tipo: "sesion", id: "s1", titulo: "Charla", zona: "z3" }]);
  assert.equal(l.ok, false, "a batch carrying an off thing is refused whole");
  assert.equal(W.enlace.alta(cron("a")).ok, true);
  W.poner(W.gente[0], 40, -10); W.pump(4);
  assert.deepEqual([...W.gente[0].s.features.stateOf("espejo").keys()], ["cron/a"]);
});

test("espejo: activa:false keeps the file but the whole piece is off (nothing is accepted)", () => {
  const W = mundo(1, { espejo: { ...ESPEJO, activa: false } });
  assert.equal(W.enlace.config(), null); assert.equal(W.enlace.alta(cron("a")).ok, false);
});

test("espejo: texts from outside are cleaned before they enter the world (control characters, markup stays text, too-long title is refused not cut)", () => {
  const W = mundo(1, { espejo: ESPEJO });
  W.poner(W.gente[0], 40, -10); W.pump(3);
  assert.equal(W.enlace.alta(cron("a", { titulo: "Hola\u0000\n<img src=x onerror=alert(1)>", subtitulo: "a\u2028b" })).ok, true); W.pump(3);
  const v = W.gente[0].s.features.stateOf("espejo").get("cron/a")!;
  assert.equal(String(v.titulo).includes("\u0000") || String(v.titulo).includes("\n"), false);
  assert.equal(v.subtitulo, "a b");
  assert.equal(W.enlace.alta(cron("b", { titulo: "t".repeat(61) })).ok, false);
  assert.ok(ALCANCE_M > 0);
});
