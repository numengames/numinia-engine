// prueba-embed-opaco: M7 story 1, the PROOF. What breaks when the world page runs with an OPAQUE origin, as inside Hermes Desktop's
// SandboxedFrame (sandbox="allow-scripts allow-pointer-lock", no allow-same-origin)? It starts the REAL server (MOTOR_PLANTILLA=hermes, throwaway
// world), serves tools/embed-host.html on ANOTHER loopback port, embeds the world in the sandboxed iframe and prints a categorised list of
// everything that failed. Run it before and after a fix; `--cors` papers over the missing CORS headers at the browser (route interception) so the
// NEXT layer of problems shows up. Needs `npm run build`. Hold the browser lock: flock <lock> node tools/prueba-embed-opaco.mjs [--cors] [--query=?webgl2]
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { crearMundo, abrirNavegador, dormir, RAIZ } from "./espejo-e2e-lib.mjs";

const conCors = process.argv.includes("--cors");
const lna = process.argv.includes("--lna"), tapar = process.argv.includes("--tapar");
const query = process.argv.find((a) => a.startsWith("--query="))?.slice(8) ?? "?webgl2";
const conEmbed = process.argv.includes("--embed"); // --embed: the world turns embed mode ON (espejo.json embed.activa)
const m = await crearMundo(conEmbed ? { plantillaEspejo: () => ({ embed: { activa: true } }) } : {});
const html = readFileSync(`${RAIZ}/tools/embed-host.html`);
const h = createServer((_q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(html); });
await new Promise((o) => h.listen(0, "127.0.0.1", o));
const nav = await abrirNavegador();
const ctx = await nav.browser.newContext({ viewport: { width: 1280, height: 720 } });
// --tapar: stub the storage the page reads at boot (memory) to see what breaks AFTER the storage crash
if (tapar) await ctx.addInitScript(() => { if (location.protocol === "about:") return; const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; }; for (const [k, v] of [["localStorage", mem()], ["sessionStorage", mem()], ["caches", undefined]]) { try { Object.defineProperty(window, k, { value: v, configurable: true }); } catch { /* top page */ } } });
if (conCors) await ctx.route(`${new URL(m.url).origin}/**`, async (r) => { const x = await r.fetch(); await r.fulfill({ response: x, headers: { ...x.headers(), "access-control-allow-origin": "*" } }); });
const p = await ctx.newPage();
const ev = { cors: new Set(), fallos: new Set(), errores: [], ws: [], consola: [] };
p.on("console", (x) => { const t = x.text(); if (/blocked by CORS policy/.test(t)) ev.cors.add(t.replace(/^Access to (\w+) at '[^']*\/([^/']*)' from origin 'null'.*/, "$1 $2")); else if (x.type() === "error" || x.type() === "warning") ev.consola.push(`${x.type()}: ${t.slice(0, 200)}`); });
p.on("pageerror", (e) => ev.errores.push(String(e).slice(0, 220)));
p.on("requestfailed", (r) => ev.fallos.add(`${r.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, "")} ${r.failure()?.errorText}`));
p.on("websocket", (w) => { ev.ws.push(`open ${w.url().replace(/:\d+/, ":PORT")}`); w.on("close", () => ev.ws.push("close")); w.on("socketerror", (e) => ev.ws.push(`error ${e}`)); });
await p.goto(`http://127.0.0.1:${h.address().port}/?mundo=${encodeURIComponent(m.url + query)}${lna ? "&allow=local-network-access" : ""}`);
await dormir(15000);
const fr = p.frames().find((f) => f !== p.mainFrame());
const sonda = fr ? await fr.evaluate(async () => {
  const r = { contextoSeguro: isSecureContext, origen: location.origin, arrancado: !!globalThis.__numinia?.probe?.done, entidad: globalThis.__numinia?.session?.entity ?? null };
  for (const k of ["localStorage", "sessionStorage"]) { try { void globalThis[k]; r[k] = "ok"; } catch (e) { r[k] = `${e.name}`; } }
  try { r.cookie = `ok (${document.cookie.length})`; } catch (e) { r.cookie = e.name; }
  try { await navigator.serviceWorker.register("/sw.js"); r.serviceWorker = "ok"; } catch (e) { r.serviceWorker = e.name; }
  try { r.status = (await fetch("/status")).status; } catch (e) { r.status = `fetch /status: ${e.name}`; }
  try { await fetch("/status", { mode: "no-cors" }); r.statusSinCors = "opaco"; } catch (e) { r.statusSinCors = e.name; }
  try { const rq = indexedDB.open("x"); r.indexedDB = await new Promise((ok) => { rq.onsuccess = () => ok("ok"); rq.onerror = () => ok(rq.error?.name ?? "error"); }); } catch (e) { r.indexedDB = e.name; }
  r.pointerLockApi = typeof document.body.requestPointerLock;
  return r;
}) : null;
console.log(`Chromium ${nav.browser.version()} · PW_ARGS=${process.env.PW_ARGS ?? ""}`);
console.log(JSON.stringify({ conEmbed, conCors, lna, tapar, sonda, ws: ev.ws, cors: [...ev.cors].sort(), corsN: ev.cors.size, fallosN: ev.fallos.size, fallos: [...ev.fallos].slice(0, 8), errores: ev.errores.slice(0, 10), consola: [...new Set(ev.consola)].slice(0, 12) }, null, 1));
if (process.env.SONDA_SHOT) await p.screenshot({ path: process.env.SONDA_SHOT });
await nav.cerrar(); await m.parar(); h.close();
