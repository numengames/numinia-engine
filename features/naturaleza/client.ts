// naturaleza — client part (N4): hand the world's nature to the view (`view.naturaleza`, apps/plaza/main.ts → render's
// naturaleza.ts), which builds the landscape. Nothing is drawn here; with no state (a world without naturaleza.json) the view is
// never called and the page is exactly as before. No DOM.
import { clientPart } from "../../packages/feature/src/index.ts";
import { naturaleza, MUNDO } from "./feature.ts";

export default clientPart(naturaleza, (api) => {
  api.state.onChange((key, v) => { if (key === MUNDO && v) api.view.naturaleza?.(v); });
});
