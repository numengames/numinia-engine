// despertar — client part: draw the column of light and its text at the awakened point.
import { clientPart } from "../../packages/feature/src/index.ts";
import { despertar } from "./feature.ts";

export default clientPart(despertar, (api) => {
  api.on("despertado", (msg) => api.view.beacon?.(Number(msg.x), Number(msg.z), String(msg.texto), Number(msg.ms)));
});
