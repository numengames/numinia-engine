// e2e leg (J5 + the J4 core): the engine's EXAMPLE quest in a real browser. Tab A walks to Alma, the prompt says
// «E: hablar con Alma, la guía», E opens the conversation, the digits pick the answers, it accepts; when the conversation
// closes the book opens by itself (U14 (3): the focus stays out of it; the pillar «ahora», the rest locked) and J closes
// it; objetivos() points at the golden pillar; A walks there, then to Bruno (E, 1), then to the box (E: coger la caja);
// the book shows the quest done. Tab B (another browser context = another guest) sees the people (cards) and never
// gets A's quest events. Restartable: fresh contexts every run, so a fresh guest (the server keeps old guests' books).
// Needs the server + page running (tools/auto.sh e2e starts them). Env: BASE, SERVER_HTTP; SHOTS=<folder> saves pictures.
import { createRequire } from "node:module";
import { existsSync } from "node:fs";

const PW = process.env.PW_CORE ?? new URL("../../node_modules/playwright-core", import.meta.url).pathname;
const CHROME = process.env.CHROME ?? "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const BASE = process.env.BASE ?? "http://127.0.0.1:5173/?webgl2";
const SHOTS = process.env.SHOTS ?? "";
if (!existsSync(PW) || !existsSync(CHROME)) { console.error("playwright-core or chromium not found; set PW_CORE / CHROME"); process.exit(2); }
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/var/home/uruk/arkhitektonian-lab/.cache/ms-playwright";
const { chromium } = createRequire(import.meta.url)(PW);
const browser = await chromium.launch({ executablePath: CHROME, args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
const errors = [], t0 = Date.now();
const out = { pasos: [], errors };
const nota = (paso, extra = {}) => out.pasos.push({ paso, s: Math.round((Date.now() - t0) / 100) / 10, ...extra });

const abrir = async () => {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } }); // a fresh context = a fresh guest
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(String(e)));
  await p.goto(BASE);
  await p.waitForFunction(() => globalThis.__numinia?.probe.done && globalThis.__numinia.session.entity >= 0 && !!globalThis.__numinia.session.who, null, { timeout: 30000 });
  return p;
};
const yo = (p) => p.evaluate(() => globalThis.__numinia.session.selfPosition(1));
/** Walk with the keyboard until within `cerca` metres of (x, z) (held keys, re-aimed every step). */
async function caminar(p, x, z, cerca = 1.2, maxMs = 30000) {
  await p.bringToFront();
  const t = Date.now();
  let d = Infinity;
  while (Date.now() - t < maxMs) {
    const me = await yo(p), dx = x - me.x, dz = z - me.z;
    d = Math.hypot(dx, dz);
    if (d <= cerca) break;
    const held = [];
    if (Math.abs(dx) > cerca * 0.5) held.push(dx > 0 ? "KeyD" : "KeyA");
    if (Math.abs(dz) > cerca * 0.5) held.push(dz > 0 ? "KeyS" : "KeyW");
    // far: run (Shift, 4 m/s); near: walk (1.5 m/s) — the sim's RUN_SPEED/SPEED since #24 (walking used to be 4)
    const corre = Math.max(Math.abs(dx), Math.abs(dz)) > 3;
    if (corre) held.unshift("Shift");
    const ms = Math.max(100, Math.min(1500, ((Math.max(Math.abs(dx), Math.abs(dz)) - cerca * 0.4) / (corre ? 4 : 1.5)) * 1000));
    for (const k of held) await p.keyboard.down(k);
    await p.waitForTimeout(ms);
    for (const k of held) await p.keyboard.up(k);
    await p.waitForTimeout(120);
  }
  return Math.round(d * 10) / 10;
}
const ctl = (p, code) => p.evaluate(code);
const esperar = (p, fn, arg, ms = 8000) => p.waitForFunction(fn, arg, { timeout: ms });
const foto = async (p, n) => { if (SHOTS) await p.screenshot({ path: `${SHOTS}/misiones-${n}.png` }); };
const tarjeta = (p, key) => p.evaluate((k) => globalThis.__numinia.session.features.cards().find((c) => c.feature === "pnj" && c.key === k) ?? null, key);
const objetivos = (p) => ctl(p, () => globalThis.__numinia.misiones.objetivos());
const libro = (p) => ctl(p, () => globalThis.__numinia.misiones.libro().map((m) => ({ id: m.id, estado: m.estado, paso: m.paso, seguida: m.seguida })));
const prompt = (p) => ctl(p, () => { const b = document.getElementById("interactuar"); return b && !b.hidden ? b.textContent : ""; });
const dialogoVisible = (p) => ctl(p, () => !document.getElementById("dialogo").hidden);

