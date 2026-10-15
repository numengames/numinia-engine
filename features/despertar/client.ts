// despertar — client part: draw the column of light and its text at the awakened point.
import { clientPart } from "../../packages/feature/src/index.ts";
import { despertar } from "./feature.ts";

export default clientPart(despertar, (api) => {
  api.on("despertado", (msg) => {
    if (api.view.ajuste?.("despertar.columna") === false) return; // N2: the person turned the column off (the notice still reads)
    api.view.beacon?.(Number(msg.x), Number(msg.z), String(msg.texto), Number(msg.ms));
  });
});
