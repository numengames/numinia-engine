// interfaz-mundo — which buttons a world takes off the page (ficha@1 `interfaz.ocultar`, served by GET /status).
// A training simulator has no use for «Saludar», «Bailar» and «Movimientos»: the world says `"interfaz": { "ocultar": ["gestos"] }`
// and those buttons are not drawn (bottom bar, the phone's «…» menu, the touch «Movimientos» button). The server checked the
// names (packages/server/src/aventura.ts leerInterfaz); the page checks them again, because the wire is not trusted.
// P15 b: a second group, "recoger-soltar", takes the player's «Recoger» (fishing's reel, F) and «Soltar» (what you carry, Q) buttons off the
// bar: a world that never fishes and whose things are picked up with «E» has no use for them. The keys keep working.
// No DOM here: main.ts does the hiding with what this returns. Without the field nothing changes.

/** The groups a world may hide (the same list as the server's `INTERFAZ_OCULTABLES`). */
export const OCULTABLES = ["gestos", "recoger-soltar"] as const;
export type Ocultable = (typeof OCULTABLES)[number];
type Accion = { feature?: string; id?: string };
/** What each group is: «gestos» = the `gestos` feature's actions; «recoger-soltar» = fishing's «Recoger» and the carried thing's «Soltar»
 * (not the staff's: «Soltar el báculo» / «Pasar el báculo» are the conductor's). Picking a thing up with «E» is the thing's own card, not an action: it stays. */
const GRUPO: Record<Ocultable, (a: Accion) => boolean> = {
  gestos: (a) => a.feature === "gestos",
  "recoger-soltar": (a) => (a.feature === "pesca" && a.id === "recoger") || (a.feature === "cogibles" && a.id === "soltar"),
};

/** `/status`'s `interfaz` → the set of groups to hide. Anything that is not `{ ocultar: [known names] }` hides nothing. */
export function ocultosDe(interfaz: unknown): Set<Ocultable> {
  const fuera = new Set<Ocultable>();
  if (!interfaz || typeof interfaz !== "object" || Array.isArray(interfaz)) return fuera;
  const lista = (interfaz as { ocultar?: unknown }).ocultar;
  if (!Array.isArray(lista)) return fuera;
  for (const x of lista) if ((OCULTABLES as readonly unknown[]).includes(x)) fuera.add(x as Ocultable);
  return fuera;
}

/** Is this action's button one the world took away? */
export const accionOculta = (a: Accion, ocultos: ReadonlySet<Ocultable>): boolean => { for (const g of ocultos) if (GRUPO[g](a)) return true; return false; };

/** The actions a page offers once the world's hidden groups are taken out. */
export function accionesVisibles<A extends Accion>(acciones: readonly A[], ocultos: ReadonlySet<Ocultable>): A[] {
  return acciones.filter((a) => !accionOculta(a, ocultos));
}
