// deploy-check: the local stand-in for "install it on a clean server" when no container is available.
// Usage: node tools/deploy-check.mjs [path/to/node]   (default: the node running this script)
// Unpacks deploy/instalar-motor.sh with --solo-extraer into $TMPDIR, checks the page files, starts the
// unpacked server on a spare port (8793) with the given node, connects one client and waits for snapshots.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { webSocketClient } from "../packages/net/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";

const root = join(fileURLToPath(import.meta.url), "../..");
const node = process.argv[2] ?? process.execPath;
const PORT = Number(process.env.DEPLOY_CHECK_PORT ?? 8793);
const AGENTES = "deploy-check-agentes-secreto-0001";
const ADMIN = "deploy-check-codigo-de-administracion";
const dir = join(process.env.TMPDIR ?? "/tmp", `numinia-deploy-check-${PORT}`);
const mundo = join(dir, "mundo"); // C2: the world folder, as a container's /mundo or the installer's /var/lib/numinia-motor
let srv = null, hab = null, habLog = "";
const fail = (msg) => { srv?.kill(); hab?.kill(); console.error(`[deploy-check] FALLA: ${msg}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const installer = join(root, "deploy/instalar-motor.sh");
if (!existsSync(installer)) fail("no existe deploy/instalar-motor.sh: genera antes con `npm run deploy`");
rmSync(dir, { recursive: true, force: true });
const x = spawnSync("bash", [installer, "--solo-extraer", dir], { encoding: "utf8" });
if (x.status !== 0) fail(`--solo-extraer: ${x.stderr}`);

// the page: index.html and every file it references must be there
const html = readFileSync(join(dir, "www/index.html"), "utf8");
const refs = [...html.matchAll(/(?:src|href)="\/?([^"#?]+)"/g)].map((m) => m[1]).filter((r) => !r.includes("://"));
for (const r of refs) if (!existsSync(join(dir, "www", r))) fail(`la página pide ${r} y no está en www/`);
if (!existsSync(join(dir, "app/activos/robot/RobotExpressive.glb"))) fail("falta la biblioteca de la casa (app/activos/robot/RobotExpressive.glb)");
if (spawnSync("bash", ["-n", join(dir, "actualizar.sh")]).status !== 0) fail("falta actualizar.sh (el que usa --auto-actualizar) o no es bash válido");
const sello = JSON.parse(readFileSync(join(dir, "app/build.json"), "utf8"));
if (!/^[0-9a-f]{40}$/.test(sello.commit) || !sello.build) fail(`app/build.json no lleva build y commit: ${JSON.stringify(sello)}`);

// the server, from the unpacked copy only (cwd = app/, like the systemd unit and the image), on a NEW world folder,
// serving its own page (WWW_DIR, as the image does) with the fleet's key names (JWT_SECRET, ADMIN_CODE)
const version = spawnSync(node, ["--version"], { encoding: "utf8" }).stdout.trim();
const entorno = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MOTOR_ADMIN|MOTOR_SECRET|DATOS_DIR|ACTIVOS_DIR|SESIONES_DIR|AVENTURA_DIR|MUNDO_DIR|ENGINE_BUILD|ENGINE_COMMIT)$/.test(k)));
srv = spawn(node, ["packages/server/src/main.ts"], { cwd: join(dir, "app"), env: { ...entorno, PORT: String(PORT), HOST: "127.0.0.1", STATS_MS: "60000", MOTOR_AGENTES_SECRET: AGENTES, ADMIN_CODE: ADMIN, JWT_SECRET: "c".repeat(64), MOTOR_MUNDO: mundo, WWW_DIR: join(dir, "www"), MOTOR_CONSTRUIR: "todos" } });
let log = "";
srv.stdout.on("data", (d) => { log += d; });
srv.stderr.on("data", (d) => { log += d; });
// P4: the inhabitants' service from the same unpacked copy (the second systemd unit), with the same agents' secret
const stop = () => { srv.kill(); hab?.kill(); };
try {
  for (let i = 0; i < 40 && !log.includes("[instancia]"); i++) await sleep(100);
  if (!log.includes("[instancia]")) fail(`el servidor desempaquetado no arrancó con node ${version}:\n${log}`);
  const t = webSocketClient(`ws://127.0.0.1:${PORT}`);
  const s = new ClientSession(t);
  await t.opened;
  const t0 = performance.now();
  while (s.stats.snapshots < 10 && performance.now() - t0 < 5000) { s.tick(10, 0); await sleep(50); }
  t.close();
  if (!s.welcome) fail("no llegó el saludo (welcome) del servidor");
  if (s.stats.snapshots < 10) fail(`solo ${s.stats.snapshots} snapshots en 5 s`);
  const get = (p) => fetch(`http://127.0.0.1:${PORT}${p}`).then((r) => r.json()).catch(() => null);
  const health = await get("/health");
  if (!health?.ok) fail(`/health no responde ok: ${JSON.stringify(health)}`);
  const m = await get("/metrics");
  if (!(m?.conectados >= 0 && m?.tickMs)) fail(`/metrics no responde: ${JSON.stringify(m)}`);
  // C4: /status in the shape the Worlds room reads, with this build's commit
  const st = await get("/status");
  if (!(Number.isInteger(st?.uptime) && st.conectados === 0 && st.commitHash === sello.commit && st.version === sello.build)) fail(`/status no es {uptime, conectados, commitHash, version} de este build: ${JSON.stringify(st)}`);
  // C1: the engine serves its own page (index.html + every file it links), index revalidated, hashed assets immutable
  const indice = await fetch(`http://127.0.0.1:${PORT}/`).catch(() => null);
  if (indice?.status !== 200 || indice.headers.get("cache-control") !== "no-cache" || !(await indice.text()).includes("<html")) fail(`la página no se sirve en /: ${indice?.status}`);
  for (const r of refs) {
    const x = await fetch(`http://127.0.0.1:${PORT}/${r}`).catch(() => null);
    if (x?.status !== 200 || (r.startsWith("assets/") && x.headers.get("cache-control") !== "public, max-age=31536000, immutable")) fail(`/${r}: ${x?.status} ${x?.headers.get("cache-control")}`);
    await x.arrayBuffer();
  }
  if ((await fetch(`http://127.0.0.1:${PORT}/..%2f..%2fapp%2fbuild.json`).catch(() => null))?.status !== 404) fail("la página deja salir de www/");
  // C2: a new world got its own adventure (Alma, Bruno, Lía) and its manifest
  for (const f of ["aventura/pnj/alma.json", "aventura/pnj/bruno.json", "aventura/habitantes/lia.json", "mundo.json"]) if (!existsSync(join(mundo, f))) fail(`el mundo nuevo no tiene ${f}`);
  if (!/aventura: 1 misiones, 2 personas, 1 cosas/.test(log)) fail(`no leyó la aventura del mundo:\n${log}`);
  if (existsSync(join(mundo, "claves.env"))) fail("con claves en el entorno (JWT_SECRET, ADMIN_CODE) no debe escribir claves.env");
  if (log.includes(ADMIN) || log.includes("c".repeat(64))) fail("el registro enseña una clave");
  // H1: the house library is served by its sha256 (the robot, CC0)
  const robot = await fetch(`http://127.0.0.1:${PORT}/a/047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319.glb`).catch(() => null);
  if (robot?.status !== 200 || robot.headers.get("content-type") !== "model/gltf-binary") fail(`/a/<sha256>.glb no sirve el robot: ${robot?.status}`);
  // H9: uploads answer (a page asks HEAD first; a PUT without the guest token is refused, never stored)
  const head = await fetch(`http://127.0.0.1:${PORT}/a/047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319.glb`, { method: "HEAD" }).catch(() => null);
  const put = await fetch(`http://127.0.0.1:${PORT}/a/${"0".repeat(64)}.glb`, { method: "PUT", body: "x" }).catch(() => null);
  if (head?.status !== 200 || put?.status !== 401) fail(`subidas (H9): HEAD ${head?.status} (quiero 200), PUT sin billete ${put?.status} (quiero 401)`);
  // the world as a zip: the page answers, no code = 401, with the code a zip that unzip accepts
  const pagina = await fetch(`http://127.0.0.1:${PORT}/mundo`).catch(() => null);
  const sinCodigo = await fetch(`http://127.0.0.1:${PORT}/mundo/zip`).catch(() => null);
  const zip = await fetch(`http://127.0.0.1:${PORT}/mundo/zip`, { headers: { authorization: `Bearer ${ADMIN}` } }).catch(() => null);
  if (pagina?.status !== 200 || sinCodigo?.status !== 401 || zip?.status !== 200) fail(`/mundo: página ${pagina?.status} (200), sin código ${sinCodigo?.status} (401), zip ${zip?.status} (200)`);
  writeFileSync(join(dir, "mundo.zip"), Buffer.from(await zip.arrayBuffer()));
  const tz = spawnSync("unzip", ["-t", join(dir, "mundo.zip")], { encoding: "utf8" });
  if (tz.status !== 0) fail(`el zip del mundo no pasa unzip -t:\n${tz.stdout}${tz.stderr}`);
  // C5: mundo@2 carries the adventure and the run-it-yourself extras, never keys or sessions
  const lista = spawnSync("unzip", ["-Z1", join(dir, "mundo.zip")], { encoding: "utf8" }).stdout.split("\n");
  for (const f of ["mundo.json", "aventura/pnj/alma.json", "aventura/pnj/bruno.json", "aventura/misiones/primeros-pasos.json", "compose.yml", "arrancar.sh", "LEEME.txt"]) if (!lista.includes(f)) fail(`el zip no lleva ${f}: ${lista.join(" ")}`);
  if (lista.some((f) => /claves|sesiones\/|subidas\.jsonl/.test(f))) fail(`el zip lleva lo que no debe: ${lista.join(" ")}`);
  // C6: the image's «comprobar», from the unpacked copy, reads it
  const comp = spawnSync(node, ["packages/server/src/entrada.ts", "comprobar"], { cwd: join(dir, "app"), input: readFileSync(join(dir, "mundo.zip")), encoding: "utf8" });
  if (comp.status !== 0 || !/^vale: numinia-engine\/mundo@2/.test(comp.stdout)) fail(`comprobar no acepta el zip del mundo: ${comp.stdout}${comp.stderr}`);
  hab = spawn(node, ["packages/agent/src/main.ts"], { cwd: join(dir, "app"), env: { ...process.env, MOTOR_URL: `ws://127.0.0.1:${PORT}`, MOTOR_AGENTES_SECRET: AGENTES, STATS_MS: "60000", CEREBRO_ECO: "1", AVENTURA_DIR: join(mundo, "aventura") } });
  hab.stdout.on("data", (d) => { habLog += d; }); hab.stderr.on("data", (d) => { habLog += d; });
  for (let i = 0; i < 50 && !habLog.includes("el motor me llama"); i++) await sleep(100);
  const nombre = habLog.match(/el motor me llama «([^»]+)»/)?.[1];
  if (!nombre?.endsWith(" · IA")) fail(`el servicio de habitantes no entró como IA:\n${habLog}\n${log.split("\n").filter((l) => l.includes("agentes") || l.includes("habitantes")).join("\n")}`);
  // P5a: the packaged service thinks (echo brain: no provider) and builds through the world's verbs with the house library
  if (!/cerebro: eco para Lía/.test(habLog)) fail(`el servicio de habitantes no enchufó el cerebro:\n${habLog}`);
  const tg = webSocketClient(`ws://127.0.0.1:${PORT}`), gs = new ClientSession(tg);
  await tg.opened;
  const dicho = [];
  gs.features.tap((f, e, m) => { if (f === "chat" && (e === "dicho" || e === "zona")) dicho.push(`${m.nombre}: ${m.texto}`); });
  const t1 = performance.now();
  while (!gs.features.catalog && performance.now() - t1 < 3000) { gs.tick(0, 0); await sleep(50); }
  gs.features.send("chat", "decirZona", { texto: 'Lía, pon un bloque [accion: colocar {"modelo":"bloque","x":1,"z":1,"nombre":"prueba"}]' });
  while ((gs.features.stateOf("objetos").size === 0 || !dicho.some((d) => d.startsWith(`${nombre}: eco:`))) && performance.now() - t1 < 8000) { gs.tick(0, 0); await sleep(50); }
  tg.close();
  const puesto = [...gs.features.stateOf("objetos").values()][0];
  if (puesto?.nombre !== "prueba" || !dicho.some((d) => d.startsWith(`${nombre}: eco:`))) fail(`Lía no construyó con el cerebro de eco: objetos ${gs.features.stateOf("objetos").size}, chat ${JSON.stringify(dicho)}\n${habLog}`);
  const fp = log.match(/huella de referencia ([0-9a-f]+)/)?.[1];
  console.log(`[deploy-check] OK · node ${version} · ${sello.build} (${sello.commit.slice(0, 12)}…) · página ${refs.length} ficheros enlazados, servida por el motor · ${s.stats.snapshots} snapshots en ${Math.round(performance.now() - t0)} ms · huella ${fp} · /health, /status, /metrics, /a/, subidas y /mundo (zip mundo@2 con aventura, compose.yml y arrancar.sh; comprobar OK) · mundo nuevo con su aventura (Alma, Bruno) · habitante «${nombre}» dentro, piensa (eco) y construye (RSS ${m.memoriaMB.rss} MB)`);
} finally { stop(); }
