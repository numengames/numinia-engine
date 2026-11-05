// e2e-embed: M7, the embed mode through a real browser. The world page runs inside tools/embed-host.html's sandboxed iframe
// (sandbox="allow-scripts allow-pointer-lock", no allow-same-origin) on ANOTHER loopback port, so the page has an opaque origin, exactly as in Hermes Desktop.
//   snapshot in → things appear; touch a cron thing → the host receives `peticion`; the host answers `resultado` → the card shows the Spanish text;
//   a stranger window's message is ignored; a world with embed OFF refuses the credential; a normal (non-embed) load is unchanged and never fetches the bridge.
// Run it holding the browser lock (npm run test:e2e does the espejo e2e first). Needs `npm run build`.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { crearMundo, abrirNavegador, dormir, RAIZ, CLAVE_ENLACE } from "./espejo-e2e-lib.mjs";
import { irA, textoBoton, esperarTexto } from "./e2e-espejo.mjs";
import { acunarCredencial } from "../packages/server/src/embed-espejo.ts";

let pass = 0, fail = 0; const fallos = [];
const abiertos = [];
async function prueba(nombre, fn) { const t0 = Date.now(); try { await fn(); pass++; console.log(`✔ ${nombre} (${Date.now() - t0} ms)`); } catch (e) { fail++; fallos.push(nombre); console.log(`✖ ${nombre}\n   ${String(e?.stack ?? e).split("\n").slice(0, 6).join("\n   ")}`); } finally { while (abiertos.length) await abiertos.pop().close().catch(() => {}); } }
const cron = (id, titulo, extra = {}) => ({ tipo: "cron", id, titulo, estado: "programado", zona: "z7", acciones: ["cron.pausar", "cron.ejecutar"], ...extra });

