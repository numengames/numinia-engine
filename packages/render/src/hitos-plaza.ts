// hitos-plaza (MIS-224): the pillars the house plaza stands on the ground, each with a reason.
// Before: 24 boxes of 1×3×1 m in three rings «so movement is visible» (gold/blue/red/green, no meaning). The ground has had
// a grass texture for a long time, so movement reads without them; only the two the example adventure sends you to stay.
// A world that wants none says `hitos: false` in its entorno (unchanged); the nature still hides these two (naturaleza/hitos.ts).
export type HitoPlaza = { id: string; nombre: string; proposito: string; x: number; z: number; color: number };

export const HITOS_PLAZA: readonly HitoPlaza[] = [
  { id: "pilar-dorado", nombre: "Pilar dorado", proposito: "Meta del primer paso de «Primeros pasos» (aventuras/ejemplo): Alma te manda a visitarlo, al este de la plaza.", x: 18, z: 0, color: 0xd9a441 },
  { id: "pilar-rojo", nombre: "Pilar rojo", proposito: "Seña de Bruno: dice que dejó su caja de herramientas «junto al pilar rojo del sur»; la caja está a cuatro metros.", x: 0, z: 18, color: 0xc0605b },
];
export const ALTO_HITO = 3;
