# Salón de los Ancestros y el tributo a Asimov (ancestros v1)

`features/ancestros` es el Salón de los Ancestros del Ateneo (el Ayuntamiento de Numinia, donde el Consejo de Sabios
expone y prueba sus proyectos: `numinia-archive/lore/game/manual/es/05-geografia-y-cultura-de-numinia.md`) y, dentro,
un homenaje a Isaac Asimov. Todo lo decide el servidor; la página dibuja y pregunta.

- **El mundo elige si lo tiene:** `entorno/ancestros.json` (`{ "hologramas": [{ id, nombre, x, z, y?, rumbo?, radio? }], "muros":
  [{ id, x0, z0, x1, z1, y0?, y1? }] }`). Sin fichero, la sala de la casa en (0, −48) con Asimov; con las dos listas vacías,
  **ningún salón ni holograma** (un mundo en blanco: la plantilla «lienzo»); una lista que falta deja esa mitad como la de la
  casa; cada línea mal escrita se deja fuera y el registro dice cuál (`features/mundo.ts`, `test/ancestros.test.ts`).
- **La sala:** cuatro muros de piedra con puerta al sur (hacia la plaza), en `SALON` (`x: 0, z: -48`, 12 m de lado,
  4 m de alto). Cada muro es una cosa del estado con `solido` y su caja `bx0…bz1`: **la misma caja la lee la simulación**
  (`solidsFrom`), así que lo que ves es lo que te para, sin tocar `packages/sim`. Los muros no tienen nombre: ni ficha
  ni rótulo, solo decorado.
- **El holograma** («asimov»): una cosa con ficha (`objeto`, acción `hablar`) e `interact` a `radio` m (3). En 3D
  (`packages/render/src/ancestros.ts`) es un **busto que evoca sin imitar**: pedestal, cono de luz y cabeza + hombros de
  geometría simple en cian translúcido con una malla encima. Nada de .glb ni de modelos realistas.
- **Cercanía:** el servidor mira cada `CADA_TICKS` quién está a `DESPIERTA_M` (8 m) de cada holograma (el mismo patrón
  de las misiones con `llega_a`), pone `encendido` en el estado (lo ven todos) y avisa **solo a quien llegó**
  (`despierta`). Con histéresis: se apaga a `DUERME_M` (10 m), para que nadie lo haga parpadear en el borde. Encendido,
  en la página se vuelve hacia ti y titila; es lo único que cuesta un cuadro, y solo si estás a `VIVO_M` (40 m).
- **Hablar** (`E` o pinchar su nombre): el servidor dice la **siguiente de las Tres Leyes** (1, 2, 3, 1… por holograma,
  igual para todos, sin azar) y, al lado, **una de nuestras cuatro reglas AGW** elegidas (`NUESTRAS`: AGW-007, 003, 006,
  012; rotan solas). Evento `dice` a quien habló y a quien está a `CERCA_M` (14 m): el anuncio lo lee en voz al lector
  de pantalla; la página pone una placa sobre su cabeza (9 s) y, a quien le habló, el panel `#ancestros-panel` (Esc o
  «Cerrar»). Lejos: `rechazado` con el motivo.
- **Los dos paneles** detrás del holograma (las Tres Leyes · «Las nuestras, 80 años después») los pinta la página una
  vez por texto (`view.ancestros.paneles`), con los textos que la función le da (`ancestros.textos`), para que un agente
  lea lo mismo.
- **Voz:** ninguna. No hay TTS propio del motor (V3) y **queda prohibido clonar la voz real de Asimov** (derechos de
  su patrimonio). Cuando V3 exista, que lea el texto con una voz genérica grave y pausada de narrador. El rótulo del
  holograma, la ficha y el panel dicen siempre «dramatización, no una grabación».
- **Lo que no hace (todavía):** más hologramas de otros Ancestros (basta con pasar `hologramas` a `crearAncestros`),
  un fichero `MUNDO_DIR/ancestros.json` como el de las torres de dados, techo y luz propia en la sala, y una pose
  del busto que siga tu altura.
