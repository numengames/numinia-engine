// frases — client part (Y29), the LIGHT door. The page's start bundle has a size cap (limits.json first_load_br_bytes), so
// this file holds only what must exist at once: the feature's id and version, the key/button («Phrases») and the ear for
// `dicha`. Everything else (the list, translation, bubbles, pace) is pagina.ts, fetched the first time a phrase is
// heard, the panel opens or a person asks for it (`cargar()`); events heard meanwhile wait for it, in order.
import { clientPart, defineFeature } from "../../packages/feature/src/index.ts";
import type { ClientApi, Msg } from "../../packages/feature/src/index.ts";

export const VERSION = 1; // the declaration's (feature.ts); test/frases.test.ts keeps them equal
type Pagina = typeof import("./pagina.ts");
const ligera = defineFeature({ id: "frases", version: VERSION, describe: "Fixed phrases (see feature.ts)" });

/** Set by the panel (apps/plaza/frases.ts) once it exists: opens or closes the list. */
export const gancho = { abrir: null as null | (() => void) };
let api: ClientApi | null = null;
let carga: Promise<Pagina> | null = null;
/** The page's logic, loaded once and connected to the session. */
export function cargar(): Promise<Pagina> {
  return (carga ??= import("./pagina.ts").then((m) => { m.conectar(api!); return m; }));
}

export default clientPart(ligera, (a) => {
  api = a;
  a.on("dicha", (m: Msg) => { void cargar().then((p) => p.dicha(m)); });
  a.action({ id: "frases", label: "Phrases", key: "Backquote", describe: "Say a fixed phrase", run: () => gancho.abrir?.() });
});
