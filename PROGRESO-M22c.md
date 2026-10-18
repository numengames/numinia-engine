# M22c — encajes, selección múltiple y mover/borrar en grupo — PROGRESO

Rama: `constructor/encajes-seleccion-jerarquia` (worktree
`numinia-engine-wt-encajes`), desde `origin/main`. No toca `tren/motor-2026-10-18`
ni los worktrees de los otros dos Fables (constructor móvil/VR, voz+pantalla
compartida) — comprobado con `ls work/` antes de nombrar este worktree.

## PASO 1 — lista
Ver `work/mmo-browser-study/EDITOR-MUNDO-PULIDO.md` (8 ítems: 4 de M22c +
4 de UX general encontrados probando el editor).

## PASO 2 — construido de verdad

- `packages/render/src/encaje.ts` (nuevo): geometría pura del encaje (AABB,
  enfrentamiento de caras, mejor hueco entre varios candidatos). Sin three.js
  ni DOM — `node --test` sin servidor gráfico. `test/encaje.test.ts`, 3 tests.
- `packages/render/src/gizmo.ts`: engancha el encaje al arrastrar con
  `TransformControls` cuando hay un solo eje elegido; contorno secundario
  (`outlineVarios`) para dibujar la selección múltiple sin gizmo propio.
- `features/objetos/feature.ts`: campo `lote` (texto, opcional) en los
  intents `mover`/`borrar`/`fijar`; versión del feature 5 → 6 (compatible:
  páginas viejas mandan `lote: ""` por defecto, sin agrupar).
- `features/objetos/server.ts`: la pila de deshacer pasa de una entrada por
  objeto a una entrada con una lista de objetos (`items`); `apuntar()` junta
  en una sola entrada lo que llega con el mismo `lote` en menos de 1 s (o,
  sin lote, lo que es un arrastre continuo del mismo objeto — igual que
  antes). `volver()` (deshacer/rehacer) reescrito para mover/restaurar la
  lista entera a la vez.
- `features/objetos/client.ts`: `estado.seleccionados` (lista), `seleccionarVarios`,
  `alternarSeleccion` (Mayús+clic), `transformar(id, cambio, lote?)`,
  `borrarId`/`fijarId` con `lote`, `nuevoLote()`.
- `apps/plaza/constructor.ts`: Mayús+clic suma/quita del grupo; arrastrar el
  gizmo del primario mueve en vivo a todo el grupo (traslación) y al soltar
  manda todos los `mover` con el mismo lote; Supr/Retroceso y el botón
  "Borrar" borran el grupo entero con un lote compartido; la barra de estado
  avisa cuántos hay seleccionados; ayuda (`?`) actualizada.
- `docs/BACKLOG.md`: fila M22c marcada "en progreso" + detalle de qué se
  hizo y qué falta.
- SemVer: `0.3.1` → `0.3.2` (package.json + package-lock.json).

`npm test`: **382 tests, todos en verde** (incluye los 2 tests nuevos de
`encaje.test.ts`, 4 tests nuevos de selección múltiple/grupo en
`objetos.test.ts`; `test/chat.test.ts` es un timing flaky conocido bajo carga
de CPU — confirmado en verde al correrlo solo).

## Qué queda para otra pasada
- Caja de arrastre (rubber-band) para seleccionar varios dibujando un
  rectángulo — hoy solo Mayús+clic uno a uno.
- Girar/escalar el grupo como unidad (hoy el grupo solo se traslada junto;
  girar/escalar con varios seleccionados solo toca al primario).
- Panel de jerarquía: el esquema de `features/objetos` no tiene padre-hijo
  todavía — es una decisión de diseño (¿campo `padre: id`? ¿se hereda la
  transformación?), no un pulido de UI. No se ha simulado con una lista
  plana para no prometer una jerarquía que no existe.
- Aviso visible cuando la biblioteca sale vacía por falta del rol de
  construir (`MOTOR_CONSTRUIR`) — hoy parece un fallo del editor.
- Guía visual de "cuánto falta para encajar" mientras se arrastra (hoy solo
  salta al encajar, sin aviso previo).
- El e2e de Playwright del propio BACKLOG («dos bloques encajan + tres
  seleccionados se deshacen en un paso») no se ha grabado en el navegador
  real; lo cubierto aquí son los tests de `node --test` del servidor/cliente.

Sin push ni PR abierto. Script listo: `work/pr-encajes-motor.sh`; cuerpo:
`work/numinia-engine-PR-encajes-body.md`.
