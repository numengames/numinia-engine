// avatar (H10) — server: keep each identity's choice (store, S4) and mirror it onto the connected entity (shared
// state, no `at`: everyone gets it, same idea as the old per-entity default). On I1's onIdentify, a reconnecting
// tab gets its own pick back; on leave the entity's entry disappears (a fresh connection starts from the store,
// never a stale entity number). The page validates an upload's triangles and licence itself (vrm.ts, revisarAvatar,
// before it ever uploads); the server still refuses a `sha` that is not actually on this server (api.activo).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { avatar, motivoElegir } from "./feature.ts";

type Eleccion = { tipo: string; modelo: number; sha: string; ext: string };

function setup(api: ServerApi): void {
  const clave = (id: string) => `id:${id}`;
  const poner = (entity: number, v: Eleccion) => api.state.set(String(entity), v);

  api.onIdentify((entity, who) => {
    const v = api.store.get(clave(who.id)) as Eleccion | undefined;
    if (v) poner(entity, v);
  });
  api.onLeave((entity) => api.state.delete(String(entity)));

  api.on("elegir", (from, msg) => {
    const who = api.who(from);
    if (!who) return;
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
