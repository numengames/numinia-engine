// v9: entering a world on a headset is slow because the page does its steps one after another. Two cheap causes, measured
// (docs/CARGA-RAPIDA.md «v9»): (1) the WebSocket was opened only after /status and the 3D view, so its handshake and the
// server's welcome waited behind them; (2) the determinism probe ran before the first frame instead of after it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webSocketClient, MSG } from "../packages/net/src/index.ts";

type Escucha = (ev: { data: unknown; code?: number; reason?: string }) => void;
class SocketFalso {
  static ultimo: SocketFalso;
  binaryType = "blob"; readyState = 0;
  escuchas = new Map<string, Escucha[]>();
  url: string;
  constructor(url: string) { this.url = url; SocketFalso.ultimo = this; }
  addEventListener(t: string, f: Escucha) { this.escuchas.set(t, [...(this.escuchas.get(t) ?? []), f]); }
  emitir(t: string, ev: { data?: unknown; code?: number; reason?: string } = {}) { for (const f of this.escuchas.get(t) ?? []) f({ data: ev.data, ...ev }); }
  send() {} close() {}
}
const msg = (tipo: number, ...resto: number[]) => new Uint8Array([tipo, ...resto]).buffer;

test("webSocketClient: lo que llega antes de que haya quien escuche espera, en orden, y solo queda el último snapshot", () => {
  const antes = (globalThis as { WebSocket?: unknown }).WebSocket;
  (globalThis as { WebSocket?: unknown }).WebSocket = SocketFalso;
  try {
    const t = webSocketClient("ws://x/ws");
    const s = SocketFalso.ultimo;
    s.emitir("open");
    s.emitir("message", { data: msg(MSG.WELCOME, 1) });
    s.emitir("message", { data: msg(MSG.SNAPSHOT, 1) });
    s.emitir("message", { data: msg(MSG.STATE, 7) });
    s.emitir("message", { data: msg(MSG.SNAPSHOT, 2) });
    s.emitir("message", { data: "texto, no se entrega" });
    const recibido: number[][] = [];
    t.onMessage((b) => recibido.push([...b]));
    assert.deepEqual(recibido, [[MSG.WELCOME, 1], [MSG.STATE, 7], [MSG.SNAPSHOT, 2]], "welcome primero, el snapshot viejo se tira, el estado se conserva");
    s.emitir("message", { data: msg(MSG.SNAPSHOT, 3) });
    assert.deepEqual(recibido.at(-1), [MSG.SNAPSHOT, 3], "con oyente puesto, entrega directa");
    assert.equal(recibido.length, 4);
  } finally { (globalThis as { WebSocket?: unknown }).WebSocket = antes; }
});

test("webSocketClient: sin nada en espera, onMessage no entrega nada", () => {
  const antes = (globalThis as { WebSocket?: unknown }).WebSocket;
  (globalThis as { WebSocket?: unknown }).WebSocket = SocketFalso;
  try {
    const t = webSocketClient("ws://x/ws");
    let n = 0; t.onMessage(() => n++);
    assert.equal(n, 0);
  } finally { (globalThis as { WebSocket?: unknown }).WebSocket = antes; }
});

test("la página abre el socket antes de pedir /status y de montar la vista, y la sonda va tras el primer cuadro", () => {
  const src = readFileSync(new URL("../apps/plaza/main.ts", import.meta.url), "utf8");
  const socket = src.indexOf("const transport = webSocketClient(url);");
  assert.ok(socket > 0, "el socket se crea en main.ts");
  assert.equal(src.split("webSocketClient(url)").length - 1, 1, "una sola conexión");
  assert.ok(socket < src.indexOf("fetch(`${activos}/status`)"), "antes de pedir /status");
  assert.ok(socket < src.indexOf("await createView("), "antes de montar la vista 3D");
  assert.ok(src.indexOf("transport.opened.catch(() => {})") > socket, "el rechazo temprano no queda sin atender");
  assert.match(src, /session\.welcome && !probe\.done && \(informe\.primerCuadroMs \|\| document\.hidden\)\) runProbe\(\)/, "la sonda espera al primer cuadro");
});
