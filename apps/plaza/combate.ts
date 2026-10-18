// combate on the page (level 2, loaded lazily by main.ts with the first creature): the Carga bar (0-100) and the three
// ability buttons of the Eclipse Mnémico kit (keys 1, 2, 3). The bar only shows what the server last said (event
// `carga`): it rises with Corte Breve and drops when Incisión Semántica / Discontinuidad are used. Buttons only ASK
// (lucha.habilidad); the server decides reach, cooldown and cost. Copies the pattern of contadores.ts (own panel).
import { escribiendo } from "./escribiendo.ts";
import { ECLIPSE, HABILIDADES, CARGA_MAX, vistaCarga } from "../../features/lucha/habilidades.ts";

type Res = { ok: true } | { ok: false; why: string };
type Lucha = { carga(): number; habilidad(cual: string, objetivo?: string): Res; alCambiar(fn: () => void): () => void; criaturas(): { modo: string }[] };

export function montarCombate(o: { lucha: Lucha }): { pintar(): void } {
  const { lucha } = o;
  const panel = document.createElement("section");
  panel.id = "combate-hud"; panel.setAttribute("aria-label", "Combate: Carga y habilidades");
  panel.addEventListener("pointerdown", (e) => e.stopPropagation()); // not a joystick touch
  panel.hidden = true;
  const barra = document.createElement("div"); barra.className = "barra"; barra.setAttribute("role", "meter");
  barra.setAttribute("aria-label", "Carga"); barra.setAttribute("aria-valuemin", "0"); barra.setAttribute("aria-valuemax", String(CARGA_MAX));
  const relleno = document.createElement("div"); relleno.className = "relleno";
  const texto = document.createElement("span"); texto.className = "texto";
  barra.append(relleno, texto);
  const botones = document.createElement("div"); botones.className = "botones"; botones.setAttribute("role", "group"); botones.setAttribute("aria-label", "Habilidades");
  const porClave = new Map<string, HTMLButtonElement>();
  HABILIDADES.forEach((k, i) => {
    const h = ECLIPSE[k], b = document.createElement("button");
    b.type = "button"; b.textContent = `${i + 1} ${h.nombre}${h.coste ? ` (${h.coste})` : ""}`;
    b.setAttribute("aria-label", `${h.nombre}: ${h.dano} de daño, enfriamiento ${h.enfriamiento} s${h.coste ? `, cuesta ${h.coste} de Carga` : `, da ${h.genera} de Carga`}`);
    b.addEventListener("click", () => { lucha.habilidad(k); });
    porClave.set(k, b); botones.append(b);
  });
  panel.append(barra, botones);
  document.body.appendChild(panel);

  const pintar = () => {
    const v = vistaCarga(lucha.carga());
    panel.hidden = !lucha.criaturas().some((c) => c.modo !== "disuelta");
    relleno.style.width = `${v.pct}%`; texto.textContent = v.texto; barra.setAttribute("aria-valuenow", String(v.pct));
    for (const [k, b] of porClave) b.classList.toggle("lista", v.listas[k]);
  };
  addEventListener("keydown", (e) => {
    if (escribiendo(e) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = HABILIDADES[Number(e.key) - 1];
    if (k) lucha.habilidad(k);
  });
  lucha.alCambiar(pintar); pintar();
  return { pintar };
}
