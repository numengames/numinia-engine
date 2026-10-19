// Página para OÍR los sonidos esquemáticos: un botón por id, agrupados, con volumen y tono. Misma síntesis que el motor.
import { IDS, RECETAS, generar, aWav } from "../packages/render/src/audio/sintesis.ts";

const grupos: [string, RegExp][] = [["Interfaz", /^ui-/], ["Cuerpo", /^(pasos|aterrizaje|salto|dano)/], ["Objetos y funciones", /^(coger|golpe|puerta|cerradura|pesca|dardo|dados|teleport|renacer|moneda|maquina)/], ["Ambiente (bucles: otra pulsación los para)", /^(bed|capa|amb)-/]];
const vol = document.getElementById("vol") as HTMLInputElement, tono = document.getElementById("tono") as HTMLInputElement, estado = document.getElementById("estado")!;
// Se reproduce con <audio> y un .wav en memoria (no con Web Audio): funciona en cualquier navegador y con cualquier salida de sonido.
const activos = new Map<string, HTMLAudioElement>();
const urls = new Map<string, string>();
const url = (id: string, v: number): string => {
  const k = `${id}#${v}`; let u = urls.get(k);
  if (!u) { u = URL.createObjectURL(new Blob([aWav(generar(id, v)!)], { type: "audio/wav" })); urls.set(k, u); }
  return u;
};
let vuelta = 0;
function sonar(id: string): void {
  const previo = activos.get(id);
  if (previo) { previo.pause(); activos.delete(id); estado.textContent = `parado ${id}`; return; }
  try {
    const a = new Audio(url(id, RECETAS[id].bucle ? 0 : vuelta++ % 3));
    a.loop = !!RECETAS[id].bucle; a.volume = Number(vol.value); a.playbackRate = Number(tono.value);
    a.play().then(() => { estado.textContent = `sonando ${id}`; }).catch((e) => { estado.textContent = `NO SUENA ${id}: ${e}`; });
    if (a.loop) { activos.set(id, a); a.onended = () => activos.delete(id); }
  } catch (e) { estado.textContent = `ERROR ${id}: ${e}`; }
}
const raiz = document.getElementById("raiz")!;
for (const [nombre, re] of grupos) {
  const h = document.createElement("h2"); h.textContent = nombre; raiz.appendChild(h);
  const d = document.createElement("div");
  for (const id of IDS.filter((i) => re.test(i))) {
    const b = document.createElement("button"); b.textContent = `${RECETAS[id].bucle ? "🔁 " : ""}${id}`;
    b.onclick = () => { sonar(id); b.classList.toggle("on", activos.has(id)); };
    d.appendChild(b);
  }
  raiz.appendChild(d);
}
document.getElementById("todo")!.onclick = async () => {
  for (const id of IDS.filter((i) => !RECETAS[i].bucle)) { sonar(id); await new Promise((r) => setTimeout(r, Math.max(500, RECETAS[id].dur * 1000 + 250))); }
};
