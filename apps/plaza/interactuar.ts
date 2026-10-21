// J4 on the page: «E: hablar con Alma» for the nearest thing in reach (any feature whose card declares `interact`).
// E, a plain click on the thing (play mode; a drag orbits the camera) or the prompt itself (a real button, which is
// what touch screens tap) sends the declared intent. Never while the build panel is open, in build mode, while typing
// or while a conversation is open. The server checks the reach again (api.within): the page only offers.
// Convention for features: draw an interactive thing with view.place(`<feature>:<key>`) so a click on it is understood.
// U12: a page module may offer things whose use runs on the page first (`locales`: a hole opens the file picker, which a
// browser allows only inside the key press or the click), and claim a click on a thing drawn by its plain key (`pinchar`).
// ux2-gente: a plain click on no thing goes to `persona` (the card of whoever is under it: things and NPCs always win).
// J4 «mantener pulsado»: a thing whose card sets `hold` (seconds) is not used at once — E / the mobile button / the VR
// trigger must be HELD that long (a progress ring fills on the button, --progreso 0..1) before the intent is sent;
// letting go early, or the target changing, cancels with nothing sent. A thing without `hold` fires as before.
type Res = { ok: true } | { ok: false; why: string };
export type Cerca = { feature: string; key: string; intent: string; prompt: string; name: string; distance: number; hold?: number; local?: () => Res };
type Sesion = { entity: number; selfPosition(alpha: number): { x: number; y: number; z: number }; features: { reachable(x: number, z: number, y?: number): Cerca[]; use(feature: string, key: string): Res } };
type Vista = { renderer: { domElement: HTMLElement }; pickThing?(x: number, y: number): string | null; cam?: { modo?(): string } };

/** True while the person types in a text box: global keys must not fire (J3's one rule, apps/plaza/escribiendo.ts). */
import { escribiendo } from "./escribiendo.ts";
import { esTactil, perfil } from "./perfil-aparato.ts"; // U25: touch controls or not, one answer for the whole page
import { ayudaDe, glifoDe } from "../../packages/client/src/movil.ts"; // U24: the glyph each device names (touch: none)
export { escribiendo };
/** Building: the build panel is open or the camera is in build mode (there clicks select things and digits are tools). */
export const construyendo = (view: Vista): boolean => !(document.getElementById("panel-construir")?.hidden ?? true) || view.cam?.modo?.() === "construir";
const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Pure: 0..1, how much of `holdS` seconds has elapsed between `desde` and `ahora` (both ms); no hold (0/undefined) = done at once. */
export const fraccionMantenida = (desde: number, ahora: number, holdS?: number): number => (!holdS ? 1 : Math.min(1, Math.max(0, (ahora - desde) / (holdS * 1000))));

