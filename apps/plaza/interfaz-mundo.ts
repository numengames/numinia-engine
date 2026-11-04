// interfaz-mundo — which buttons a world takes off the page (ficha@1 `interfaz.ocultar`, served by GET /status).
// A training simulator has no use for «Saludar», «Bailar» and «Movimientos»: the world says `"interfaz": { "ocultar": ["gestos"] }`
// and those buttons are not drawn (bottom bar, the phone's «…» menu, the touch «Movimientos» button). The server checked the
// names (packages/server/src/aventura.ts leerInterfaz); the page checks them again, because the wire is not trusted.
// No DOM here: main.ts does the hiding with what this returns. Without the field nothing changes.

/** The groups a world may hide (the same list as the server's `INTERFAZ_OCULTABLES`). */
export const OCULTABLES = ["gestos"] as const;
export type Ocultable = (typeof OCULTABLES)[number];

/** `/status`'s `interfaz` → the set of groups to hide. Anything that is not `{ ocultar: [known names] }` hides nothing. */
export function ocultosDe(interfaz: unknown): Set<Ocultable> {
  const fuera = new Set<Ocultable>();
  if (!interfaz || typeof interfaz !== "object" || Array.isArray(interfaz)) return fuera;
  const lista = (interfaz as { ocultar?: unknown }).ocultar;
  if (!Array.isArray(lista)) return fuera;
  for (const x of lista) if ((OCULTABLES as readonly unknown[]).includes(x)) fuera.add(x as Ocultable);
  return fuera;
}

/** The actions a page offers once the world's hidden groups are taken out. The «gestos» group is the `gestos` feature's actions. */
export function accionesVisibles<A extends { feature?: string }>(acciones: readonly A[], sinGestos: boolean): A[] {
  return sinGestos ? acciones.filter((a) => a.feature !== "gestos") : [...acciones];
}