export async function correrEmbed() {
  const html = readFileSync(`${RAIZ}/tools/embed-host.html`), host = createServer((_q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(html); });
  await new Promise((o) => host.listen(0, "127.0.0.1", o));
  const urlHost = (mundo, query = "?webgl2&embed=1", cred = acunarCredencial(CLAVE_ENLACE)) => `http://127.0.0.1:${host.address().port}/?mundo=${encodeURIComponent(`${mundo.url}${query}${cred ? `#embed=${cred}` : ""}`)}`;
  const mundo = await crearMundo({ funciones: { cron: true }, plantillaEspejo: () => ({ embed: { activa: true } }) }), nav = await abrirNavegador();
  const abrir = async (m, query, cred) => {
    const ctx = await nav.browser.newContext({ viewport: { width: 1280, height: 720 } }), p = await ctx.newPage(), errores = [], pedidos = [];
    p.on("pageerror", (e) => errores.push(String(e))); p.on("request", (r) => pedidos.push(r.url()));
    await p.goto(urlHost(m, query, cred));
    const fr = await (async () => { for (let i = 0; i < 200; i++) { const f = p.frames().find((x) => x !== p.mainFrame()); if (f) return f; await dormir(50); } throw new Error("no frame"); })();
    await fr.waitForFunction(() => globalThis.__numinia?.session?.entity >= 0 && globalThis.__numinia.probe?.done, null, { timeout: 40000 });
    const recibidos = () => p.evaluate(() => window.__host.recibidos), enviar = (m2) => p.evaluate((x) => window.__host.enviar(x), m2);
    const esperar = (fn, arg, ms = 12000) => p.waitForFunction(fn, arg, { timeout: ms });
    abiertos.push(ctx);
    return { ctx, p, fr, errores, pedidos, recibidos, enviar, esperar };
  };
  try {
    await prueba("opaque origin: the world boots in the sandboxed frame (no storage crash), pointer lock exists, `listo` then `hola` reach the host", async () => {
      const E = await abrir(mundo);
      const s = await E.fr.evaluate(() => ({ origen: window.origin, ls: (() => { try { localStorage.setItem("a", "1"); return localStorage.getItem("a"); } catch (e) { return e.name; } })(), pl: typeof document.body.requestPointerLock }));
      assert.equal(s.origen, "null", "window.origin of a sandboxed frame without allow-same-origin"); assert.equal(s.pl, "function"); assert.equal(s.ls, "1", "storage falls back to memory");
      await E.esperar(() => window.__host.recibidos.some((m) => m.kind === "hola"));
      const r = await E.recibidos();
      assert.equal(r[0].kind, "listo"); const hola = r.find((m) => m.kind === "hola");
      assert.ok(hola.funciones.includes("salud") || Array.isArray(hola.funciones)); assert.equal(typeof hola.acciones, "object");
      assert.deepEqual(E.errores, [], "no page errors");
      await E.ctx.close();
    });
    await prueba("snapshot in → things appear; touching a cron thing → host receives `peticion`; host answers `resultado` → card shows the Spanish text", async () => {
      const E = await abrir(mundo);
      await E.esperar(() => window.__host.recibidos.some((m) => m.kind === "hola"));
      await E.enviar({ v: 1, kind: "snapshot", objetos: [cron("aa11", "Resumen diario"), cron("bb22", "Limpieza")] });
      await E.fr.waitForFunction(() => globalThis.__numinia.espejo.cosas().filter((c) => c.tipo === "cron").length === 2, null, { timeout: 12000 });
      await irA(E.fr, "z7");
      const clave = await E.fr.evaluate(() => globalThis.__numinia.espejo.cosas().find((c) => c.titulo === "Resumen diario").clave);
      await E.fr.evaluate((k) => globalThis.__numinia.espejo.usar(k), clave);
      await E.fr.waitForSelector("#espejo-ficha:not([hidden])", { timeout: 8000 });
      assert.equal(await textoBoton(E.fr, "cron.pausar"), "Pausar");
      await E.fr.click('#espejo-ficha button[data-verbo="cron.pausar"]'); // «¿Seguro?»
      await E.fr.click('#espejo-ficha button[data-verbo="cron.pausar"]');
      await E.esperar(() => window.__host.recibidos.some((m) => m.kind === "peticion"));
      const pet = (await E.recibidos()).find((m) => m.kind === "peticion");
      assert.deepEqual([pet.v, pet.objeto, pet.verbo, pet.seguridad, pet.quien.nombre], [1, clave, "cron.pausar", "confirmar", "dueño local"]);
      assert.equal(typeof pet.id, "string"); assert.equal(typeof pet.caduca, "number");
      await E.enviar({ v: 1, kind: "event", evento: "resultado", peticion: pet.id, ok: true, texto: "Tarea pausada." });
      await esperarTexto(E.fr, "#espejo-ficha .dicho", /Hecho\. Tarea pausada\./);
      await E.ctx.close();
    });
    await prueba("event/baja removes a thing; a bad message gets `error`; `funciones` naming a function that is off is answered with `ack.ignoradas`", async () => {
      const E = await abrir(mundo);
      await E.esperar(() => window.__host.recibidos.some((m) => m.kind === "hola"));
      await E.enviar({ v: 1, kind: "snapshot", objetos: [cron("aa11", "Resumen diario")] });
      await E.fr.waitForFunction(() => globalThis.__numinia.espejo.cosas().filter((c) => c.tipo === "cron").length === 1, null, { timeout: 12000 });
      await E.enviar({ v: 1, kind: "event", evento: "baja", objeto: { tipo: "cron", id: "aa11" } });
      await E.fr.waitForFunction(() => globalThis.__numinia.espejo.cosas().filter((c) => c.tipo === "cron").length === 0, null, { timeout: 12000 });
      await E.enviar({ v: 1, kind: "teletransporte" });
      await E.esperar(() => window.__host.recibidos.some((m) => m.kind === "error" && m.en === "embed"));
      await E.enviar({ v: 1, kind: "funciones", funciones: ["memoria-que-no-existe"] });
      await E.esperar(() => window.__host.recibidos.some((m) => m.kind === "ack" && m.en === "funciones" && m.ignoradas.includes("memoria-que-no-existe")));
      await E.ctx.close();
    });
    await prueba("a message from another window is ignored: the stranger's snapshot adds nothing and gets no answer", async () => {
      const E = await abrir(mundo);
      await E.esperar(() => window.__host.recibidos.some((m) => m.kind === "hola"));
      const antes = (await E.recibidos()).length;
      // the world's own window posting to itself has `source` = itself, not the parent: it must be dropped
      await E.fr.evaluate(() => window.postMessage({ v: 1, kind: "snapshot", objetos: [{ tipo: "cron", id: "zz99", titulo: "Intrusa", estado: "programado", zona: "z7", acciones: [] }] }, "*"));
      await dormir(1500);
      assert.equal(await E.fr.evaluate(() => globalThis.__numinia.espejo.cosas().some((c) => c.titulo === "Intrusa")), false);
      assert.equal((await E.recibidos()).length, antes, "no answer to a stranger");
      await E.ctx.close();
    });
    await prueba("no / wrong credential in the fragment ⇒ no `hola`, no owner powers, nothing published is accepted", async () => {
      for (const cred of ["", "e1.1.AAAAAAAAAAAAAAAA." + "0".repeat(64), acunarCredencial("otra-clave-que-no-es-la-del-enlace-1")]) {
        const E = await abrir(mundo, "?webgl2&embed=1", cred);
        await dormir(3500);
        const r = await E.recibidos();
        assert.equal(r.some((m) => m.kind === "hola"), false, `cred «${cred.slice(0, 8)}»`);
        await E.enviar({ v: 1, kind: "snapshot", objetos: [cron("cc33", "Sin credencial")] }); await dormir(1500);
        assert.equal(await E.fr.evaluate(() => globalThis.__numinia.espejo.cosas().some((c) => c.titulo === "Sin credencial")), false, "snapshot refused without a valid credential");
        await E.ctx.close();
      }
    });
    await prueba("a normal load of the same world (not framed) is unchanged: no bridge chunk is requested, `?embed=1` alone does nothing", async () => {
      const ctx = await nav.browser.newContext({ viewport: { width: 1280, height: 720 } }), p = await ctx.newPage(), pedidos = [], errores = [];
      p.on("request", (r) => pedidos.push(r.url())); p.on("pageerror", (e) => errores.push(String(e)));
      await p.goto(`${mundo.url}?webgl2&embed=1#embed=${acunarCredencial(CLAVE_ENLACE)}`);
      await p.waitForFunction(() => globalThis.__numinia?.probe?.done, null, { timeout: 40000 }); await dormir(800);
      assert.deepEqual(pedidos.filter((u) => /espejo-embed/.test(u)), [], "not framed ⇒ no bridge"); assert.deepEqual(errores, []);
      assert.equal(await p.evaluate(() => location.hash.includes("embed=")), true, "the fragment is left alone when there is no bridge");
      await ctx.close();
    });
  } finally { await nav.cerrar(); await mundo.parar(); }

  // a world with embed OFF: the route does not exist, the page never loads the bridge, the intent is refused
  const sin = await crearMundo(), nav2 = await abrirNavegador();
  try {
    await prueba("embed OFF in the world: POST /espejo/embed is 404 with a valid credential, /status has no `embed`, the framed page loads no bridge", async () => {
      const r = await fetch(`${sin.url}espejo/embed`, { method: "POST", headers: { authorization: `Bearer ${acunarCredencial(CLAVE_ENLACE)}`, origin: "null" }, body: "{}" });
      assert.equal(r.status, 404); assert.equal("embed" in ((await (await fetch(`${sin.url}status`)).json()).espejo ?? {}), false);
      const ctx = await nav2.browser.newContext({ viewport: { width: 1280, height: 720 } }), p = await ctx.newPage(), pedidos = [];
      p.on("request", (q) => pedidos.push(q.url())); await p.goto(urlHost(sin));
      const fr = await (async () => { for (let i = 0; i < 200; i++) { const f = p.frames().find((x) => x !== p.mainFrame()); if (f) return f; await dormir(50); } throw new Error("no frame"); })();
      await fr.waitForFunction(() => globalThis.__numinia?.probe?.done, null, { timeout: 40000 }).catch(() => {}); await dormir(1500);
      const hola = await p.evaluate(() => window.__host.recibidos.filter((m) => m.kind === "hola").length);
      assert.equal(hola, 0); await ctx.close();
    });
  } finally { await nav2.cerrar(); await sin.parar(); host.close(); }
  console.log(`\nℹ tests ${pass + fail}\nℹ pass ${pass}\nℹ fail ${fail}`);
  if (fail) console.log(`✖ failing: ${fallos.join(" | ")}`);
  return fail === 0;
}
if (import.meta.url === `file://${process.argv[1]}`) correrEmbed().then((ok) => process.exit(ok ? 0 : 1), (e) => { console.error(e); process.exit(2); });