export function montarInteraccion(o: {
  session: Sesion; view: Vista; boton: HTMLButtonElement; ofrece: (feature: string, key: string) => boolean; ocupado: () => boolean;
  locales?: (x: number, z: number, y?: number) => Cerca[]; pinchar?: (key: string) => boolean;
  /** ux2-gente: a plain click that hit no thing may land on a person (their small card); true = claimed. */
  persona?: (clientX: number, clientY: number) => boolean;
}) {
  const tactil = esTactil();
  let actual: Cerca | null = null, ultimo: Res | null = null;
  let manteniendo: { c: Cerca; desde: number } | null = null;
  const usar = (c: Cerca | null): Res => (ultimo = !c ? { ok: false, why: "no hay nada al alcance" } : c.local ? c.local() : o.session.features.use(c.feature, c.key));
  const libre = () => o.session.entity >= 0 && !construyendo(o.view) && !o.ocupado();
  const cancelarMantener = () => { if (!manteniendo) return; manteniendo = null; o.boton.classList.remove("manteniendo"); o.boton.style.removeProperty("--progreso"); };
  const empezarMantener = (c: Cerca) => { if (manteniendo?.c === c) return; manteniendo = { c, desde: performance.now() }; o.boton.classList.add("manteniendo"); o.boton.style.setProperty("--progreso", "0"); };
  // ticks the held progress and fires once it reaches 1 (also cancels if the target moved out of reach)
  setInterval(() => {
    if (!manteniendo) return;
    if (!actual || actual.feature !== manteniendo.c.feature || actual.key !== manteniendo.c.key) { cancelarMantener(); return; }
    const frac = fraccionMantenida(manteniendo.desde, performance.now(), manteniendo.c.hold);
    o.boton.style.setProperty("--progreso", String(frac));
    if (frac >= 1) { const c = manteniendo.c; cancelarMantener(); usar(c); }
  }, 40);
  const mirar = () => {
    let c: Cerca | null = null;
    if (libre()) {
      const p = o.session.selfPosition(1); // y: a person one floor up gets no prompt
      const de = o.session.features.reachable(p.x, p.z, p.y).filter((x) => o.ofrece(x.feature, x.key));
      c = [...de, ...(o.locales?.(p.x, p.z, p.y) ?? [])].sort((a, b) => a.distance - b.distance)[0] ?? null;
    }
    const antes = actual;
    actual = c;
    if (c?.feature === antes?.feature && c?.key === antes?.key && c?.prompt === antes?.prompt) return;
    if (!c) cancelarMantener();
    o.boton.hidden = !c;
    if (c) { const g = glifoDe(perfil().clase, "interactuar"); o.boton.textContent = tactil ? conMayuscula(c.prompt) : ayudaDe(perfil().clase, "interactuar", c.prompt); o.boton.setAttribute("aria-label", g ? `${conMayuscula(c.prompt)} (tecla ${g})` : conMayuscula(c.prompt)); }
  };
  setInterval(mirar, 200);
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyE" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || escribiendo(e) || !libre()) return;
    mirar();
    if (!actual) return;
    e.preventDefault();
    if (actual.hold) empezarMantener(actual); else usar(actual);
  });
  addEventListener("keyup", (e) => { if (e.code === "KeyE") cancelarMantener(); });
  o.boton.addEventListener("pointerdown", (ev) => { ev.stopPropagation(); if (actual?.hold) empezarMantener(actual); }); // a tap here is not a joystick touch
  o.boton.addEventListener("pointerup", () => { if (manteniendo) cancelarMantener(); });
  o.boton.addEventListener("pointerleave", () => cancelarMantener());
  o.boton.addEventListener("click", () => { if (actual?.hold) return; usar(actual); o.boton.blur(); });
  // a plain click on a thing in play mode: what is under the pointer, if its feature says it is used from close by
  const lienzo = o.view.renderer.domElement;
  let abajo: { x: number; y: number } | null = null;
  lienzo.addEventListener("pointerdown", (e) => { abajo = e.button === 0 ? { x: e.clientX, y: e.clientY } : null; });
  lienzo.addEventListener("pointerup", (e) => {
    const a = abajo;
    abajo = null;
    if (!a || e.button !== 0 || Math.hypot(e.clientX - a.x, e.clientY - a.y) > 6 || !libre()) return;
    const k = o.view.pickThing?.(e.clientX, e.clientY), i = k ? k.indexOf(":") : -1;
    if (!k) { o.persona?.(e.clientX, e.clientY); return; }
    if (i < 1) { o.pinchar?.(k); return; } // a thing drawn by its plain key (objetos): a page module may claim it (U12)
    const feature = k.slice(0, i), key = k.slice(i + 1);
    if (o.ofrece(feature, key)) usar({ feature, key, intent: "", prompt: "", name: "", distance: 0 });
  });
  return {
    actual: () => actual, ultimo: () => ultimo, usar: () => usar(actual), mirar,
    // J4 VR: the trigger is a press-and-hold like E and the mobile button (xr.ts starts/cancels it on selectstart/selectend)
    mantener: { empezar: () => { if (actual?.hold) empezarMantener(actual); else if (actual) usar(actual); }, soltar: cancelarMantener },
  };
}
