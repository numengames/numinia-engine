# Límites de esta primera versión (y qué fila de la cola los quita)

- Lo que pones con `state.set(clave, valor, { at: { x, z } })` es **una cosa en el mundo**: llega solo a quien
  está a menos de `state.radius` (64 m por defecto) y cada jugador la recibe u olvida al moverse (J9). Sin
  `at`, el estado llega a todos. En la página, «olvidar» y «borrar» se ven igual (`onChange` con `undefined`).
- Los objetos (puertas, semillas) viven en el estado de su función, con `x` y `z`, y la página los dibuja;
  no son entidades de la simulación (decidido en J9; lo que necesite física, M6).
- El estado se pierde al reiniciar salvo que la función lo declare (`persist`, `store`: ver «Guardar», S4).
- Para dibujar hay `label` y `bounce`; se añaden primitivas en `render` cuando una función las pida.
- Las rutas HTTP viven en el puerto de la instancia; en un servidor instalado, Caddy solo pasa `/ws` y
  `/health`: R1 (`despertar`) ya añadió `/e/*` al instalador y al proxy LAN.
- Para firmar algo (URL de QR, token) usa `api.sign(texto)`: HMAC con el secreto del servidor (`MOTOR_SECRET`); devuelve `""` si no hay secreto, y entonces hay que negarse. Una función no importa `node:crypto`.
- Para dibujar en un punto del mundo hay `view.beacon?.(x, z, texto, ms)` (columna de luz).
- El entorno de la zona (cielo, sol, niebla, viento, suelo) y los elementos (agua, fuego, humo, polvo) llegan a la
  página por `view.entorno?.(valores)` y `view.elemento?.(clave, valores | null)` (H4/H8: `features/entorno`,
  `features/elementos`; el render los lee por nombre de campo). Un mundo trae los suyos en `MUNDO_DIR/entorno.json`
  y `MUNDO_DIR/elementos.json`. El mismo `entorno.json` puede decir dónde aparece la gente: `"aparicion": { "x", "z",
  "radio" }` (metros; el cuadrado de medio lado `radio`, 1–40, centrado en x, z; x y z entre −460 y 460). Sin él, el
  cuadrado de la casa (40 m alrededor del origen). Es del servidor (viaja en la carpeta y el zip del mundo), no del cable.
  `"aparicionFoto": true` (N16, apagado si no está) deja que quien abre el enlace de una foto (`#foto=`) aparezca en
  su sitio (el servidor busca un sitio libre allí; si no hay, la columna de luz le guía como siempre).
- **Cámara del mundo** (P1; `features/entorno`, `packages/render/src/camara*.ts`). El mismo `entorno.json` dice con qué
  vista entra la gente y hacia dónde mira: `"camara": { "inicio": "primera" | "tercera", "distanciaMax": 2.5 }` y
  `"aparicion": { …, "giro": 90 }`. `inicio` es la vista al entrar (se puede cambiar con V o la rueda); sin él, la de
  siempre: tercera persona a unos 10 m. `distanciaMax` (metros, 1–20) es lo más lejos que se pone la cámara detrás de
  ti en tercera persona (en una casa, 2,5; la tercera persona no baja de 1,5 m, el tope manda sobre `distanciaMax`).
  `giro` (grados, −180…180, el mismo que el `giro` de `pnj@1`) es hacia dónde mira quien aparece: 0 mira hacia +z,
  90 hacia +x, 180 hacia −z, −90 hacia −x; sin él mira hacia −z como siempre. Solo al entrar: al volver a tu último
  punto seguro (vacío, Estado) la cámara no se reorienta. Valores mal puestos se rechazan con su ruta y cómo
  arreglarlos. A diferencia del resto de `aparicion`, estos cuatro valores **sí** viajan en el estado del entorno
  (`camaraInicio`, `camaraMax`, `llegadaGira`, `llegadaGiro`), porque la cámara es de la página; son del fichero del
  mundo (como `mapa.corte`): ni el panel de entorno ni un preset los mueven, y cada arranque vuelve a poner los del
  fichero. La cámara también choca con las **mallas** de colisión (las cosas «malla»: casas, suelos de GLB) además de
  las cajas, con una esfera de 0,2 m (`barridoMalla` en `sim/bvh.ts`, sin reservar memoria); y en primera persona el
  plano cercano baja a 0,05 m, así que una pared pegada a la cara no se abre. En VR nada de esto mueve la cámara del
  visor.
