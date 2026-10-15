# render

The only package that talks to three.js: WebGPU/WebGL2 view, power policy (frame cap, dynamic resolution, battery), crowds (baked VAT), AR and VR sessions, what the page reports about the device (`sesion.ts`), VRM avatars (J1: `avatares.ts`, decisions in `avatares-politica.ts`, the lazy heavy half in `avatares-vrm.ts`).

- **Does not:** Simulation or networking; it imports nothing from other engine packages.
- **Depends on:** three.js, and `@pixiv/three-vrm` + `@pixiv/three-vrm-animation` 3.5.5 (MIT) loaded only by `avatares-vrm.ts` after the first frame (rule: `tools/layers.json`)
- **Tested by:** `test/power.test.ts`, `test/avatares.test.ts`; browser: `tools/auto.sh e2e` (`tools/e2e-piernas/avatares.mjs`)
- **Main API:** `createView` (option `avatares: { catalogo, yo }`; `view.avatares()` says who wears which VRM and which clip plays), `createPower`, `readCaps`, `checkCost`, `createVatCrowd`, `createAR`, `createVR`, `leerAparato`, `medidorDeCuadros` (T1 report; tested by `test/sesiones.test.ts`)
