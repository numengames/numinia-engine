// avatar (H10): choose one of the house avatars or drop your own .vrm. Shown to every visitor (unlike H9's panel,
// builders only): a small floating panel, open with the "Avatar" button top-right. Picking a house avatar sends
// avatar.elegir with its index; picking a file is checked right here (packages/server/src/vrm.ts: CC0, <= 10,000
// triangles — the same rule the house catalogue itself follows) BEFORE it is ever uploaded, then goes up the same
// way as H9 (PUT /a/<sha256>.vrm with the guest token) and avatar.elegir tells the server which one it is.
// The choice is saved with your identity (I1) and reaches everyone through shared `state` (features/avatar);
// `eleccion()` below turns it into a model index packages/render/src/avatares.ts can draw — a chosen upload is
// pushed once into the SAME `catalogo.modelos` array the house avatars live in, so avatares.ts needs no new code
// path for it (R-1: one way to wear a VRM, whoever it belongs to).
import { comprobarFichero, sha256Hex } from "../../packages/net/src/ficheros.ts";
import { infoVrm, revisarAvatar } from "../../packages/server/src/vrm.ts";
import type { CatalogoAvatares } from "../../packages/render/src/index.ts";

type Msg = Record<string, unknown>;
type Res = { ok: true } | { ok: false; why: string };
type Eleccion = { tipo: "casa" | "subido"; modelo: number; sha: string; ext: string };

export type OpcionesAvatar = {
  session: {
    entity: number;
    features: { send(feature: string, intent: string, msg: Msg): Res; stateOf(feature: string): ReadonlyMap<string, Msg> };
  };
  catalogo: CatalogoAvatares | undefined;
  origen: string;           // the instance's server, where /a/ lives (http://host:port)
  billete: () => string | null; // the guest token the page keeps (localStorage numinia.invitado)
};

const CSS = `
#avatar-boton { position: fixed; top: 10px; right: 10px; z-index: 9; }
#avatar-panel { position: fixed; top: 46px; right: 10px; z-index: 9; background: rgba(20, 24, 30, .92); color: #eef2f6;
  border-radius: 10px; padding: 10px; width: 230px; display: none; }
#avatar-panel.abierto { display: block; }
#avatar-panel button { display: block; width: 100%; margin: 4px 0; text-align: left; }
#avatar-estado { font-size: 12px; opacity: .85; margin-top: 6px; min-height: 28px; }
`;

const huella = async (b: Uint8Array): Promise<string> => {
  const sutil = (globalThis.crypto as Crypto | undefined)?.subtle; // only in secure contexts (https, localhost)
  if (!sutil) return sha256Hex(b);
  const d = new Uint8Array(await sutil.digest("SHA-256", b));
  return Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
};

export function montarAvatar(o: OpcionesAvatar) {
  const estilo = document.createElement("style"); estilo.textContent = CSS; document.head.appendChild(estilo);
  const boton = document.createElement("button"); boton.id = "avatar-boton"; boton.type = "button"; boton.textContent = "Avatar";
  boton.title = "Elegir uno de los avatares de la casa o subir tu .vrm";
  const panel = document.createElement("div"); panel.id = "avatar-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Elegir avatar");
  const estado = document.createElement("p"); estado.id = "avatar-estado"; estado.setAttribute("role", "status"); estado.setAttribute("aria-live", "polite");
  const decir = (t: string) => { estado.textContent = t; };

  const casas = o.catalogo?.modelos ?? [];
  const subidos = new Map<string, number>(); // "sha.ext" -> index pushed into casas (shared with avatares.ts)
  function indiceDe(sha: string, ext: string): number {
    const k = `${sha}.${ext}`;
    let i = subidos.get(k);
    if (i === undefined) { i = casas.length + subidos.size; subidos.set(k, i); casas.push({ nombre: "Avatar subido", url: `${o.origen}/a/${sha}.${ext}` }); }
    return i;
  }

  for (const [i, m] of casas.entries()) {
    const b = document.createElement("button"); b.type = "button"; b.textContent = m.nombre;
    b.addEventListener("click", () => {
      const r = o.session.features.send("avatar", "elegir", { tipo: "casa", modelo: i, sha: "", ext: "" });
      decir(r.ok ? `Avatar: ${m.nombre}.` : `No se pudo: ${r.why}`);
    });
    panel.appendChild(b);
  }

  const entrada = document.createElement("input");
  entrada.type = "file"; entrada.accept = ".vrm"; entrada.hidden = true;
  const subirBtn = document.createElement("button"); subirBtn.type = "button"; subirBtn.textContent = "Subir tu .vrm…";
  subirBtn.title = `CC0 (de ti o libre de derechos) y como mucho 10.000 triángulos.`;
  subirBtn.addEventListener("click", () => entrada.click());
  entrada.addEventListener("change", () => {
    const file = entrada.files?.[0]; entrada.value = "";
    if (file) void subirVrm(file);
  });

  async function subirVrm(file: File): Promise<void> {
    const billete = o.billete();
    if (!billete) return decir("Aún no sé quién eres: espera un segundo y vuelve a probar.");
    decir(`Leyendo «${file.name}»…`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const valido = comprobarFichero("vrm", bytes);
    if (!valido.ok) return decir(`No vale: ${valido.issues[0]?.message ?? "fichero roto"}.`);
    const info = infoVrm(bytes);
    if (!info.ok) return decir(`No es un VRM: ${info.issues[0]?.message ?? "fichero roto"}.`);
    const problemas = revisarAvatar(info.value);
    if (problemas.length) return decir(problemas[0].message);
    const sha = await huella(bytes), url = `${o.origen}/a/${sha}.vrm`;
    decir("Comprobando si ya está en el servidor…");
    const ya = await fetch(url, { method: "HEAD", cache: "no-store" }).then((r) => r.status === 200, () => false);
    if (!ya) {
      decir(`Subiendo «${file.name}»…`);
      const r = await fetch(url, { method: "PUT", headers: { authorization: `Bearer ${billete}`, "content-type": "model/gltf-binary" }, body: bytes });
      if (r.status !== 200 && r.status !== 201) {
        let m = ""; try { m = String((await r.json()).error ?? ""); } catch { /* not JSON */ }
        return decir(`No se pudo subir: ${m || `el servidor dijo ${r.status}`}.`);
      }
    }
    indiceDe(sha, "vrm"); // avatares.ts draws it from the same catalogue the house avatars are in
    const r = o.session.features.send("avatar", "elegir", { tipo: "subido", modelo: 0, sha, ext: "vrm" });
    decir(r.ok ? `Avatar: tu .vrm (${info.value.triangulos} triángulos).` : `No se pudo: ${r.why}`);
  }
  panel.append(subirBtn, entrada, estado);

  boton.addEventListener("click", () => panel.classList.toggle("abierto"));
  document.body.append(boton, panel);

  return {
    /** packages/render/src/avatares.ts `eleccion`: turn this entity's avatar.state into a model index in
     * `o.catalogo.modelos` (the same array avatares.ts reads), or undefined to keep the old per-entity default. */
    eleccion(clave: number | "yo"): number | undefined {
      const entidad = clave === "yo" ? o.session.entity : clave;
      if (entidad < 0) return undefined;
      const v = o.session.features.stateOf("avatar").get(String(entidad)) as Eleccion | undefined;
      if (!v) return undefined;
      if (v.tipo === "casa") return casas.length ? (((v.modelo % casas.length) + casas.length) % casas.length) : undefined;
      if (v.tipo === "subido" && v.sha) return indiceDe(v.sha, v.ext || "vrm");
      return undefined;
    },
  };
}