- El mismo `entorno.json` dice si la gente puede golpearse (L8, `features/lucha`): `"pvp": true` (apagado si no está) y,
  para arenas o sitios en paz, `"zonasPvp": [{ "id", "x", "z", "radio", "pvp": true|false }]` (círculos en metros; una
  zona en `false` gana a una en `true`). Solo se golpea a otra persona (`objetivo: p:<entidad>`) si **las dos** están donde
  se puede; decide el servidor. Cada golpe sube un escalón de Estado de quien lo recibe (no le quita vida). Sin `pvp` ni zona en `true`, el servidor rechaza el golpe a una persona («Aquí no se lucha entre personas»); `alchemiststower` y los demás mundos no lo activan. La página pone encima de la persona golpeada un rótulo con icono y palabra (`ROTULO` en `features/lucha/client.ts`, por `view.label`: un solo plano por persona, a 8 s, y solo para quien está dentro de los 40 m del golpe); decidir, decide siempre el servidor.
- El mismo `entorno.json` puede tener **vacío** (D-045, `features/suelo`): `"sueloMinimo": -4` (metros, −500…500) es
  la altura bajo la cual se ha caído; el servidor guarda cada medio segundo (`SEGURO_CADA` ticks) dónde pisaba suelo
  cada persona y, al bajar de ahí, la recoloca en ese sitio **dentro del paso de simulación** (una orden grabada con
  las entradas: la repetición la reproduce; sin `sueloMinimo` nadie se mueve solo y la huella de referencia no cambia).
  Opcional `"vuelta": { "x", "y", "z", "siempre": true }`: un punto fijo al que volver mientras no se conoce un sitio
  seguro (con `siempre`, siempre). La página hace un fundido (`view.fundido(ms)`) y el evento `suelo.vuelta` (importancia
  2) lo lee el lector de pantalla: «Has vuelto a un sitio seguro». El cable (D-041) y quien se queda atascado piden lo
  mismo con la intención `suelo.volver` (la acción «vuelve_a_seguro»; una vez cada 5 s); una función del servidor, con
  `api.volverASeguro(e)` o `api.onVuelta(cb)`. Prueba sin pantalla: `test/suelo.test.ts`; con hueco: `tools/e2e-piernas/suelo.mjs`.
- Una función puede mover a un jugador a propósito con `api.teletransportar(e, { x, y, z }, { radios, rumbo, caida })`
  (N16): la instancia busca el primer sitio libre cerca (dentro del mundo, en un suelo como mucho `caida` m más
  abajo, sin sólidos; anillos `radios` en metros, ocho rumbos desde `rumbo` 0-7) y devuelve dónde quedó, o null sin
  mover nada. Decide antes si puede ir (permisos, ritmo): la instancia solo comprueba el sitio.
- Un mundo que es por dentro de un edificio puede cortar sus mapas a una altura, como la planta de un arquitecto:
  `"mapa": { "corte": 6 }` en el mismo `entorno.json` (metros sobre el suelo, 0–60; sin él o 0, los mapas de siempre).
  Con corte, el mapa grande dibuja la zona sin lo que queda por encima (el techo, las entreplantas), sin sombras, y
  encima las paredes, columnas y puertas que corta el plano (tinta; el vidrio en azul claro); el minimapa usa ese mismo
  dibujo de fondo y no pinta la caja entera de lo que es más alto que el corte. Lo dice el fichero del mundo en cada
  arranque (U14: `packages/render/src/cenital.ts`, `corte.ts`; `apps/plaza/mapa.ts`).
- Un agente usa el mismo camino que una persona: lee el catálogo y envía intentos (P4 hará el SDK).
