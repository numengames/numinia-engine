// avatar (H10) — client: no page-drawn card and nothing to listen for (the choice itself is shared `state`, read
// straight from `ClientRuntime.stateOf("avatar")` by apps/plaza/avatar.ts, which also turns it into the model index
// packages/render/src/avatares.ts draws). This part only registers the feature so `send("avatar","elegir",…)`
// is checked against its schema before it ever reaches the server.
import { clientPart } from "../../packages/feature/src/index.ts";
import type { ClientApi } from "../../packages/feature/src/index.ts";
import { avatar } from "./feature.ts";

function setup(_api: ClientApi): void {}

export default clientPart(avatar, setup);
