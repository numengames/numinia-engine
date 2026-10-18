// semilla (naturaleza N1): the pure seeded randomness now lives in packages/relieve (N5: the server builds the collision mesh from
// the SAME functions, and a package that does not import three.js is the only place both sides may take them from).
// This file re-exports it so every render import keeps working.
export * from "../../../relieve/src/semilla.ts";
