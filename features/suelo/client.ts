// suelo — client part (D-045): when the server puts YOU back on a safe spot the page fades to dark and back
// (`view.fundido`, apps/plaza/main.ts) while the next snapshot moves the body; the announcement («Has vuelto a un sitio
// seguro», importance 2) reaches the aria-live region through the engine, like every announced event. No DOM here.
import { clientPart } from "../../packages/feature/src/index.ts";
import { suelo, FUNDIDO_MS } from "./feature.ts";

export default clientPart(suelo, (api) => {
  api.on("vuelta", (msg) => {
    if (Number(msg.quien) !== api.self()) return;
    api.view.fundido?.(FUNDIDO_MS);
  });
});
