// Página para OÍR los sonidos esquemáticos: un botón por id, agrupados, con volumen y tono. Misma síntesis que el motor.
import { IDS, RECETAS, generar } from "../packages/render/src/audio/sintesis.ts";

const grupos: [string, RegExp][] = [["Interfaz", /^ui-/], ["Cuerpo", /^(pasos|aterrizaje|salto|dano)/], ["Objetos y funciones", /^(coger|golpe|puerta|cerradura|pesca|dardo|dados|teleport|renacer|moneda|maquina)/], ["Ambiente (bucles: otra pulsación los para)", /^(bed|capa|amb)-/]];
const ctx = new AudioContext();
const vol = document.getElementById("vol") as HTMLInputElement, tono = document.getElementById("tono") as HTMLInputElement;
const activos = new Map<string, AudioBufferSourceNode>();
const buffers = new Map<string, AudioBuffer>();
const buf = (id: string, v: number): AudioBuffer => {
  const k = `${id}#${v}`; let b = buffers.get(k);
  if (!b) { const s = generar(id, v)!; b = ctx.createBuffer(1, s.datos.length, s.sr); b.copyToChannel(s.datos, 0); buffers.set(k, b); }
  return b;
};
let vuelta = 0;
function sonar(id: string): void {
  void ctx.resume();
  const previo = activos.get(id);
  if (previo) { previo.stop(); activos.delete(id); return; }
  const f = ctx.createBufferSource(), g = ctx.createGain();
  f.buffer = buf(id, RECETAS[id].bucle ? 0 : vuelta++ % 3); f.loop = !!RECETAS[id].bucle;
  f.playbackRate.value = Number(tono.value); g.gain.value = Number(vol.value);
  f.connect(g); g.connect(ctx.destination); f.start();
  if (f.loop) { activos.set(id, f); f.onended = () => activos.delete(id); }
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
