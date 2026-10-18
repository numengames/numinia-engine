# PROGRESO — auditoría de UI móvil (numinia-engine, apps/plaza)

Rama: `movil/audit-ui-2026-10-18` · worktree: `work/numinia-engine-wt-movil-ui`
Commit local (sin subir): `fix(ui): objetivos táctiles de 44px, HUD y chat que no caben en móvil`

## Cómo se hizo

Playwright (`playwright-core`, ya era devDependency, mismo chrome-headless-shell
que usa `tools/e2e.mjs`) contra `npm run dev` + `npm run server`, en dos
viewports con emulación táctil (`hasTouch: true`, `isMobile: true`):

- iPhone: 390×844, `deviceScaleFactor: 3`
- Android: 412×915, `deviceScaleFactor: 2.6`

Script: `tools/auditoria-movil.mjs <etiqueta>` dentro del worktree — genera
`docs/auditoria-movil/<etiqueta>/{iphone,android}-NN-escena.png` y, por
consola, mide con `getBoundingClientRect()` el tamaño real de los botones
táctiles. No se commitean las capturas (son evidencia de auditoría, no
assets del producto); quedan en el worktree.

## Capturas (rutas absolutas, antes → después)

Todas bajo `/var/home/uruk/arkhitektonian-lab/.hermes/profiles/ursa/work/numinia-engine-wt-movil-ui/docs/auditoria-movil/`

| Escena | Antes | Después |
|---|---|---|
| HUD inicial (iPhone) | `antes/iphone-01-hud.png` | `despues/iphone-01-hud.png` |
| HUD inicial (Android) | `antes/android-01-hud.png` | `despues/android-01-hud.png` |
| Joystick virtual (iPhone) | `antes/iphone-02-joystick.png` | `despues/iphone-02-joystick.png` |
| Joystick virtual (Android) | `antes/android-02-joystick.png` | `despues/android-02-joystick.png` |
| Libro de misiones (iPhone) | `antes/iphone-03-misiones.png` | `despues/iphone-03-misiones.png` |
| Libro de misiones (Android) | `antes/android-03-misiones.png` | `despues/android-03-misiones.png` |
| Menú de ajustes (iPhone) | `antes/iphone-04-ajustes.png` | `despues/iphone-04-ajustes.png` |
| Menú de ajustes (Android) | `antes/android-04-ajustes.png` | `despues/android-04-ajustes.png` |
| Chat abierto (iPhone) | `antes/iphone-05-chat.png` | `despues/iphone-05-chat.png` |
| Chat abierto (Android) | `antes/android-05-chat.png` | `despues/android-05-chat.png` |

## Qué muestra cada antes/después

1. **`01-hud`**: antes, la 2ª y 4ª línea del HUD se salen por el borde
   derecho y la última queda oculta detrás del minimapa («…st», hash
   cortado). Medido: 445 px de caja en un viewport de 390 px. Después:
   170 px, cada línea recorta con «…», nada se sale ni se esconde.
2. **`02-joystick`**: confirma que el joystick virtual (aparece donde se
   toca, mitad izquierda) no se solapa con el minimapa ni con los botones
   de acción en ningún caso probado — se mantiene así antes y después.
3. **`03-misiones`**: antes, el botón «Misiones» medía 37 px de alto; en
   la versión "después" intermedia (botones del minimapa ya a 44 px) se
   detectó una regresión propia — el libro empezaba a tocar la fila de
   botones del minimapa — corregida ajustando los huecos con variables CSS
   antes de esta captura final, que ya no la muestra.
4. **`04-ajustes`**: el interruptor «Modo batería» mide 22×22 px (antes) →
   26×26 px y la fila completa pasa a ≥44 px de alto (después), con el
   `<label for>` ya existente activándolo al tocar el texto.
5. **`05-chat`**: antes, el campo de texto mide ~80 px y el placeholder
   «Escribe y pulsa Enter (Esc cierra)» se corta a media palabra. Después,
   300 px, texto completo legible.

## Medidas (`getBoundingClientRect`, iPhone 390×844)

