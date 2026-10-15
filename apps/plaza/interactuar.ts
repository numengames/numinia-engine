// J4 on the page: «E: hablar con Alma» for the nearest thing in reach (any feature whose card declares `interact`).
// E, a plain click on the thing (play mode; a drag orbits the camera) or the prompt itself (a real button, which is
// what touch screens tap) sends the declared intent. Never while the build panel is open, in build mode, while typing
// or while a conversation is open. The server checks the reach again (api.within): the page only offers.
// Convention for features: draw an interactive thing with view.place(`<feature>:<key>`) so a click on it is understood.
type Res = { ok: true } | { ok: false; why: string };
type Cerca = { feature: string; key: string; intent: string; prompt: string; name: string; distance: number };
type Sesion = { entity: number; selfPosition(alpha: number): { x: number; z: number }; features: { reachable(x: number, z: number): Cerca[]; use(feature: string, key: string): Res } };
type Vista = { renderer: { domElement: HTMLElement }; pickThing?(x: number, y: number): string | null; cam?: { modo?(): string } };

/** True while the person types in a text box: global keys must not fire (J3's one rule, apps/plaza/escribiendo.ts). */
import { escribiendo } from "./escribiendo.ts";
export { escribiendo };
/** Building: the build panel is open or the camera is in build mode (there clicks select things and digits are tools). */
export const construyendo = (view: Vista): boolean => !(document.getElementById("panel-construir")?.hidden ?? true) || view.cam?.modo?.() === "construir";
const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function montarInteraccion(o: { session: Sesion; view: Vista; boton: HTMLButtonElement; ofrece: (feature: string, key: string) => boolean; ocupado: () => boolean }) {
  const tactil = matchMedia("(pointer: coarse)").matches;
  let actual: Cerca | null = null, ultimo: Res | null = null;
  const usar = (c: Cerca | null): Res => (ultimo = c ? o.session.features.use(c.feature, c.key) : { ok: false, why: "no hay nada al alcance" });
  const libre = () => o.session.entity >= 0 && !construyendo(o.view) && !o.ocupado();
  const mirar = () => {
    let c: Cerca | null = null;
    if (libre()) { const p = o.session.selfPosition(1); c = o.session.features.reachable(p.x, p.z).find((x) => o.ofrece(x.feature, x.key)) ?? null; }
    const antes = actual;
    actual = c;
    if (c?.feature === antes?.feature && c?.key === antes?.key && c?.prompt === antes?.prompt) return;
    o.boton.hidden = !c;
    if (c) { o.boton.textContent = tactil ? conMayuscula(c.prompt) : `E: ${c.prompt}`; o.boton.setAttribute("aria-label", `${conMayuscula(c.prompt)} (tecla E)`); }
  };
  setInterval(mirar, 200);
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyE" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e) || !libre()) return;
    mirar();
    if (actual) { e.preventDefault(); usar(actual); }
  });
  o.boton.addEventListener("pointerdown", (ev) => ev.stopPropagation()); // a tap here is not a joystick touch
  o.boton.addEventListener("click", () => { usar(actual); o.boton.blur(); });
  // a plain click on a thing in play mode: what is under the pointer, if its feature says it is used from close by
  const lienzo = o.view.renderer.domElement;
  let abajo: { x: number; y: number } | null = null;
  lienzo.addEventListener("pointerdown", (e) => { abajo = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; });
  lienzo.addEventListener("pointerup", (e) => {
    const a = abajo;
    abajo = null;
    if (!a || e.button !== 0 || Math.hypot(e.clientX - a.x, e.clientY - a.y) > 6 || !libre()) return;
    const k = o.view.pickThing?.(e.clientX, e.clientY), i = k ? k.indexOf(":") : -1;
    if (!k || i < 1) return;
    const feature = k.slice(0, i), key = k.slice(i + 1);
    if (o.ofrece(feature, key)) usar({ feature, key, intent: "", prompt: "", name: "", distance: 0 });
  });
  return { actual: () => actual, ultimo: () => ultimo, usar: () => usar(actual), mirar };
}
