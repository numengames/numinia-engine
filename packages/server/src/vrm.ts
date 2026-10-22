// vrm (J1): read a VRM (or any GLB) without three.js — its version, licence fields, triangles — and say whether the
// house library may take it. Used by tools/avatares-catalogo.ts and the tests; uploads of avatars (H10) can reuse it.
// Validation returns Result with error paths; it never throws.
import type { Issue, Result } from "../../core/src/index.ts";

/** Same number as the page refuses at runtime (packages/render/src/avatares-politica.ts TRIANGULOS_MAX). */
export const TRIANGULOS_MAX_VRM = 10_000;

type Json = { [k: string]: unknown };
export type InfoVrm = {
  version: "0" | "1" | null; bytes: number; triangulos: number; huesos: number; imagenes: number; morfos: number;
  /** licence fields normalised across VRM 0.x and 1.0 */
  licencia: { nombre: string; comercial: boolean; redistribuir: boolean | null; autor: string; titulo: string; url: string };
  meta: Json | null;
};

export function leerGlb(bytes: Uint8Array): Result<Json> {
  const issues: Issue[] = [];
  if (bytes.length < 20) return { ok: false, issues: [{ path: "glb", message: "demasiado corto para ser un GLB" }] };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) return { ok: false, issues: [{ path: "glb.magic", message: "no empieza por «glTF»: no es un .glb/.vrm binario" }] };
  const len = dv.getUint32(12, true), type = dv.getUint32(16, true);
  if (type !== 0x4e4f534a || 20 + len > bytes.length) return { ok: false, issues: [{ path: "glb.json", message: "el primer trozo no es el JSON del glTF" }] };
  try { return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len))) as Json }; }
  catch (e) { issues.push({ path: "glb.json", message: `JSON roto: ${(e as Error).message}` }); return { ok: false, issues }; }
}

export function infoVrm(bytes: Uint8Array): Result<InfoVrm> {
  const r = leerGlb(bytes);
  if (!r.ok) return r;
  const j = r.value as { meshes?: { primitives: { mode?: number; indices?: number; attributes: Record<string, number>; targets?: unknown[] }[] }[]; accessors?: { count: number }[]; images?: unknown[]; extensions?: Json };
  let triangulos = 0, morfos = 0;
  for (const m of j.meshes ?? []) for (const p of m.primitives) {
    const n = p.indices !== undefined ? j.accessors?.[p.indices]?.count ?? 0 : j.accessors?.[p.attributes.POSITION]?.count ?? 0;
    const mode = p.mode ?? 4;
    triangulos += mode === 4 ? n / 3 : mode === 5 || mode === 6 ? Math.max(0, n - 2) : 0;
    morfos = Math.max(morfos, p.targets?.length ?? 0);
  }
  const v1 = j.extensions?.VRMC_vrm as { meta?: Json; humanoid?: { humanBones?: Json } } | undefined;
  const v0 = j.extensions?.VRM as { meta?: Json; humanoid?: { humanBones?: unknown[] } } | undefined;
  const meta = (v1?.meta ?? v0?.meta ?? null) as Json | null;
  const s = (k: string) => (typeof meta?.[k] === "string" ? (meta[k] as string) : "");
  const licencia = v1
    ? { nombre: s("licenseUrl"), comercial: ["corporation", "personalProfit"].includes(s("commercialUsage")), redistribuir: meta?.allowRedistribution === true,
        autor: Array.isArray(meta?.authors) ? (meta.authors as string[]).join(", ") : "", titulo: s("name"), url: s("otherLicenseUrl") }
    : { nombre: s("licenseName"), comercial: s("commercialUssageName") === "Allow", redistribuir: null, autor: s("author"), titulo: s("title"), url: s("otherLicenseUrl") };
  return { ok: true, value: {
    version: v1 ? "1" : v0 ? "0" : null, bytes: bytes.length, triangulos, morfos, imagenes: j.images?.length ?? 0,
    huesos: v1 ? Object.keys(v1.humanoid?.humanBones ?? {}).length : (v0?.humanoid?.humanBones ?? []).length,
    licencia, meta,
  } };
}

