// T3: which button the guide arrow really points at. Pure (no DOM): `visible(id)` says whether a page button can be
// pressed now. The step names the button it is about (`senala`); if it is not on screen, the arrow points at the one
// that leads to it: cable-nuevo / cable-probar-<id> → dock-cable (open the Cable drawer) → construir (open the panel) → mas (a phone keeps
// «Construir» inside «…»). "" = nothing to point at.
const PADRES: Readonly<Record<string, string>> = { "cable-nuevo": "dock-cable", construir: "mas" };

export function padreDeBoton(id: string): string {
  if (PADRES[id] !== undefined) return PADRES[id];
  if (id.startsWith("cable-probar-")) return "dock-cable"; // the «Probar» of one cable (cable-probar-<id>) lives in the Cable drawer
  return id.startsWith("dock-") ? "construir" : ""; // every dock button lives in the Construir panel
}

export function objetivoDeFlecha(senala: string, visible: (id: string) => boolean): string {
  for (let id = senala, i = 0; id && i < 6; id = padreDeBoton(id), i++) if (visible(id)) return id;
  return "";
}
