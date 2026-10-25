// MIS-200 card t_166720f3: one panel in front of you while a dialogue is up. The help card and the menu step aside
// when a dialogue opens, and «Menú» / Y does not open the menu over it. The behaviour itself is checked in the VR
// leg (tools/e2e-piernas/menu-vr.mjs, «un diálogo deja la ayuda escondida»); here the code paths are read from vr.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const VR = readFileSync(new URL("../packages/render/src/vr.ts", import.meta.url), "utf8");
const cuerpo = (firma: string): string => {
  const i = VR.indexOf(firma);
  assert.ok(i >= 0, `no encuentro «${firma}» en vr.ts`);
  const abre = VR.indexOf("{", i);
  let hondo = 0;
  for (let k = abre; k < VR.length; k++) {
    if (VR[k] === "{") hondo++;
    else if (VR[k] === "}" && --hondo === 0) return VR.slice(abre, k + 1);
  }
  assert.fail(`cuerpo sin cerrar: ${firma}`);
};

test("dialogo() cierra el menú y aparta la ayuda cuando hay sesión", () => {
  const cuerpoDialogo = cuerpo("dialogo(d: DialogoVR | null): void");
  assert.match(cuerpoDialogo, /if \(session\) \{ menu\.cerrar\(\); panel\.visible = false; \}/);
});

test("alternarMenu() no abre el menú mientras un diálogo está delante", () => {
  const cuerpoAlternar = cuerpo("function alternarMenu(en?: Vista): boolean");
  assert.match(cuerpoAlternar, /\(dialogo && dialogoMalla\.visible\)/);
});
