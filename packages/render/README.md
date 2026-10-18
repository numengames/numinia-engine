# render

The only package that talks to three.js: WebGPU/WebGL2 view, power policy (frame cap, dynamic resolution, battery), crowds (baked VAT), AR and VR sessions, what the page reports about the device (`sesion.ts`), the camera (`camara.ts`, N1), VRM avatars (J1: `avatares.ts`, decisions in `avatares-politica.ts`, the lazy heavy half in `avatares-vrm.ts`).

- **Does not:** Simulation or networking; it imports nothing from other engine packages.
- **Depends on:** three.js, and `@pixiv/three-vrm` + `@pixiv/three-vrm-animation` 3.5.5 (MIT) loaded only by `avatares-vrm.ts` after the first frame (rule: `tools/layers.json`)
- **Tested by:** `test/power.test.ts`, `test/camara.test.ts`, `test/avatares.test.ts`; browser: `tools/auto.sh e2e` (camera: `tools/e2e-piernas/camara.mjs`, avatars: `tools/e2e-piernas/avatares.mjs`, names and bubbles: `tools/e2e-piernas/chat.mjs`)
- **Main API:** `createView` (option `avatares: { catalogo, yo }`; `view.avatares()` says who wears which VRM, which clip plays and which move; J7b: `view.movimiento(target, mov | null)` plays a move of the wheel on a VRM — lead-in clips once, then loop / once / hold, ended by walking, jumping or its time limit, each clip fetched when first played; decisions `pasoDeMovimiento`/`movimientoOcupa` in `avatares-politica.ts`), `createPower`, `readCaps`, `checkCost`, `createVatCrowd`, `createAR`, `createVR`, `leerAparato`, `medidorDeCuadros`, `limitesGraficos` (N2: largest texture), `power.setCalidad`/`setResolucion` (N2 menu) (T1 report; tested by `test/sesiones.test.ts`), `haciaMundo` (N1: a movement intention turned by the camera's yaw); J3 (`nombres.ts`): `view.nameTag(target, text | null)` (nearest 32 within 24 m, never over yourself), `view.bubble(target, text, ms)` (wrapped, 6 lines), `view.setHeadTop(fn)` (where names, bubbles and labels sit: the capsule's top today, the VRM head later), `view.nameTags()` / `view.bubbles()` for checks
- **M22 builder's hands (`gizmo.ts`):** `view.pick(clientX, clientY)` → key of the placed thing under the pointer; `view.puntoBajo(clientX, clientY, ignorar?)` → point on the ground (y = 0) or on other things; `view.editor`: `seleccionar(key)` (yellow outline), `herramienta("mover" | "girar" | "escalar" | null)` (three's TransformControls, X red, Y green, Z blue, downloaded on first use: not in the start bundle), `eje`, `espacio`, `paso` (snap), `onArrastre(fase, key, donde)` (degrees, Euler YXZ, rounded to the wire's steps), `poner`, `sostener` / `retiene` (a held thing ignores its server echoes: no rubber-banding), `pantalla(x, y, z)`, `estado()`, `activo()` (feeds `busy()`). Tested by `tools/e2e-piernas/constructor.mjs` (real mouse, chromium + firefox).
- **H9:** `view.sueloBajo(clientX, clientY)` — the ground point (y = 0) under a point of the screen, or null (sky / too far): where a dropped file lands. Tested by `tools/e2e-piernas/subir.mjs`.
- **The zone from above (J5, `src/cenital.ts`):** `view.cenital({ px, incluir, modo })` → a top-down picture (orthographic render + readback on WebGPU/WebGL2; footprints when that fails), `view.huellas()`, `view.cenitalVersion()`; only `world` children with `userData.mapa` ("suelo" or true) or named `objeto:<key>` are drawn. Waypoints: `view.waypoint(x, z, text) → id`, `view.dropWaypoint(id)` (a beacon kept until dropped, not counted by `busy()`). Browser: `tools/e2e-piernas/mapa.mjs`.
- **Draw calls for Quest (N12, `src/dibujo-politica.ts` pure + `src/lotes.ts`):** only while a frame is drawn, (a) what the fog covers completely (things, people, VRMs, names over things whose whole bounding sphere is past `niebla.lejos` + 1 m; the fog itself is never changed) is not drawn, and (b) still copies of one model and colour — baked, or whole models with no clips, skins or multi-material meshes — from `INSTANCIAR_DESDE` (4) on are drawn as one `InstancedMesh` per material, and so are the capsules of people who wear no VRM. Outside the frame every object is as before (picking, the map, footprints, hands, gizmo). `view.dibujo()` → `{ lejos, niebla, instanciadas, lotes, mallas, escrituras }` for checks. Tested by `test/dibujo.test.ts`; draw calls measured in a browser (the N12 PR).
- **Animated models in few draw calls (N15, `src/fundir.ts`):** a model placed with `animate` and clips is fused ONCE per file at load time (never on disk): every piece becomes part of one `SkinnedMesh` per look sharing one skeleton — pieces hanging from a node are skinned to it with weight 1, skins keep their bones, a face keeps its morph targets (morph tracks are pointed at the fused mesh), and materials that differ only in colour become one with the colour in the vertices. The house robot goes from 19 meshes to 1 (and 19 shadow draws to 1). Nodes keep their names and places, so clips move the same nodes; whatever it cannot fuse (lines, sprites, multi-material meshes, two faces sharing weights, different attributes) stays as it was. Tested by `test/fundir.test.ts` (every vertex and colour against the unfused model at several moments of each clip, on the CPU).
- **Environment and elements (H4/H8/H12):** `view.entorno` (`entorno.ts`: `aplicar(valores)`, `estado()`, `calidad({ sombras, agua, particulas, hdr })`, `capacidades()`, `simularNivel(n)`), `view.elementos` (`elementos-vista.ts` → lazy `elementos.ts`: `poner(clave, valores | null)`, `contar()`), GPU particles in `particulas.ts` (one draw call per emitter), pure tier/quality rules in `calidad.ts` and curves/flicker in `curvas.ts` (tested by `test/particulas.test.ts`).

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
