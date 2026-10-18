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
