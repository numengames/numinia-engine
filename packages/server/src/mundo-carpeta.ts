// mundo-carpeta (C2, C3): ONE folder is the whole world — the same in a container (/mundo), a bare install
// (/var/lib/numinia-motor) and a dev run (tools/plaza.sh: .run). The server finds it in MOTOR_MUNDO.
//   mundo.json   what this folder is: esquema, the engine that last opened it, when (written at every start)
//   datos/       what the features keep (+ datos/activos/<sha256>.<ext> = uploads, H9)
//   aventura/    the world's OWN adventure (misiones/ pnj/ cosas/ habitantes/ …): a new world gets a copy of the
//                engine's example once; from then on it is the world's (a newer engine never swaps it)
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

export type Carpeta = { raiz: string; manifiesto: string; datos: string; activos: string; aventura: string; entorno: string; sesiones: string; claves: string };

export function carpetaMundo(raiz: string): Carpeta {
  const r = resolve(raiz);
  return { raiz: r, manifiesto: join(r, "mundo.json"), datos: join(r, "datos"), activos: join(r, "datos", "activos"), aventura: join(r, "aventura"), entorno: join(r, "entorno"), sesiones: join(r, "sesiones"), claves: join(r, "claves.env") };
}

/** A new or empty world gets the folder and a copy of the example adventure (only when it has no aventura/ at all). */
export function sembrar(c: Carpeta, log: (l: string) => void = () => {}, ejemplo: string = EJEMPLO): boolean {
  mkdirSync(c.raiz, { recursive: true });
  if (existsSync(c.aventura) || !existsSync(ejemplo)) return false;
  const tmp = join(c.raiz, `.aventura-nueva-${process.pid}`);
  cpSync(ejemplo, tmp, { recursive: true });
  renameSync(tmp, c.aventura); // whole or nothing: a half copy is never taken for the world's adventure
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
