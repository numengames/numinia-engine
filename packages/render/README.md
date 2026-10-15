# render

The only package that talks to three.js: WebGPU/WebGL2 view, power policy (frame cap, dynamic resolution, battery), crowds (baked VAT), AR and VR sessions, what the page reports about the device (`sesion.ts`).

- **Does not:** Simulation or networking; it imports nothing from other engine packages.
- **Depends on:** three.js only (rule: `tools/layers.json`)
- **Tested by:** `test/power.test.ts`; browser: `tools/auto.sh e2e`
- **Main API:** `createView`, `createPower`, `readCaps`, `checkCost`, `createVatCrowd`, `createAR`, `createVR`, `leerAparato`, `medidorDeCuadros` (T1 report; tested by `test/sesiones.test.ts`)
- **The zone from above (J5, `src/cenital.ts`):** `view.cenital({ px, incluir, modo })` → a top-down picture (orthographic render + readback on WebGPU/WebGL2; footprints when that fails), `view.huellas()`, `view.cenitalVersion()`; only `world` children with `userData.mapa` ("suelo" or true) or named `objeto:<key>` are drawn. Waypoints: `view.waypoint(x, z, text) → id`, `view.dropWaypoint(id)` (a beacon kept until dropped, not counted by `busy()`). Browser: `tools/e2e-piernas/mapa.mjs`.
