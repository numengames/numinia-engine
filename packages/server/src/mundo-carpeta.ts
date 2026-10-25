// mundo-carpeta (C2, C3): ONE folder is the whole world — the same in a container (/mundo), a bare install
// (/var/lib/numinia-motor) and a dev run (tools/plaza.sh: .run). The server finds it in MOTOR_MUNDO.
//   mundo.json   what this folder is: esquema, the engine that last opened it, when (written at every start)
//   datos/       what the features keep (+ datos/activos/<sha256>.<ext> = uploads, H9). datos/roles also keeps the
//                world's settings (ADR-074, file over app): whether @todos builds (in its roles) and voice on/off
//                (config.voz). MOTOR_CONSTRUIR / MOTOR_VOZ only seed a world that never stored them; then /construir, /voz
//   aventura/    the world's OWN adventure (misiones/ pnj/ cosas/ habitantes/ …): a NEW world is born with the Taller onboarding
//                (plantillas/taller: Lumen + the 11 build-a-world missions + one sample cable, and nothing else); from then on it
//                is the world's (a newer engine never swaps it). A folder that already holds a world's parts but no aventura/
//                (an old install) still gets a copy of the engine's example, as before.
//                aventura/ficha.json (ficha@1, optional, aventura.ts) says what the world is called, what it is about
//                and its cover (<sha256>.png|jpg|webp in datos/activos/ or the library): the page title and /status
//                aventura/agentes/<id>.json (agente@1, ADR-080): the outside AIs this world lets in, each by its PUBLIC
//                Ed25519 key (its private key stays where the agent runs); owners add/remove them with /agente añadir|quitar
//   entorno/     entorno.json, elementos.json (optional; absent = the house defaults)
//   sesiones/    how each player entered (T1; never zipped)
//   claves.env   only for a local run without keys in the environment (mode 600; never zipped)
// Keys (C3): the server's secret is MOTOR_SECRET, else JWT_SECRET (the fleet's key file); the administration code is
// MOTOR_ADMIN, else ADMIN_CODE. Without them and with a world folder, they are made ONCE into claves.env and the log
// says where the code is — never the code itself.
import { randomBytes } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Motor } from "./version.ts";

export const ESQUEMA_MUNDO = "numinia-engine/mundo@2";
/** The adventure a new world starts with (shipped inside the engine: aventuras/ejemplo). */
export const EJEMPLO = fileURLToPath(new URL("../../../aventuras/ejemplo", import.meta.url));
/** Primera vez: what a NEW world is born with, shipped inside the engine (plantillas/taller/{aventura,entorno}; the installer and the image carry it). */
export const TALLER = fileURLToPath(new URL("../../../plantillas/taller", import.meta.url));

export type Carpeta = { raiz: string; manifiesto: string; datos: string; activos: string; aventura: string; entorno: string; sesiones: string; claves: string };

export function carpetaMundo(raiz: string): Carpeta {
  const r = resolve(raiz);
  return { raiz: r, manifiesto: join(r, "mundo.json"), datos: join(r, "datos"), activos: join(r, "datos", "activos"), aventura: join(r, "aventura"), entorno: join(r, "entorno"), sesiones: join(r, "sesiones"), claves: join(r, "claves.env") };
}

/** H8: what a NEW world's entorno/espacio-base.json says (kept equal to features/espaciobase/server.ts `ficheroNuevo()`; a test compares): on, default seed. */
export const ESPACIO_BASE_NUEVO = { schema: "numinia-engine/espacio-base@1", activa: true, semilla: 42 };

/** A folder is NEW when it holds none of a world's parts (no aventura/, entorno/, datos/ nor mundo.json): numinia.com's «crear mundo» and a
 * first start both hand the engine exactly that. Anything else is a world that exists and is never re-born. */
export const esMundoNuevo = (c: Carpeta): boolean => !existsSync(c.aventura) && !existsSync(c.entorno) && !existsSync(c.datos) && !existsSync(c.manifiesto);

/** Copy `de` to `a` whole or nothing (a half copy is never taken for the world's own folder). */
function copiarEntero(de: string, a: string, raiz: string): void {
  const tmp = join(raiz, `.${a.split("/").pop()}-nueva-${process.pid}`);
  cpSync(de, tmp, { recursive: true });
  renameSync(tmp, a);
}

/** A NEW world is born with the Taller onboarding and nothing else: the base space look (entorno/espacio-base.json on), Lumen, the 11
 * missions that teach to build a world (aventura/) and the sample cable «Botón rojo» (entorno/disparadores.json); the house's fishing pond,
 * dartboard, creature and Ancestors hall are written EMPTY so the new world has none of them (they are all files: the owner adds them later).
 * Everything lands as plain files in the folder. A world that already exists is never touched: one with a part of its own but no aventura/
 * (an old install) gets the example adventure as it always did; one with an aventura/ gets nothing. Returns true when it seeded an aventura/. */