/** May the house library take this avatar? CC0 (said inside the file) and at most TRIANGULOS_MAX_VRM triangles. */
export function revisarAvatar(info: InfoVrm, max = TRIANGULOS_MAX_VRM): Issue[] {
  const out: Issue[] = [];
  if (!info.version) out.push({ path: "extensions", message: "no es un VRM (no tiene la extensión VRM ni VRMC_vrm)" });
  if (info.triangulos > max) out.push({ path: "meshes", message: `${info.triangulos} triángulos > ${max}: simplifica la malla (Blender: Decimate) o elige otro avatar` });
  const cc0 = info.version === "0" ? info.licencia.nombre === "CC0" : /creativecommons\.org\/publicdomain\/zero/.test(info.licencia.url);
  if (!cc0) out.push({ path: "meta.license", message: `licencia «${info.licencia.nombre || info.licencia.url || "ninguna"}»: la biblioteca de la casa solo toma CC0 u obra propia (docs/SABER.md §3.3)` });
  if (info.version === "0" && !info.licencia.comercial) out.push({ path: "meta.commercialUssageName", message: "el propio fichero no permite el uso comercial" });
  return out;
}

/** Licences a WORLD's own avatars may carry (entorno/avatares.json, E3): CC0, or CC BY with a visible credit. Never
 * the house library (revisarAvatar above stays CC0-only: that catalogue travels to every world). */
export type LicenciaMundo = "CC0" | "CC-BY";

/** What the VRM itself says about its licence, as one of the two a world may carry, or null (anything else: NC, SA, ND,
 * «Other», redistribution prohibited, nothing). VRM 0.x names it (`licenseName` CC0 | CC_BY); VRM 1.0 points at the
 * Creative Commons deed in `otherLicenseUrl`. The file is read, never rewritten: its metadata travels untouched. */
export function licenciaDeVrm(info: InfoVrm): LicenciaMundo | null {
  if (info.version === "0") return info.licencia.nombre === "CC0" ? "CC0" : info.licencia.nombre === "CC_BY" ? "CC-BY" : null;
  if (info.version === "1") {
    if (/creativecommons\.org\/publicdomain\/zero/.test(info.licencia.url)) return "CC0";
    if (/creativecommons\.org\/licenses\/by\/\d/.test(info.licencia.url)) return "CC-BY";
  }
  return null;
}

/** May a world carry this avatar? A VRM, at most `max` triangles, whose own licence is CC0 or CC BY and is the one the
 * world declares (a CC BY file cannot be listed as CC0: that would be relicensing it), and that allows commercial use. */
export function revisarAvatarDelMundo(info: InfoVrm, declarada: LicenciaMundo, max = TRIANGULOS_MAX_VRM): Issue[] {
  const out: Issue[] = [];
  if (!info.version) out.push({ path: "extensions", message: "no es un VRM (no tiene la extensión VRM ni VRMC_vrm)" });
  if (info.triangulos > max) out.push({ path: "meshes", message: `${info.triangulos} triángulos > ${max}: simplifica la malla (Blender: Decimate) o elige otro avatar` });
  const propia = licenciaDeVrm(info);
  if (!propia) out.push({ path: "meta.license", message: `licencia «${info.licencia.nombre || info.licencia.url || "ninguna"}» dentro del fichero: un mundo solo lleva avatares CC0 o CC BY` });
  else if (propia !== declarada) out.push({ path: "meta.license", message: `avatares.json dice ${declarada} pero el fichero dice ${propia}: la licencia del fichero no se reescribe, declárala como es` });
  if (!info.licencia.comercial) out.push({ path: info.version === "1" ? "meta.commercialUsage" : "meta.commercialUssageName", message: "el propio fichero no permite el uso comercial" });
  if (info.version === "1" && info.licencia.redistribuir !== true) out.push({ path: "meta.allowRedistribution", message: "el propio fichero no permite redistribuirlo (allowRedistribution)" });
  return out;
}
