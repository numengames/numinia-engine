// entrada: the container image's entry point (Dockerfile ENTRYPOINT). No argument (or «servidor») = the world's
// server (main.ts); copia | comprobar | importar = the world's own tools (mundo-cli.ts, C6).
// The image runs as 10001:10001. Started as root instead (a local compose.yml says user "0:0", so that a folder that
// belongs to YOUR user works with docker AND podman), it first becomes the owner of the world folder (MOTOR_MUNDO),
// so everything it writes there is yours; root is kept only where it already IS you (rootless podman or docker: a
// user namespace). A real root with a root-owned folder is refused: nothing runs as the machine's root.
import { readFileSync, statSync } from "node:fs";

const orden = process.argv[2] ?? "servidor";
const ORDENES = ["servidor", "copia", "comprobar", "importar"];
const err = (l: string) => process.stderr.write(`${l}\n`);

function rootDeVerdad(): boolean {
  try { return readFileSync("/proc/self/uid_map", "utf8").trim().split(/\s+/).join(" ") === "0 0 4294967295"; } catch { return true; }
}

/** Root → the owner of the world folder (or stays root inside a user namespace, where root is the person). */
function dejarDeSerRoot(): boolean {
  if (typeof process.getuid !== "function" || process.getuid() !== 0) return true;
  const raiz = process.env.MOTOR_MUNDO ?? "/mundo";
  let st: { uid: number; gid: number };
  try { st = statSync(raiz); } catch { st = { uid: 10001, gid: 10001 }; }
  if (st.uid === 0) {
    if (!rootDeVerdad()) return true; // rootless podman/docker: «root» here is the user who started it
    err(`[motor] ${raiz} es de root y esto corre como root de verdad: no arranco así. Da la carpeta a tu usuario (sudo chown -R "$(id -u):$(id -g)" <carpeta>) o arranca con --user 10001:10001.`);
    return false;
  }
  process.setgroups!([st.gid]); process.setgid!(st.gid); process.setuid!(st.uid);
  if (orden === "servidor") console.log(`[motor] arranco como ${st.uid}:${st.gid}, el dueño de ${raiz}`);
  return true;
}

if (!ORDENES.includes(orden)) {
  err(`uso: (sin nada) = el servidor del mundo · copia > mundo.zip · comprobar < mundo.zip · importar < mundo.zip   (no conozco «${orden}»)`);
  process.exitCode = 2;
} else if (!dejarDeSerRoot()) {
  process.exitCode = 1;
} else if (orden === "servidor") {
  // E1: the world's AI inhabitants are a process apart (packages/agent). A systemd install runs it as its own unit; here, in the
  // image, nobody would: if the world has inhabitants this process starts it (habitantes-proceso.ts has the rules and the switch,
  // MOTOR_HABITANTES=no). It is prepared BEFORE the server loads (the agents' secret goes into the environment the server reads)
  // and started AFTER it listens.
  const { prepararHabitantes } = await import("./habitantes-proceso.ts");
  const habitantes = prepararHabitantes(process.env, console.log);
  await import("./main.ts");
  if (habitantes) {
    const sup = habitantes.arrancar();
    for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => sup.parar());
    process.once("exit", () => sup.parar()); // the reload by exit 75 (a world zip), a crash, process.exit: the child never outlives the server
  }
} else {
  const cli = await import("./mundo-cli.ts");
  const raiz = process.env.MOTOR_MUNDO ?? "/mundo";
  const s = { out: process.stdout, err };
  if (orden === "copia") {
    if (process.stdout.isTTY) { err("copia: la copia es un zip: mándala a un fichero (… copia > mundo.zip)"); process.exitCode = 2; }
    else process.exitCode = await cli.copia(raiz, s);
  } else if (process.stdin.isTTY) {
    err(`${orden}: dame el zip por la entrada (… ${orden} < mundo.zip; con docker run, -i)`); process.exitCode = 2;
  } else process.exitCode = orden === "comprobar" ? await cli.comprobar(process.stdin, s) : await cli.importar(process.stdin, raiz, s);
}