export function sembrar(c: Carpeta, log: (l: string) => void = () => {}, ejemplo: string = EJEMPLO, taller: string = TALLER): boolean {
  const nuevo = esMundoNuevo(c);
  mkdirSync(c.raiz, { recursive: true });
  if (nuevo && existsSync(join(taller, "aventura")) && existsSync(join(taller, "entorno"))) {
    copiarEntero(join(taller, "entorno"), c.entorno, c.raiz);
    copiarEntero(join(taller, "aventura"), c.aventura, c.raiz);
    log(`[mundo] mundo nuevo: nace con el onboarding del Taller (Lumen, 11 misiones y un cable de muestra; ${c.aventura}, ${c.entorno}); nace en el espacio base y desde ahora es suyo`);
    return true;
  }
  if (!existsSync(c.aventura) && !existsSync(c.entorno)) {
    mkdirSync(c.entorno, { recursive: true });
    writeFileSync(join(c.entorno, "espacio-base.json"), JSON.stringify(ESPACIO_BASE_NUEVO, null, 2) + "\n");
    log(`[mundo] mundo nuevo: nace en el espacio base (${join(c.entorno, "espacio-base.json")}); se apaga o se cambia desde Construir → Entorno`);
  }
  if (existsSync(c.aventura) || !existsSync(ejemplo)) return false;
  copiarEntero(ejemplo, c.aventura, c.raiz);
  log(`[mundo] mundo nuevo: su aventura es una copia de la de ejemplo (${c.aventura}); desde ahora es suya`);
  return true;
}

/** mundo.json on disk: what this folder is and which engine opened it last (tmp + rename). */
export function escribirManifiesto(c: Carpeta, motor: Motor, cuando = new Date()): void {
  const tmp = `${c.manifiesto}.tmp`;
  writeFileSync(tmp, JSON.stringify({ esquema: ESQUEMA_MUNDO, motor, creado: cuando.toISOString() }, null, 1) + "\n");
  renameSync(tmp, c.manifiesto);
}

export type Claves = { secreto?: string; admin?: string; dondeCodigo: string };
const LINEA = /^(MOTOR_SECRET|MOTOR_ADMIN)=([A-Za-z0-9_-]{16,128})$/;
const nueva = () => randomBytes(24).toString("hex");

/** C3: the keys this run uses and where the administration code can be read (never the code). */
export function claves(env: Record<string, string | undefined>, c: Carpeta | null, log: (l: string) => void = () => {}): Claves {
  let secreto = env.MOTOR_SECRET || env.JWT_SECRET || undefined;
  let admin = env.MOTOR_ADMIN || env.ADMIN_CODE || undefined;
  const de = env.MOTOR_ADMIN ? "MOTOR_ADMIN" : env.ADMIN_CODE ? "ADMIN_CODE" : null;
  let dondeCodigo = de === "ADMIN_CODE" ? "te lo da la sala de Mundos de numinia.com (el código del mundo)"
    : de ? "en un servidor instalado con instalar-motor.sh: sudo cat /opt/numinia-engine/admin.env" : "este servidor no tiene código";
  if (secreto && admin) { log(`[claves] del entorno (${env.MOTOR_SECRET ? "MOTOR_SECRET" : "JWT_SECRET"}, ${de})`); return { secreto, admin, dondeCodigo }; }
  if (!c) return { secreto, admin, dondeCodigo };
  // a local run: what is missing comes from claves.env, made once
  const leidas: Record<string, string> = {};
  if (existsSync(c.claves)) {
    for (const l of readFileSync(c.claves, "utf8").split("\n")) { const m = LINEA.exec(l.trim()); if (m) leidas[m[1]] = m[2]; }
    if ((statSync(c.claves).mode & 0o077) !== 0) { chmodSync(c.claves, 0o600); log(`[claves] ${c.claves} se podía leer por otros: ahora solo tú (600)`); }
  }
  const hechas: string[] = [];
  if (!leidas.MOTOR_SECRET) { leidas.MOTOR_SECRET = nueva(); hechas.push("MOTOR_SECRET"); }
  if (!leidas.MOTOR_ADMIN) { leidas.MOTOR_ADMIN = nueva(); hechas.push("MOTOR_ADMIN"); }
  if (hechas.length) {
    const tmp = `${c.claves}.tmp-${process.pid}`;
    writeFileSync(tmp, `# Claves de este mundo para arrancarlo en local (las hizo el motor). No van nunca en el zip del mundo.\nMOTOR_SECRET=${leidas.MOTOR_SECRET}\nMOTOR_ADMIN=${leidas.MOTOR_ADMIN}\n`, { mode: 0o600 });
    renameSync(tmp, c.claves);
  }
  secreto ??= leidas.MOTOR_SECRET;
  if (!admin) { admin = leidas.MOTOR_ADMIN; dondeCodigo = `en ${c.claves} (MOTOR_ADMIN=…)`; }
  log(`[claves] ${hechas.length ? `hechas una vez en ${c.claves} (600)` : `de ${c.claves}`}: el código de administración está ${dondeCodigo.startsWith("en ") ? dondeCodigo.slice(3) : dondeCodigo}; escribe /dueño <código> en el chat del mundo`);
  return { secreto, admin, dondeCodigo };
}
