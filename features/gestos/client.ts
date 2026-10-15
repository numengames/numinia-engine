// gestos — client part: two actions (G wave, H dance; buttons on touch screens) and how a gesture looks.
import { clientPart } from "../../packages/feature/src/index.ts";
import { gestos } from "./feature.ts";

const TEXTO: Record<string, string> = { saludar: "¡Hola!", bailar: "♪ ♪ ♪" };
export const DURACION_MS = 2000;

export default clientPart(gestos, (api) => {
  api.on("hecho", (msg) => {
    const quien = Number(msg.quien), gesto = String(msg.gesto);
    api.view.label(quien, TEXTO[gesto] ?? gesto, DURACION_MS);
    if (gesto === "bailar") api.view.bounce(quien, DURACION_MS);
  });
  api.action({ id: "saludar", label: "Saludar", key: "KeyG", describe: "Saluda a quien esté cerca", run: () => api.send("hacer", { gesto: "saludar" }) });
  api.action({ id: "bailar", label: "Bailar", key: "KeyH", describe: "Baila un momento", run: () => api.send("hacer", { gesto: "bailar" }) });
});
