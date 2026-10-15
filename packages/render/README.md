# render

The only package that talks to three.js: WebGPU/WebGL2 view, power policy (frame cap, dynamic resolution, battery), crowds (baked VAT), AR and VR sessions.

- **Does not:** Simulation or networking; it imports nothing from other engine packages.
- **Depends on:** three.js only (rule: `tools/layers.json`)
- **Tested by:** `test/power.test.ts`; browser: `tools/auto.sh e2e`
- **Main API:** `createView`, `createPower`, `readCaps`, `checkCost`, `createVatCrowd`, `createAR`, `createVR`
