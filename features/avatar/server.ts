// avatar (H10) — server: keep each identity's choice (store, S4) and mirror it onto the connected entity (shared
// state, no `at`: everyone gets it, same idea as the old per-entity default). On I1's onIdentify, a reconnecting
// tab gets its own pick back; on leave the entity's entry disappears (a fresh connection starts from the store,
// never a stale entity number). The page validates an upload's triangles and licence itself (vrm.ts, revisarAvatar,
// before it ever uploads); the server still refuses a `sha` that is not actually on this server (api.activo).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { avatar, esIA, motivoElegir, ROBOT_CASA, SHA256 } from "./feature.ts";

type Eleccion = { tipo: string; modelo: number; sha: string; ext: string; escala?: number };

function setup(api: ServerApi): void {
  const clave = (id: string) => `id:${id}`;
  const poner = (entity: number, v: Eleccion) => api.state.set(String(entity), v);

  // ia-visible S2: an AI looks like one. The house robot unless its pass picks another house avatar (`ia.cuerpo`, told by the roles
  // feature's server-only event «ia», at identify and whenever a fresh pass changes it). It never reads or keeps a stored choice and
  // cannot choose by itself: the world decides how an AI looks, so the mark of an AI can't be dressed away. People: untouched.
  const cuerpoIA = (entity: number, modelo: number) => poner(entity, { tipo: "casa", modelo: modelo >= 0 ? modelo : ROBOT_CASA, sha: "", ext: "" });
  api.listen("roles", "ia", (m) => {
    const entity = Number(m.quien);
    if (!esIA(api.who(entity)?.id)) return false;
    const sha = String(m.cuerpoSha ?? "");
    if (SHA256.test(sha)) poner(entity, { tipo: "modelo", modelo: 0, sha, ext: "glb", escala: Number(m.cuerpoEscala) || 1 }); // habitante@1 apariencia: its own .glb, like a person of the world (pnj@1)
    else cuerpoIA(entity, Number(m.cuerpo ?? -1));
    return true;
  });

  api.onIdentify((entity, who) => {
    if (esIA(who.id)) { cuerpoIA(entity, -1); return; }
    const v = api.store.get(clave(who.id)) as Eleccion | undefined;
    if (v) poner(entity, v);
  });
  api.onLeave((entity) => api.state.delete(String(entity)));

  api.on("elegir", (from, msg) => {
    const who = api.who(from);
    if (!who) return;
    if (esIA(who.id)) { api.emit("rechazado", { motivo: "el cuerpo de una IA lo fija el mundo (el robot de la casa o el que diga su pase de numinia.com)" }, { to: from }); return; }
    const tipo = String(msg.tipo), sha = String(msg.sha ?? ""), ext = String(msg.ext ?? "") || "vrm", modelo = Math.max(0, Number(msg.modelo) || 0);
    const motivo = motivoElegir(tipo, sha);
    if (motivo) { api.emit("rechazado", { motivo }, { to: from }); return; }
    if (tipo === "subido" && !api.activo(sha, ext)) { api.emit("rechazado", { motivo: `ese .${ext} no está subido a este servidor (súbelo primero)` }, { to: from }); return; }
    const v: Eleccion = tipo === "subido" ? { tipo, modelo: 0, sha, ext } : { tipo, modelo, sha: "", ext: "" };
    api.store.set(clave(who.id), v);
    poner(from, v);
  });
}

export default serverPart(avatar, setup);