let ok = false;
try {
  const a = await abrir();
  nota("A dentro", { who: await ctl(a, () => globalThis.__numinia.session.who.nombre), en: await yo(a) });
  // 1. Alma: her card (J9: near players get the people), walk to her, the prompt, E, the answers with the keyboard
  await esperar(a, () => globalThis.__numinia.session.features.cards().some((c) => c.feature === "pnj" && c.key === "alma"), null, 10000);
  const alma = await tarjeta(a, "alma");
  const dAlma = await caminar(a, alma.at.x, alma.at.z + 1.5);
  await esperar(a, () => /hablar con Alma/.test(document.getElementById("interactuar")?.textContent ?? "") && !document.getElementById("interactuar").hidden, null, 5000);
  out.alma = { card: { role: alma.role, name: alma.name, actions: alma.actions }, distancia: dAlma, prompt: await prompt(a) };
  await foto(a, "1-alma");
  await a.keyboard.press("KeyE");
  await esperar(a, () => !document.getElementById("dialogo").hidden && document.activeElement?.closest?.("#dialogo")?.id === "dialogo", null, 5000);
  out.alma.dialogo = await ctl(a, () => ({ nombre: document.getElementById("dialogo-nombre").textContent, opciones: [...document.querySelectorAll("#dialogo .opciones button")].map((b) => b.textContent), foco: document.activeElement?.textContent, aviso: document.getElementById("avisos").textContent }));
  await foto(a, "2-dialogo");
  await a.keyboard.press("Digit1");
  await esperar(a, () => /pilar dorado/.test(globalThis.__numinia.misiones.dialogo()?.texto ?? ""), null, 5000);
  await a.keyboard.press("Digit1");
  await esperar(a, () => globalThis.__numinia.misiones.libro().some((m) => m.id === "primeros-pasos" && m.lista.length === 3), null, 5000);
  await esperar(a, () => /Primeros pasos/.test(document.getElementById("mision-seguida")?.textContent ?? ""), null, 3000).catch(() => {});
  out.aceptada = { libro: await libro(a), objetivos: await objetivos(a), balizas: await ctl(a, () => globalThis.__numinia.view.beaconCount()), linea: await ctl(a, () => document.getElementById("mision-seguida").textContent) };
  // J5's «Hecho cuando»: the map marks the quest's objective (the minimap gathers markers every 200 ms)
  await esperar(a, () => (globalThis.__numinia.mapa?.contar?.().objetivo ?? 0) >= 1, null, 3000).catch(() => {});
  out.aceptada.mapaObjetivo = await ctl(a, () => globalThis.__numinia.mapa?.contar?.().objetivo ?? 0);
  await a.keyboard.press("Digit1"); // «¡Hasta luego!»: the conversation closes and the book opens by itself (U14 (3))
  await esperar(a, () => document.getElementById("dialogo").hidden, null, 5000);
  await esperar(a, () => !document.getElementById("libro").hidden, null, 3000);
  out.libroAbierto = await ctl(a, () => ({ foco: document.getElementById("libro").contains(document.activeElement), pasos: [...document.querySelectorAll("#libro li.paso")].map((li) => `${li.dataset.estado}: ${li.querySelector(".texto")?.textContent}`) }));
  await foto(a, "3-libro");
  await a.keyboard.press("KeyJ"); // J closes it
  await esperar(a, () => document.getElementById("libro").hidden, null, 3000);
  nota("aceptada");
  // 2. the golden pillar: the server sees A arrive
  const ob1 = (await objetivos(a))[0];
  out.pilar = { objetivo: ob1, distancia: await caminar(a, ob1.x - 2, ob1.z) };
  await esperar(a, () => globalThis.__numinia.misiones.libro()[0]?.paso === 1, null, 8000);
  out.pilar.siguiente = (await objetivos(a))[0];
  nota("pilar");
  // 3. Bruno: walk, E, «Yo te la busco» (1) completes the step; «Voy» (1) closes
  const ob2 = (await objetivos(a))[0];
  out.bruno = { objetivo: ob2, distancia: await caminar(a, ob2.x, ob2.z + 1.5) };
  await esperar(a, () => /hablar con Bruno/.test(document.getElementById("interactuar")?.textContent ?? "") && !document.getElementById("interactuar").hidden, null, 5000);
  out.bruno.prompt = await prompt(a);
  // J4: a plain click on Bruno (his body or his name) in play mode opens the conversation too
  const punto = await ctl(a, () => {
    const n = globalThis.__numinia, lienzo = n.view.renderer.domElement;
    for (let y = 20; y < innerHeight - 20; y += 12) for (let x = 20; x < innerWidth - 20; x += 12) {
      if (document.elementFromPoint(x, y) === lienzo && n.view.pickThing(x, y) === "pnj:bruno") return { x, y };
    }
    return null;
  });
  out.bruno.clic = punto;
  if (punto) await a.mouse.click(punto.x, punto.y); else await a.keyboard.press("KeyE");
  await esperar(a, () => /Te manda Alma/.test(globalThis.__numinia.misiones.dialogo()?.texto ?? ""), null, 5000);
  await a.keyboard.press("Digit1");
  await esperar(a, () => globalThis.__numinia.misiones.libro()[0]?.paso === 2, null, 5000);
  out.bruno.siguiente = (await objetivos(a))[0];
  await a.keyboard.press("Digit1");
  await esperar(a, () => document.getElementById("dialogo").hidden, null, 5000);
  nota("bruno");
  // 4. the box: «E: coger la caja» only now (its step is the current one); E completes the quest
  const ob3 = (await objetivos(a))[0];
  out.caja = { objetivo: ob3, distancia: await caminar(a, ob3.x, ob3.z + 1) };
  await esperar(a, () => /coger la caja/.test(document.getElementById("interactuar")?.textContent ?? "") && !document.getElementById("interactuar").hidden, null, 5000);
  out.caja.prompt = await prompt(a);
  await a.keyboard.press("KeyE");
  await esperar(a, () => globalThis.__numinia.misiones.libro()[0]?.estado === "hecha", null, 5000);
  // U14 (6): «Misión completada» — the banner with the quest's title and its insignia: a polite live region, no clicks
  await esperar(a, () => document.getElementById("mision-completada")?.classList.contains("visible"), null, 5000);
  out.banner = await ctl(a, () => { const b = document.getElementById("mision-completada"); return { texto: b.textContent, rol: b.getAttribute("role"), vivo: b.getAttribute("aria-live"), clic: getComputedStyle(b).pointerEvents }; });
  // N10: the quest's «objeto» (Farolillo de Bruno) is YOURS — in the sheet's «Inventario» with its receipt checked in the
  // page (WebCrypto); a server without MOTOR_SECRET gives no goods (no key to sign with) and the sheet says so honestly
  out.bienes = { emisor: await ctl(a, () => globalThis.__numinia.bienes.emisor()) };
  if (out.bienes.emisor) await esperar(a, () => globalThis.__numinia.bienes.lista().length > 0, null, 5000);
  out.bienes.novedad = await ctl(a, () => !!document.querySelector("[data-novedad]"));
  await a.keyboard.press("KeyI");
  await esperar(a, () => document.getElementById("ficha")?.open, null, 3000);
  if (out.bienes.emisor) await esperar(a, () => /Recibo firmado ✓/.test(document.querySelector("#ficha [data-seccion=inventario]")?.textContent ?? ""), null, 5000);
  out.bienes.inventario = await ctl(a, () => document.querySelector("#ficha [data-seccion=inventario]")?.textContent ?? "");
  out.bienes.lista = await ctl(a, () => globalThis.__numinia.bienes.lista().map((b) => ({ nombre: b.nombre, licencia: b.licencia, recibo: b.recibo.slice(0, 4), largo: b.recibo.length })));
  out.bienes.comprobado = out.bienes.emisor ? await ctl(a, async () => { const n = globalThis.__numinia.bienes; const b = n.lista()[0]; return (await n.comprobar(n.ficheroRecibo(b).texto)).motivo; }) : "";
  out.bienes.novedadTrasAbrir = await ctl(a, () => !!document.querySelector("[data-novedad]"));
  await foto(a, "4b-inventario");
  await a.keyboard.press("KeyI");
  await esperar(a, () => !document.getElementById("ficha")?.open, null, 3000);
  nota("bienes");
  await a.keyboard.press("KeyJ");
  await esperar(a, () => !document.getElementById("libro").hidden, null, 3000);
  out.hecha = {
    libro: await libro(a), objetivos: await objetivos(a), resumen: await ctl(a, () => globalThis.__numinia.misiones.resumen()),
    panel: await ctl(a, () => [...document.querySelectorAll("#libro ul.hechas li")].map((li) => li.getAttribute("aria-label"))),
    avisos: await ctl(a, () => globalThis.__numinia.session.features.announcements.filter((x) => x.feature === "misiones").map((x) => x.text)),
    dibujo: await ctl(a, () => ({ objetos: globalThis.__numinia.view.objects(), nombres: globalThis.__numinia.view.tagCount(), coste: globalThis.__numinia.cost() })),
    marcas: await ctl(a, () => globalThis.__numinia.misiones.marcas()), // U14 (4): Alma and Bruno ✓ once the quest is done
  };
  await foto(a, "4-hecha");
  nota("hecha");
  // 5. tab B: another guest sees the people, never A's quest
  const b = await abrir();
  await b.bringToFront();
  await esperar(b, () => globalThis.__numinia.session.features.cards().some((c) => c.feature === "pnj" && c.key === "alma"), null, 10000);
  await b.waitForTimeout(800);
  out.b = await ctl(b, () => {
    const f = globalThis.__numinia.session.features;
    return { personas: f.cards().filter((c) => c.feature === "pnj").map((c) => `${c.role}: ${c.name}`), eventos: f.log.filter((e) => e.feature === "misiones" && e.event !== "libro" && e.event !== "marcas").map((e) => e.event), libro: globalThis.__numinia.misiones.libro().length, who: globalThis.__numinia.session.who.id, marcas: globalThis.__numinia.misiones.marcas() };
  });
  out.b.otroInvitado = out.b.who !== (await ctl(a, () => globalThis.__numinia.session.who.id));
  nota("B");
  const ob1ok = ob1 && ob1.x === 18 && ob1.z === 0 && ob1.nombre === "Pilar dorado";
  ok = out.alma.card.role === "persona" && /^E: hablar con Alma, la guía$/.test(out.alma.prompt) && out.alma.dialogo.opciones.length === 2 && /^1\. /.test(out.alma.dialogo.foco ?? "")
    && out.aceptada.libro[0]?.seguida === true && ob1ok && out.aceptada.balizas > 0 && out.aceptada.mapaObjetivo >= 1 && /Primeros pasos/.test(out.aceptada.linea)
    && !out.libroAbierto.foco && /^ahora: Visita el pilar dorado/.test(out.libroAbierto.pasos[0] ?? "") && out.libroAbierto.pasos.length === 3 && out.libroAbierto.pasos.slice(1).every((t) => t.startsWith("bloqueado: "))
    && out.pilar.siguiente?.nombre === "Bruno, el farolero" && !!out.bruno.clic && out.bruno.siguiente?.nombre === "Caja de herramientas" && out.caja.prompt === "E: coger la caja"
    && out.hecha.libro[0]?.estado === "hecha" && out.hecha.objetivos.length === 0 && out.hecha.panel.some((t) => t.startsWith("Hecho: Primeros pasos en la plaza"))
    && out.hecha.dibujo.objetos.failed === 0 && out.b.personas.includes("persona: Alma, la guía") && out.b.eventos.length === 0 && out.b.libro === 0 && out.b.otroInvitado && errors.length === 0
    && out.hecha.marcas.hecho.includes("alma") && out.hecha.marcas.hecho.includes("bruno") && !out.hecha.marcas.tiene.includes("alma") // U14 (4): A is done with them
    && out.b.marcas.tiene.includes("alma") && out.b.marcas.hecho.length === 0 // B's own marks: Alma still offers it the quest
    && /^Misión completada/.test(out.banner.texto) && /Primeros pasos/.test(out.banner.texto) && /Conoce la plaza/.test(out.banner.texto) && out.banner.rol === "status" && out.banner.vivo === "polite" && out.banner.clic === "none" // U14 (6)
    && (out.bienes.emisor // N10: with a secret, the good is yours and its receipt checks; without, the sheet says none
      ? out.bienes.lista.length === 1 && out.bienes.lista[0].nombre === "Farolillo de Bruno" && out.bienes.lista[0].recibo === "nb1." && /Farolillo de Bruno/.test(out.bienes.inventario) && /Recibo firmado ✓/.test(out.bienes.inventario) && /CC0-1\.0/.test(out.bienes.inventario) && /es tuyo, firmado por este mundo/.test(out.bienes.comprobado) && out.bienes.novedad && !out.bienes.novedadTrasAbrir
      : out.bienes.lista.length === 0 && /no firma recibos de propiedad/.test(out.bienes.inventario));
} catch (e) { out.error = String(e).split("\n")[0]; }
await browser.close();
console.log(JSON.stringify(out, null, 1));
console.log(ok ? "MISIONES OK" : "MISIONES FALLA");
process.exit(ok ? 0 : 1);