| Elemento | Antes | Después | Objetivo |
|---|---|---|---|
| `#hud` ancho | 445 px (viewport 390) | 170 px | que no se salga del viewport |
| `#misiones` alto | 37 px | 44 px | ≥44 px |
| `#saltar` alto | 39 px | 44 px | ≥44 px |
| `#chat-boton` alto | 35 px | 44 px | ≥44 px |
| botones minimapa (−/+/N/Mapa/Ficha) alto | 28-31 px | 44 px | ≥44 px |
| `#chat-texto` ancho | 80 px | 300 px | legible al escribir |
| checkbox de un ajuste | 22×22 px | 26×26 px (+ fila ≥44 px) | objetivo táctil real |

## npm test

`npm test` → 376/376 verdes (ver terminal; un fallo de temporización en
`test/chat.test.ts` al correr la suite completa, por contención de CPU de
otro proceso activo en la máquina — reproducido limpio y en verde al
aislarlo: `node --test test/chat.test.ts`).

## SemVer

`package.json` / `package-lock.json`: `0.3.1` → `0.3.2`.

## Incidente durante el trabajo (transparencia)

Al preparar el entorno maté por error, con un `pkill` demasiado amplio, el
proceso del servidor de otra sesión activa (worktree
`numinia-engine-wt-noche-limites-medir`, puerto 8795) que estaba corriendo
un test de carga (`packages/server/src/swarm.ts`, informe en
`/tmp/carga-test/informes/2026-10-17-23-34-local-ryzen9-7950x.{json,md}`,
veredicto final «NO PASA»). Esa sesión relanzó su propio script, que al
terminar hace `pkill -f "src/main.ts"` — un patrón que también mata
cualquier otro servidor del motor en la máquina, incluido el mío; volvió a
pasar un par de veces más durante esta auditoría y tuve que reiniciar mi
propio servidor (puerto 8791) cada vez. No toqué la rama `tren/motor-…` ni
nada de esa sesión; solo quedó afectado el proceso compartido de puerto.
Aviso para quien revise: el informe de carga de esa sesión en
`/tmp/carga-test/` puede no ser representativo si se solapó con mi kill
inicial — conviene volver a correrlo limpio.

## Pendiente (lo más importante)

**Nada de esto se ha probado en un móvil real** — todo es auditoría y
arreglo emulados con Playwright (viewport + `hasTouch`, sin un dedo ni una
pantalla de verdad). Antes de dar esto por cerrado falta:

- Repetir en un iPhone y un Android reales conectados por USB (igual que se
  hizo para U13 con un Quest real): tamaño real del dedo, teclado en
  pantalla al escribir en el chat, zoom del sistema, gestos del navegador.
- Confirmar que el joystick virtual nunca queda tapado por un panel abierto
  con el dedo de verdad (con ratón emulado no se vio overlap, pero no es lo
  mismo).
- Medir con dpr distintos a 2.6-3 (hay Android con dpr 2 o menor).

# PROGRESO · constructor/tactil-minimo (M22b-1)

Rama `constructor/tactil-minimo` desde `origin/main` 749e99a · worktree `work/numinia-engine-wt-constructor-tactil` · 18-10-2026.
Diseño del que sale: `work/mmo-browser-study/MODO-CONSTRUCTOR-MOVIL-VR.md` (M22b entero: móvil + VR, 5 historias).

## Historias
- [x] M22b-1 Táctil mínimo: toque selecciona, arrastrar mueve, sin asas en «mover», botones ≥ 44 px, hoja inferior en teléfono estrecho. Pierna e2e por CDP. SemVer 0.11.0. (esta rama)
- [ ] M22b-2 Dos dedos giran / pellizcan / suben; retícula + «Colocar aquí»; pulsación larga = inspector; radio de gracia; TC apagado del todo en táctil; hoja 3 estados; `#barra-objeto` que quepa en 360 px.
- [ ] M22b-3 VR con mando (`pickRayo`, `soltar`/`palanca`, `constructor-xr.ts`, barra 3D, fila «Construir» en el reloj).
- [ ] M22b-4 VR con manos + cara «Construir» del reloj.
- [ ] M22b-5 Prueba real en iPhone / Android / Quest 3S con Pablo.

