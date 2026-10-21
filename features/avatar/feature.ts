// avatar (H10): choose one of the house avatars (J1) or your own uploaded .vrm (H9, validated by the page with
// revisarAvatar: CC0, <= 10,000 triangles, before it ever uploads). Saved with your identity (I1): everyone who
// looks at you sees it, and it comes back when you reload. The default avatar (none chosen yet) stays as it was
// before H10: a house avatar fixed by entity id (packages/render/src/avatares-politica.ts elegirAvatar).
import { defineFeature } from "../../packages/feature/src/index.ts";

export const TIPOS = ["casa", "subido"] as const;
export type Tipo = (typeof TIPOS)[number];
/** More than the house will ever hold; the page clamps a house index to what it actually has. */
export const MODELO_MAX = 999;
/** ia-visible S2: the house avatar every AI wears unless its pass picks another: Polybot, the green robot (index in
 * activos/avatares/catalogo.json; test/ia-cuerpo.test.ts pins it to the catalogue so a reorder fails loudly). */
export const ROBOT_CASA = 2;
export const SHA256 = /^[0-9a-f]{64}$/;

const CAMPOS = {
  tipo: { kind: "enum", values: TIPOS, default: "casa" },
  modelo: { kind: "int", min: 0, max: MODELO_MAX, default: 0 },
  sha: { kind: "text", maxBytes: 64, default: "" },
  ext: { kind: "text", maxBytes: 4, default: "" },
} as const;

/** Pure: why this choice cannot be saved, or "" when its shape is fine (the server still checks `sha` is a real
 * upload with `api.activo`, which needs the live file list — not pure, asked in server.ts). */
export function motivoElegir(tipo: unknown, sha: unknown): string {
  if (tipo !== "casa" && tipo !== "subido") return "tipo debe ser «casa» o «subido»";
  if (tipo === "subido" && !SHA256.test(String(sha))) return "sha256 inválido: sube el fichero primero (H9)";
  return "";
}

/** ia-visible S2: is this identity an AI (identidad.ts `agenteDe`: the id starts with «ia-»)? */
export const esIA = (id: string | undefined): boolean => !!id && id.startsWith("ia-");

export const avatar = defineFeature({
  id: "avatar",
  version: 1,
  describe: "Tu avatar: uno de los de la casa (J1) o tu .vrm subido (H9). Se guarda con tu identidad (I1) y lo ven todos; vuelve contigo al recargar. Las IAs no eligen: llevan el robot de la casa (o el que diga su pase).",
  store: { describe: "Por identidad de invitado (`id:<id>`): la última elección — tipo (casa|subido), el índice de la casa o el sha256+extensión de tu .vrm." },
  state: {
    describe: "Por entidad conectada (clave = su entidad; desaparece al desconectar, I1 trae la elección de vuelta al identificarse). tipo = casa|subido; modelo = índice entre los avatares de la casa; sha/ext = tu .vrm subido (H9, /a/<sha>.<ext>). Sin entrada = el mundo decide por defecto (H7). Una IA (identidad «ia-…») lleva siempre el robot de la casa o el avatar de la casa que elige su pase (bloque `ia.cuerpo`): lo decide el servidor, no ella.",
    fields: CAMPOS,
  },
  intents: {
    elegir: {
      describe: "Elegir tu avatar: uno de la casa (tipo casa, modelo = su índice) o uno que subiste ya a este servidor (tipo subido, sha + ext de /a/<sha>.<ext>).",
      spoken: "elegir tu avatar",
      fields: CAMPOS,
    },
  },
  events: {
    rechazado: { describe: "Tu elección no se guardó, y por qué.", fields: { motivo: { kind: "text", maxBytes: 160 } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
