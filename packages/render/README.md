# render

The only package that talks to three.js: WebGPU/WebGL2 view, power policy (frame cap, dynamic resolution, battery), crowds (baked VAT), AR and VR sessions, what the page reports about the device (`sesion.ts`).

- **Does not:** Simulation or networking; it imports nothing from other engine packages.
- **Depends on:** three.js only (rule: `tools/layers.json`)
- **Tested by:** `test/power.test.ts`; browser: `tools/auto.sh e2e`
- **Main API:** `createView`, `createPower`, `readCaps`, `checkCost`, `createVatCrowd`, `createAR`, `createVR`, `leerAparato`, `medidorDeCuadros` (T1 report; tested by `test/sesiones.test.ts`)
- **Environment and elements (H4/H8/H12):** `view.entorno` (`entorno.ts`: `aplicar(valores)`, `estado()`, `calidad({ sombras, agua, particulas, hdr })`, `capacidades()`, `simularNivel(n)`), `view.elementos` (`elementos-vista.ts` → lazy `elementos.ts`: `poner(clave, valores | null)`, `contar()`), GPU particles in `particulas.ts` (one draw call per emitter), pure tier/quality rules in `calidad.ts` and curves/flicker in `curvas.ts` (tested by `test/particulas.test.ts`).