## Qué hay (ficheros)
- `apps/plaza/constructor.ts`: capa de dedo (`document`, captura): `pointerdown` con `pointerType !== "mouse"` sobre el canvas → `ed.pick`; si hay cosa: `stopPropagation`, `setPointerCapture`, `cam.bloquear(true)`, `c.seleccionar`. `pointermove` > 6 px → `ed.sostener`, desfase = cosa − `puntoBajo(toque inicial)`; cada movimiento `ed.poner(puntoBajo + desfase)` con el paso del panel y `programarEnvio` (≤ 8/s). `pointerup/cancel` → `terminarEnvio`, `ed.sostener(null, final)`, `cam.bloquear(false)`. `tactil` (media query o primer toque) apaga TransformControls en «mover». Ayuda nueva en el panel. CSS ≥ 44 px en `(pointer: coarse)`.
- `apps/plaza/tema.css`: `(pointer: coarse) and (max-width: 700px)`: `#panel-construir` hoja inferior ≤ 38 vh; `#panel-entorno` tira 46 vw × 22 vh arriba a la izquierda.
- `tools/e2e-piernas/constructor-tactil.mjs`: pierna nueva (chromium, `Input.dispatchTouchEvent`, viewport 420×800 `hasTouch`+`isMobile`).
- `docs/BACKLOG.md` (M22b partida en M22b-1..5 + «Hecho M22b-1»), `docs/JUGADOR.md` (fila «Con el dedo»), `docs/RUNLOG.md`, `package.json` + lock 0.11.0.

## Medido
- `npm test`: 376/376. `npm run gates`: todo en verde (tick p99 12,3 ms; 26,7 kbit/s).
- `constructor-tactil.mjs`: 8/8 (toque selecciona, yaw 0→0; arrastre 150 px = 5,2 m, B lo ve; sin asas; vacío deselecciona; deshacer en B; borrar).
- `constructor.mjs` (ratón, chromium): 11/11. Firefox no se corrió aquí (máquina con carga 19 por la otra sesión; `tools/auto.sh e2e` lo corre).

## NO probado
- Ningún teléfono ni Quest real. Solo chromium con emulación táctil (`pointer: coarse`, 1 punto de contacto): el `dblclick` táctil, `navigator.vibrate`, Safari iOS (sus `pointer` events sobre canvas, el rebote de scroll) y Android Chrome quedan para M22b-5.
- Dos dedos a la vez (la capa se traga el segundo dedo mientras arrastras; no hace nada con él hasta M22b-2).

## Defectos conocidos (se envían así; M22b-2)
- `#barra-objeto` (5 botones ≥ 44 px) se sale por la derecha en 420 px: «Borrar» queda cortado.
- Los botones de acción del móvil (Saltar, Saludar, Bailar, Recoger) se montan sobre la hoja inferior.
- El HUD de depuración (arriba a la izquierda) pisa la tira de entorno.
- Un arrastre corto mueve mucho si la cosa está lejos (es geometría de rayo: 150 px ≈ 5 m a 10 m de distancia); habrá que medir en mano si molesta.

## Cómo seguir
- PR: `work/pr-constructor-tactil.sh` (NO lanzado; cuerpo en `work/numinia-engine-PR-constructor-tactil-body.md`). Puede chocar en `package.json`/`BACKLOG.md`/`RUNLOG.md` con el tren `tren/motor-2026-10-18` si entra antes: resolver tomando los dos.
- Correr la pierna sola: servidor `PORT=8796 MOTOR_CONSTRUIR=todos DATOS_DIR=/tmp/x node packages/server/src/main.ts`, vite `PLAZA_PORT=5231 npx vite --config apps/plaza/vite.config.mjs --strictPort`, y `BASE="http://127.0.0.1:5231/?webgl2&server=ws://127.0.0.1:8796" node tools/e2e-piernas/constructor-tactil.mjs`. Ojo: si el puerto de vite ya lo usa otro worktree, vite muere y pruebas contra el código de otro (me pasó con 5178).
