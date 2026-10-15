# render

The only package that talks to three.js: WebGPU/WebGL2 view, power policy (frame cap, dynamic resolution, battery), crowds (baked VAT), AR and VR sessions, what the page reports about the device (`sesion.ts`), the camera (`camara.ts`, N1).

- **Does not:** Simulation or networking; it imports nothing from other engine packages.
- **Depends on:** three.js only (rule: `tools/layers.json`)
- **Tested by:** `test/power.test.ts`, `test/camara.test.ts`; browser: `tools/auto.sh e2e` (camera: `tools/e2e-piernas/camara.mjs`)
- **Main API:** `createView`, `createPower`, `readCaps`, `checkCost`, `createVatCrowd`, `createAR`, `createVR`, `leerAparato`, `medidorDeCuadros` (T1 report; tested by `test/sesiones.test.ts`), `haciaMundo` (N1: a movement intention turned by the camera's yaw)
- **M22 builder's hands (`gizmo.ts`):** `view.pick(clientX, clientY)` → key of the placed thing under the pointer; `view.puntoBajo(clientX, clientY, ignorar?)` → point on the ground (y = 0) or on other things; `view.editor`: `seleccionar(key)` (yellow outline), `herramienta("mover" | "girar" | "escalar" | null)` (three's TransformControls, X red, Y green, Z blue, downloaded on first use: not in the start bundle), `eje`, `espacio`, `paso` (snap), `onArrastre(fase, key, donde)` (degrees, Euler YXZ, rounded to the wire's steps), `poner`, `sostener` / `retiene` (a held thing ignores its server echoes: no rubber-banding), `pantalla(x, y, z)`, `estado()`, `activo()` (feeds `busy()`). Tested by `tools/e2e-piernas/constructor.mjs` (real mouse, chromium + firefox).

## The camera (`view.cam`, N1)

`camara-orbita.ts` holds the arithmetic (pure, no DOM, no three.js); `camara.ts` listens to the page and moves the
three.js camera. `view.draw()` calls `cam.update()`; while XR presents, the XR code drives the camera instead.

| Call | What it does |
|---|---|
| `update(dt, feet \| null)` | moves the camera for this frame (view.draw calls it) |
| `yaw()` | where the camera looks, radians: 0 = along -z, + = turned left (three's `rotation.y`). Movement turns with it |
| `modo("juego" \| "construir")` | play: follows your avatar. Build: a free editor camera (the builder switches it). Returns the mode |
| `frame(center, radius)` | build mode: smoothly look at a sphere (the builder calls it on F). `false` in play mode |
| `bloquear(on)` | while true, drags and the wheel do not move the camera (a gizmo drag, a grab mode that owns the wheel) |
| `ocupada()` | true while dragging, a key or stick is held, or it still settles: OR it into `view.busy()` (power policy P2) |
| `primeraPersona()` | the camera is inside your own body: render hides your avatar (the avatars branch hides its VRM too) |
| `acercar(steps)`, `girar(dYaw, dPitch)`, `reiniciar()`, `alternarVista()` | the same as the keys, for agents and tests |
| `tieneDedo(pointerId)` | the page's joystick leaves this finger alone (it orbits) |
| `mando()` | a gamepad's left stick `[x, z]` in the camera's frame, or `null` |
| `estado()` | for checks: mode, yaw, pitch, distance, pivot, camera position, still or not |

Input map: `docs/JUGADOR.md` § Cámara y controles. Who owns what: the camera never stops an event; in build mode it
ignores plain left presses (selection and gizmos are the builder's), and a left drag in play mode swallows only the
`click` that would follow it.
