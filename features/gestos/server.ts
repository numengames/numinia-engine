// gestos — server part: whoever asks for a gesture, everyone within 30 m (the asker too) hears of it.
import { serverPart } from "../../packages/feature/src/index.ts";
import { gestos } from "./feature.ts";

export const ALCANCE_M = 30;

export default serverPart(gestos, (api) => {
  api.on("hacer", (from, msg) => {
    api.emit("hecho", { quien: from, gesto: msg.gesto }, { near: from, radius: ALCANCE_M });
  });
});
