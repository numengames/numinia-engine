// vuelo — client part (H2): nothing to draw. The refusal («En este mundo no se vuela…») reaches the aria-live region through the
// engine like every announced event; the page only asks (`volar`), the server decides.
import { clientPart } from "../../packages/feature/src/index.ts";
import { vuelo } from "./feature.ts";

export default clientPart(vuelo, () => {});
