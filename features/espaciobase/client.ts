// espacio-base — client part (H2): hand the world's espacio base to the view (`view.espacioBase`, apps/plaza/main.ts → render's
// espacio-base/espacio-base.ts), which draws the mesh. Nothing is drawn here; with no state (a world without espacio-base.json) the view
// is never called and the page is exactly as before. No DOM.
import { clientPart } from "../../packages/feature/src/index.ts";
import { espacioBase, MUNDO } from "./feature.ts";

export default clientPart(espacioBase, (a) => {
  a.state.onChange((key, v) => { if (key === MUNDO && v) a.view.espacioBase?.(v); });
});
