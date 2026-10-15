# render

The only package that talks to three.js: WebGPU/WebGL2 view, power policy (frame cap, dynamic resolution, battery), crowds (baked VAT), AR and VR sessions, what the page reports about the device (`sesion.ts`).

- **Does not:** Simulation or networking; it imports nothing from other engine packages.
- **Depends on:** three.js only (rule: `tools/layers.json`)
- **Tested by:** `test/power.test.ts`; browser: `tools/auto.sh e2e`
- **Main API:** `createView`, `createPower`, `readCaps`, `checkCost`, `createVatCrowd`, `createAR`, `createVR`, `leerAparato`, `medidorDeCuadros` (T1 report; tested by `test/sesiones.test.ts`)
- **M22 builder's hands (`gizmo.ts`):** `view.pick(clientX, clientY)` → key of the placed thing under the pointer; `view.puntoBajo(clientX, clientY, ignorar?)` → point on the ground (y = 0) or on other things; `view.editor`: `seleccionar(key)` (yellow outline), `herramienta("mover" | "girar" | "escalar" | null)` (three's TransformControls, X red, Y green, Z blue, downloaded on first use: not in the start bundle), `eje`, `espacio`, `paso` (snap), `onArrastre(fase, key, donde)` (degrees, Euler YXZ, rounded to the wire's steps), `poner`, `sostener` / `retiene` (a held thing ignores its server echoes: no rubber-banding), `pantalla(x, y, z)`, `estado()`, `activo()` (feeds `busy()`). Tested by `tools/e2e-piernas/constructor.mjs` (real mouse, chromium + firefox).
