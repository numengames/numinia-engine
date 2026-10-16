// Message size budget (docs/FICHA-TECNICA.md «Presupuesto de tamaño de mensajes»): every message the page sends is checked
// against the one WebSocket frame limit (PASE_MAX), and the biggest real sizes are measured here and printed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PASE_MAX, WS_FRAME_MAX, REPORT_MAX, VOZ_TRAMA_MAX, encodeInput, encodePing, encodeIdentityRequest, encodeIdentity,
  encodeWelcome, encodeSnapshot, codificarVozSubida,
} from "../packages/net/src/index.ts";
import { buildCatalog, encodeCatalog } from "../packages/feature/src/index.ts";
import { fieldBits } from "../packages/schema/src/index.ts";
import { createSim, spawnAvatar } from "../packages/sim/src/index.ts";
import funciones from "../features/servidor.ts";
import { emitir, nuevoId } from "../packages/instance/src/identidad.ts";
import { signer } from "../packages/server/src/secret.ts";

const bytesDeCampos = (fields: Record<string, any>): number => Math.ceil((8 + 16 + Object.values(fields).reduce((n: number, f) => n + fieldBits(f), 0)) / 8);

test("tamaños: every page -> server message fits the frame it is allowed, and the WebSocket's maxPayload is the biggest of them", () => {
  const { catalog } = buildCatalog(funciones.map((p) => p.feature));
  const intents = catalog.features.flatMap((f) => f.intents).map((i) => ({ nombre: `${i.feature}.${i.name}`, bytes: bytesDeCampos(i.fields) })).sort((a, b) => b.bytes - a.bytes);
  const eventos = catalog.features.flatMap((f) => f.events).map((i) => ({ nombre: `${i.feature}.${i.name}`, bytes: bytesDeCampos(i.fields) })).sort((a, b) => b.bytes - a.bytes);
  const estados = catalog.features.filter((f) => f.state).map((f) => ({ nombre: f.id, bytes: Math.ceil((8 + 16 + 8 + 8 + 8 * 64 + 0 + Object.values(f.state!.fields).reduce((n, x) => n + fieldBits(x as any), 0)) / 8) })).sort((a, b) => b.bytes - a.bytes);
  const catalogo = encodeCatalog(catalog).length;

  const limites: [string, number][] = [
    ["INPUT", encodeInput(65535, 127, -127, 255).length], ["PING", encodePing(0xffffffff).length], ["IDENTITY", encodeIdentityRequest("x".repeat(500)).length],
    ["REPORT", REPORT_MAX], ["VOICE", 4 + VOZ_TRAMA_MAX], ["FEATURE (intent, biggest declared)", intents[0].bytes], ["PASE", PASE_MAX],
  ];
  for (const [n, b] of limites) assert.ok(b <= PASE_MAX, `${n}: ${b} B is over the WebSocket maxPayload ${PASE_MAX}`);
  for (const [n, b] of limites) if (n !== "PASE") assert.ok(b <= WS_FRAME_MAX, `${n}: ${b} B is over the ${WS_FRAME_MAX} B every message but PASE keeps`);
  assert.equal(Math.max(...limites.map(([, b]) => b)), PASE_MAX, "maxPayload is exactly the biggest message cap: not a byte more");

  const sim = createSim(64, 1); for (let i = 0; i < 51; i++) spawnAvatar(sim, i);
  const snap = encodeSnapshot(sim, 0, 0, Array.from({ length: 50 }, (_, i) => i + 1)).length;
  const bienvenida = encodeWelcome({ entity: 1, tick: 1, x: 0, z: 0, ref: { seed: 1, ticks: 1, n: 1, hash: 1 } }).length;
  const identidad = encodeIdentity({ token: "g1." + "a".repeat(60), id: "a".repeat(12), nombre: "Invitado ABCD" }).length;
  const ficha = emitir(signer("una-clave-de-prueba-larga"), nuevoId(Math.random), 20000);
  const conVoz = codificarVozSubida(2, 1, new Uint8Array(320))!.length;
  console.log("[tamaños] " + JSON.stringify({
    subida: { INPUT: limites[0][1], PING: limites[1][1], IDENTITY_tope: limites[2][1], IDENTITY_real: ficha.length + 1, REPORT_tope: REPORT_MAX, VOICE_real_20ms_mulaw: conVoz, VOICE_tope: 4 + VOZ_TRAMA_MAX, PASE_tope: PASE_MAX },
    intentsMayores: intents.slice(0, 3), intentsTotal: intents.length,
    bajada: { SNAPSHOT_k50: snap, WELCOME: bienvenida, IDENTITY_respuesta: identidad, CATALOG_json: catalogo, eventoMayor: eventos[0], estadoMayor: estados[0] },
  }));
  assert.ok(intents[0].bytes < WS_FRAME_MAX, `${intents[0].nombre} would need ${intents[0].bytes} B`);
});
