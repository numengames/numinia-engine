// V1 for agents (AI-native principle, ADR-080): an AI that comes in by the MCP bridge sees the world's things with a card
// (people of the world, quest things) in «mirar», walks to one with `ir_a {cosa}`, uses it with `usar` (the same intent a
// person's E key sends; the server checks the reach) and HEARS what the world announces in `oir` (channel «mundo»): a
// dialogue with its numbered answers, a quest accepted, a refusal with its reason. The example adventure, a real server
// on a free port, the bridge as a child process. No model anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startServer } from "../packages/server/src/server.ts";
import { lectorAventura } from "../packages/server/src/aventura.ts";
import chatServer from "../features/chat/server.ts";
import { crearObjetos } from "../features/objetos/server.ts";
import { crearMisiones } from "../features/misiones/server.ts";

const EJEMPLO_DIR = new URL("../aventuras/ejemplo", import.meta.url).pathname;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("the bridge sees, walks to and uses the world's things: a person's dialogue with numbered answers reaches «oir», a quest is accepted, a refusal says why", { timeout: 60_000 }, async () => {
  const raiz = mkdtempSync(join(tmpdir(), "mcp-usar-")), claves = join(raiz, "claves"), aventura = join(raiz, "aventura");
  const nuevo = spawnSync(process.execPath, ["tools/agente.ts", "nuevo", "hermes", "--carpeta", claves, "--nombre", "Hermes"], { encoding: "utf8" });
  assert.equal(nuevo.status, 0, nuevo.stderr);
  const publica = /Clave pública: (ed25519:\S+)/.exec(nuevo.stdout)![1];
  mkdirSync(join(aventura, "agentes"), { recursive: true });
  writeFileSync(join(aventura, "agentes", "hermes.json"), JSON.stringify({ formato: "agente@1", id: "hermes", nombre: "Hermes", responsable: "Pablo", clave: publica, rol: "administracion" }));
  const leer = lectorAventura(EJEMPLO_DIR);
  const log: string[] = [];
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, features: [chatServer, crearObjetos(), ...crearMisiones({ aventura: { misiones: leer("misiones"), pnj: leer("pnj"), cosas: leer("cosas") } })], aventura, admin: "codigo-de-administracion-largo", secret: "una-clave-de-prueba-larga", log: (l) => log.push(l), version: "prueba" });
  const hijo = spawn(process.execPath, ["tools/mcp-mundo.ts"], { env: { ...process.env, MUNDO_URL: `ws://127.0.0.1:${srv.port}/ws`, AGENTE_ID: "hermes", AGENTE_CLAVE: join(claves, "hermes.clave") }, stdio: ["pipe", "pipe", "pipe"] });
  let errores = "", resto = "", n = 0;
  const pendientes = new Map<number, (r: Record<string, any>) => void>();
  hijo.stderr.setEncoding("utf8").on("data", (t: string) => { errores += t; });
  hijo.stdout.setEncoding("utf8").on("data", (t: string) => {
    resto += t;
    for (let i; (i = resto.indexOf("\n")) >= 0;) { const m = JSON.parse(resto.slice(0, i)); resto = resto.slice(i + 1); pendientes.get(m.id)?.(m); pendientes.delete(m.id); }
  });
  const pedir = (method: string, params?: unknown) => new Promise<Record<string, any>>((ok) => { const id = ++n; pendientes.set(id, ok); hijo.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
  const usar = async (name: string, args: Record<string, unknown> = {}) => { const r = (await pedir("tools/call", { name, arguments: args })).result; return { texto: String(r.content[0].text), error: r.isError === true }; };
  /** `oir` from the cursor until a line matches (the world answers after its tick), or the last text if it never does. */
  let cursor = 0;
  const oirHasta = async (re: RegExp) => {
    let t = "";
    for (let i = 0; i < 40; i++) { t = (await usar("oir", { desde: cursor })).texto; if (re.test(t)) break; await espera(100); }
    cursor = Number(/cursor: (\d+)/.exec(t)![1]);
    return t;
  };
  const mirarHasta = async (re: RegExp) => {
    let m = { texto: "", error: true };
    for (let i = 0; i < 60 && (m.error || !re.test(m.texto)); i++) { await espera(150); m = await usar("mirar"); }
    return m;
  };
  try {
    await pedir("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "prueba", version: "0" } });
    hijo.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const lista = (await pedir("tools/list")).result.tools as { name: string; description: string }[];
    assert.deepEqual(lista.map((t) => t.name), ["leeme_ia", "mirar", "decir", "ir_a", "usar", "colocar", "mover", "borrar", "deshacer", "oir", "llamadas", "esperar_llamada", "gesto"]);
    assert.match(lista.find((t) => t.name === "usar")!.description, /tecla E/);
    // 1. in the world; the server puts it beside Alma (2, −4; she is spoken to within 3 m): what a person at that spot can use
    let mira = await mirarHasta(/Eres «Hermes · IA»/);
    assert.equal(mira.error, false, `${mira.texto}\n${errores}`);
    const yo = srv.inst.conns.find((c) => c.who?.id === "ia-hermes")!;
    assert.ok(srv.inst.teletransportar(yo.entity, { x: 2, y: 0, z: -2 }, { radios: [0, 0.5] }), "beside Alma");
    mira = await mirarHasta(/pnj\/alma[^\n]*AL ALCANCE/);
    assert.match(mira.texto, /cosas del mundo que se usan: \d+ \(al alcance ahora: [1-9]/);
    assert.match(mira.texto, /- cosa pnj\/alma · persona «Alma, la guía» · Guía de la plaza\.[^\n]* · AL ALCANCE: «hablar con Alma, la guía» \(usar\)/);
    assert.match(mira.texto, /- cosa misiones\/regadera · objeto «Regadera azul»[^\n]* · lejos para usarla/, "18 m away, used within 2 m");
    // 2. the wrong names say how to name a thing; a far thing says to walk first
    assert.match((await usar("usar", { cosa: "alma" })).texto, /no es una cosa que se use de cerca: dime «función\/clave»/);
    assert.match((await usar("usar", { cosa: "pnj/nadie" })).texto, /No veo ninguna cosa «pnj\/nadie»/);
    assert.match((await usar("usar", { cosa: "misiones/regadera" })).texto, /se usa a menos de 2 m: acércate con ir_a \{cosa: "misiones\/regadera"\}/);
    assert.match((await usar("usar", { cosa: "misiones/regadera", opcion: 1 })).texto, /«opcion» solo vale con una persona del mundo/);
    // 3. talk: the person's line and her answers reach «oir» as the world's channel; choosing goes by number
    const habla = await usar("usar", { cosa: "pnj/alma" });
    assert.equal(habla.error, false, habla.texto);
    assert.match(habla.texto, /^Hecho: hablar con Alma, la guía\./);
    let oido = await oirHasta(/Soy Alma/);
    assert.match(oido, /«pnj» \(pasa en el mundo\): «Alma, la guía: ¡Hola! Soy Alma, la guía de la plaza\. ¿Es tu primera vez por aquí\? — Respuestas: 1\) Sí\. ¿Me enseñas la plaza\? · 2\) Ahora no, gracias\.»/);
    const elige = await usar("usar", { cosa: "pnj/alma", opcion: 1 });
    assert.equal(elige.error, false, elige.texto);
    oido = await oirHasta(/Te propongo un paseo/);
    assert.match(oido, /Respuestas: 1\) ¡Acepto! · 2\) Mejor otro día\./);
    assert.equal((await usar("usar", { cosa: "pnj/alma", opcion: 1 })).error, false);
    oido = await oirHasta(/Misión nueva/);
    assert.match(oido, /«misiones» \(pasa en el mundo\): «Misión nueva: Primeros pasos en la plaza\. Lo tienes en tu libro/, "the quest's own announce, as a screen reader says it");
    assert.match(oido, /«pnj» \(pasa en el mundo\): «Alma, la guía: ¡Estupendo!/);
    assert.ok(!/\(pasa en el mundo\): «»/.test(oido), "no empty lines");
    // 4. walk to a thing: it stops inside the thing's reach; using a thing no quest asks for is refused with the reason, heard
    const voy = await usar("ir_a", { cosa: "misiones/regadera" });
    assert.equal(voy.error, false, voy.texto);
    assert.match(voy.texto, /^Voy hacia «Regadera azul» \(está a 1[0-9]\.\d m; se usa a menos de 2 m\)/);
    mira = await mirarHasta(/misiones\/regadera[^\n]*AL ALCANCE/);
    assert.match(mira.texto, /- cosa misiones\/regadera[^\n]* · AL ALCANCE: «coger la regadera» \(usar\)/, `walked there:\n${mira.texto}`);
    const coge = await usar("usar", { cosa: "misiones/regadera" });
    assert.equal(coge.error, false, coge.texto);
    oido = await oirHasta(/«misiones» \(pasa en el mundo\)/);
    assert.match(oido, /«pnj» \(pasa en el mundo\): «Fin de la conversación con Alma, la guía\.»/, "walking away ended the talk, and it heard so");
    assert.match(oido, /«misiones» \(pasa en el mundo\): «Ahora no te hace falta Regadera azul\.»/, `the refusal and its reason:\n${oido}`);
    assert.ok(!/a2\.hermes\./.test(errores), "no ticket in the bridge's log");
  } finally {
    hijo.stdin.end();
    await new Promise((r) => hijo.once("exit", r));
    await srv.close();
  }
});
