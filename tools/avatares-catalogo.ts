// tools/avatares-catalogo.ts — writes activos/avatares/catalogo.json: the house avatars (VRM, CC0) and animations
// (.vrma from tools/vrma/convertir.mjs) the plaza draws, each by its sha256 (served at /a/<sha256>.<ext>).
// Refuses any avatar that is not CC0 inside its own file or has more than 10,000 triangles.
// Usage: node tools/avatares-catalogo.ts      (after adding a .vrm to activos/avatares/ or rerunning the converter)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { infoVrm, revisarAvatar, TRIANGULOS_MAX_VRM } from "../packages/server/src/vrm.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const AV = join(ROOT, "activos/avatares"), AN = join(ROOT, "activos/animaciones");
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
// where each file came from (the licence is read from the file itself; LICENCIAS.md has the whole story)
const FUENTES: Record<string, string> = {
  "100Avatars_027_Astrodisco.vrm": "https://github.com/PolygonalMind/100Avatars/blob/ff07c2ad0017819c4e5366656ee1e5bcc4029bd4/100Avatars_027/100Avatars_027_Astrodisco.vrm",
  "100Avatars_029_Skelly.vrm": "https://github.com/PolygonalMind/100Avatars/blob/ff07c2ad0017819c4e5366656ee1e5bcc4029bd4/100Avatars_029/100Avatars_029_Skelly.vrm",
  "100Avatars_051_Polybot.vrm": "https://github.com/PolygonalMind/100Avatars/blob/ff07c2ad0017819c4e5366656ee1e5bcc4029bd4/100Avatars_051/100Avatars_051_Polybot.vrm",
};

const modelos: Record<string, unknown>[] = [];
let mal = 0;
for (const f of readdirSync(AV).filter((n) => n.endsWith(".vrm")).sort()) {
  const bytes = new Uint8Array(readFileSync(join(AV, f)));
  const r = infoVrm(bytes);
  const problemas = r.ok ? revisarAvatar(r.value) : r.issues;
  if (!r.ok || problemas.length) { mal++; console.error(`RECHAZADO ${f}: ${problemas.map((p) => `${p.path}: ${p.message}`).join("; ")}`); continue; }
  const i = r.value;
  modelos.push({
    id: i.licencia.titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-") || f, nombre: i.licencia.titulo || f, fichero: `activos/avatares/${f}`, sha256: sha(bytes),
    bytes: i.bytes, triangulos: i.triangulos, vrm: i.version, licencia: i.licencia.nombre, autor: i.licencia.autor, fuente: FUENTES[f] ?? "",
  });
}
const conv = JSON.parse(readFileSync(join(AN, "conversion.json"), "utf8")) as { fuente: string; clips: Record<string, { from: string; duration: number; speedPerHipHeight: number }> };
const animaciones: Record<string, unknown> = {};
for (const [nombre, c] of Object.entries(conv.clips)) {
  const bytes = new Uint8Array(readFileSync(join(AN, `${nombre}.vrma`)));
  animaciones[nombre] = { fichero: `activos/animaciones/${nombre}.vrma`, sha256: sha(bytes), bytes: bytes.length, duracion: c.duration, origen: c.from, pasoPorCadera: c.speedPerHipHeight };
}
const catalogo = {
  schema: "numinia-engine/avatares@1",
  describe: `Avatares VRM y animaciones .vrma de la casa (J1). Cada fichero por su sha256; el servidor lo sirve en /a/<sha256>.vrm|.vrma. Solo CC0 (licencia comprobada dentro del fichero y en su fuente: LICENCIAS.md) y como mucho ${TRIANGULOS_MAX_VRM} triángulos. pasoPorCadera = velocidad natural del ciclo en alturas de cadera por segundo. Lo escribe tools/avatares-catalogo.ts; test/avatares-biblioteca.test.ts lo comprueba.`,
  animacionesFuente: conv.fuente,
  modelos, animaciones,
};
writeFileSync(join(AV, "catalogo.json"), JSON.stringify(catalogo, null, 1) + "\n");
console.log(`catalogo.json: ${modelos.length} avatares, ${Object.keys(animaciones).length} animaciones${mal ? `, ${mal} rechazados` : ""}`);
process.exit(mal ? 1 : 0);
