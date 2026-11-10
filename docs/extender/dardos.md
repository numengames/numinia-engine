# Dardos (v1, con duelo en v2): una diana en la plaza, en tu móvil y en tu pared (AR)

`features/dardos` es un minijuego que decide el servidor: una diana es una cosa del mundo (igual que un sitio de
pesca), una tirada son tres dardos, y en cada dardo **el jugador elige adónde apunta y con qué fuerza lanza; el
servidor decide dónde se clava**. Los mismos verbos en el PC, en el móvil y en AR.

- **Verbos.** `jugar{sitio}` empieza la tirada (la diana queda `ocupado`); `lanzar{sitio, x, y, fuerza, via?}` lanza un
  dardo: `x, y` = el punto de la cara adonde apuntas, en radios de la diana (0, 0 el centro, y hacia arriba, 1 = el
  borde exterior del doble); `fuerza` 0-1; `via` (v4, opcional; `raton` si falta, así que un cliente de la v3 sigue
  valiendo) = cómo se lanzó: `raton`, `teclado`, `tactil`, `vr` o `ar`. Un `lanzar` sin tirada la empieza (un agente puede simplemente lanzar).
  `salir{}` la deja donde esté (lo lanzado cuenta). Alejarse del radio, desconectarse o 60 s sin lanzar
  (`TURNO_INACTIVO_S`) la cierran también.
- **Dónde cae** (`aterrizaje`, pura): con `FUERZA_IDEAL = 0,65` el dardo va recto **dentro de una zona** (v4:
  `ZONA_FUERZA[via]`, tabla exportada de `features/dardos/feature.ts`: ratón y teclado ±0,04 —±44 ms de una rampa de
  1,1 s—, táctil ±0,07, VR y AR ±0,06; el servidor la elige por la `via` del tiro y el cliente dibuja **ese mismo
  número**). Dentro no hay caída ni dispersión extra. Fuera, solo cuenta lo que se sale (`e = |Δ| − zona`): más flojo
  **cae** (`CAIDA = 1,6` radios por unidad de `e`) y se abre (`ABRE_FLOJO = 0,5`); más fuerte **sube**
  (`SUBIDA = 0,85`) y se abre más (`ABRE_FUERTE = 1,0`). Encima, un **pulso** (`TEMBLOR = 0,08` radios en un tiro perfecto):
  un punto uniforme en un disco cuya dirección sale de un hash del tick en que llegó el tiro, quién tiró, qué
  dardo y qué diana (`azarDe`) — sin `Math.random`: los mismos tiros en los mismos ticks caen en el mismo sitio
  (la prueba lo fija). Apuntar al centro con la fuerza dentro de la zona da bull siempre y diana (50) ~87 de cada 100 (con el pulso de 0,15 de la v3 era 1 de cada 4). El servidor no puede comprobar la `via` ni el imán de un cliente trucado: la zona es justicia entre aparatos honestos, el `TEMBLOR` es lo que protege.
- **Puntuación** (`resolverTiro`, `sectorDe`, `polar`, puras; proporciones de una diana real de 451 mm con el radio
  del doble = 1): `ANILLOS` (dobleBull ≤ 0,0747 = 50, bull ≤ 0,187 = 25, triple 0,582-0,629 = ×3, doble
  0,953-1,0 = ×2, fuera > 1 = 0) y `SECTORES` (los 20 reales, horario desde arriba). La pintura de la diana
  (`packages/render/src/diana.ts`, canvas 2D, una sola función para la vista de tiro, la diana 3D de la plaza y la de
  AR) usa los mismos números: la prueba comprueba que coinciden.
- **Eventos.** `turno` (solo a ti), `dardo{quien, sitio, numero, x, y, sector, anillo, multiplicador, puntos,
  tirada, texto}` (a ti y a quien esté a `CERCA_M`: ven caer tus dardos), `fin` (igual; quien se alejó más de
  `CERCA_M` lo recibe directo), `marcador` (por invitado en el almacén, `d:<id>`: dardos, puntos, mejor dardo,
  mejor tirada, dianas; al identificarte y tras cada `fin`), `rechazado{motivo}`.
- **Diana** = cosa del mundo (`state` con `at`, ficha `lugar`, `interact: { intent: "jugar", prompt: "tirar
  dardos" }`): «E: tirar dardos» al lado. Campos: nombre, x, y, z, radio (desde dónde se tira) y `rumbo` (hacia
  dónde mira la cara; sin él, hacia el centro de la plaza). Por defecto una (`SITIOS_DEFECTO`, suroeste, lejos de
  lo demás); un mundo trae las suyas en `MUNDO_DIR/dardos.json` (`{ "sitios": [{ id, nombre, x, y, z, radio,
  rumbo? }] }`, mismo patrón que `pesca.json`).
- **Página** (`features/dardos/client.ts` = el controlador: turno, dardos clavados por diana, marcador;
  `apps/plaza/dardos.ts` = la vista de tiro, perezosa con la primera diana):
  - **PC** (v4, `apps/plaza/dardos.ts`; lo puro en `features/dardos/barra.ts`): el ratón mueve la mira con un vaivén
    de pulso (reposo ±0,03, **se calma** a ±0,012 en 0,3 s al pulsar, tras 1 s mantenido **deriva** hasta ±0,06 a los
    2,2 s; un patrón de fase por dardo; nunca más de 0,25 radios/s). Mantener pulsado llena y vacía la **barra
    vertical** junto a la diana (`potenciaDe`, `CICLO_S = 1,1` s): pista oscura, relleno verde azulado/rojo (nunca
    dorado) y la **zona** (`ZONA_FUERZA[via]`) como banda dorada con borde blanco de 2 px y dos muescas, que se
    ilumina mientras la barra está dentro. Soltar lanza (la fuerza se lee con el `timeStamp` del evento, no con el
    reloj del manejador) y durante 900 ms se ve una marca blanca donde soltaste y la palabra **PERFECTO / CASI /
    FLOJO ↓ / FUERTE ↑** (`etiquetaSuelta`); en la diana, un anillo donde apuntaste y una línea hasta donde cayó
    (1,5 s). Teclado: flechas o **WASD** apuntan (Mayús = paso fino 0,01), Espacio mantener/soltar, Esc deja la tirada.
  - **Móvil**: pones el dedo (la mira va 56 px por encima, que el dedo no la tape) y **lo lanzas hacia arriba**:
    la fuerza es la velocidad del gesto (`fuerzaDeFlick`, `FLICK_LLENO = 2,6` alturas de la diana por segundo);
    la mira es donde empezó el gesto. Se mide con las muestras crudas del puntero (`getCoalescedEvents`) y su
    `timeStamp`, nunca con los cuadros: un móvil lento no cambia la fuerza. El HUD para el toque (no mueve el
    avatar ni la cámara).
  - **AR** («En tu pared (AR)», solo donde hay immersive-ar): `view.dardosAR` → `ar.jugar(juego)`: la sesión AR
    la lleva el minijuego (`JuegoAR` en `packages/render/src/ar.ts`, sin maqueta). Hit-test con `entityTypes:
    ["plane", "point"]` para encontrar **paredes** (la `y` de la pose del impacto es la normal: casi horizontal =
    pared → la diana cuelga ahí, de cara a ti; suelo/mesa → se pone de pie con el centro a 1,73 m; sin superficie
    → a 2,37 m delante, a la altura de los ojos). Un toque o el gatillo la cuelga; luego **mantener y soltar**
    (pantalla o gatillo): la barra de fuerza junto a la diana, y el dardo sale por el rayo del toque o del mando
    hacia donde corta la cara; la banda dorada de esa barra usa `ZONA_FUERZA.ar` y se ve a 5 cm de alto. Tamaño real (`RADIO_M = 0,17`). La sesión dura `AR_JUEGO_MS` en un móvil.
  - **3D en la plaza** (`crearDianas3D`, `view.dardos`): tablero en un poste (`ESCALA_PLAZA = 2,4` veces el
    tamaño real, para leerla desde la cámara), línea de tiro dorada en el suelo y los dardos clavados de quien
    tire cerca; los tuyos siguen unos segundos tras la tirada.
- **Pruebas**: `test/dardos.test.ts` (sin pantalla: cada sector y borde, la geometría de la cara, cómo se dobla
  un tiro, reparto del pulso, una tirada completa también vista por otro, rechazos, cierres por alejarse,
  desconectar e inactividad, determinismo entre dos mundos, el controlador de la página, la simulación no se
  entera, `dardos.json`). `tools/e2e-piernas/dardos.mjs` (navegador real): PC con ratón (1280×800), móvil con
  gestos táctiles reales (CDP con `timestamp`) y exactos (390×844, `pointer: coarse`), y AR emulado con IWER
  (Quest 3 y una **pared** a 2,4 m: cuelga la diana, tres dardos con el gatillo, sale).
- **Límites de hoy**: `announce.sound` es fijo por evento (un 50 no suena distinto: haría falta un selector por
  campo en el motor). En AR la vista HTML de tiro no se ve en un visor (el marcador vive en la página: el
  `dom-overlay` de la sesión es `#hud`); la barra 3D sí. Después: diana de pared en el editor del mundo, partidas
  a 301/501 y «alrededor del reloj», dardos lanzados con el gesto real del
  mando (velocidad de la mano en VR).
- **Gesto de profesional en VR (v14)**: el lanzamiento con mando o mano lee la velocidad y la dirección reales de la mano; además
  `features/dardos/gesto.ts` puntúa el gesto de 0 a 1 (recta, aún acelerando al soltar, velocidad de una suelta real, retroceso)
  y `lanzamiento(cara, p, v, ayuda)` aplica `ayuda = 0,6 × puntos` (acerca el punto al centro y la fuerza a `FUERZA_IDEAL`; la lectura
  cruda queda en `tiro.crudo`). El servidor no cambia. Fuentes y umbrales: `docs/DARDOS-GESTO-PROFESIONAL.md`.

### Duelo (v2): dos personas, una en el mundo y otra en su pared (AR)

Una diana con `duelo: true` admite un segundo jugador y juega una **partida**; con `remoto: true`, un jugador
puede entrar desde una pared real, lejos de la diana (casa, móvil o Quest), mientras el otro está en el mundo.
El servidor lo decide todo; cada uno ve los dardos del otro y el marcador. Una diana **sin** esos campos se
comporta exactamente como en v1. Es una pieza del motor: cualquier mundo la activa con una línea.

```json
{ "sitios": [{ "id": "torre", "nombre": "Diana de la Torre", "x": 10, "y": 0, "z": 4, "radio": 3,
               "duelo": true, "remoto": true, "rondas": 3 }] }
```

- **Campos de la diana** (`dardos.json`, todos opcionales): `duelo` (bool), `remoto` (bool), `rondas` (entero
  1-5, por defecto 3 = `RONDAS_DEFECTO`; cada ronda tira cada jugador sus 3 dardos). El estado compartido de la
  diana suma `duelo`, `remoto`, `rondas`, `espera` (hay alguien esperando rival) y `jugadores` (0-2), para que
  cualquier página muestre «esperando rival».
- **Verbo.** `jugar{sitio, desde?}`: `desde` es `"sitio"` (por defecto: hay que estar en el radio, como en v1) o
  `"pared"` (salta la comprobación de distancia, **solo** en una diana `remoto`; en otra se rechaza con «no admite
  jugar desde una pared»). Los clientes que no mandan `desde` no notan nada. v5 suma `"lejos"`: lo mismo que
  `"pared"` pero desde una pantalla plana (PC o móvil) lejos de la diana; también solo en `remoto`.
- **Unirse desde lejos (R4).** Una diana `remoto` la conoce **todo el mundo**, esté donde esté (su estado compartido
  no lleva `at`; las demás solo las conoce quien está a `ALCANCE_M`; `api.within` lee el lugar de la diana en su
  ficha). La página muestra entonces un chip «Dardos: jugar en <diana>» (`apps/plaza/dardos-unirse.ts`, con el
  estado: «Esperando rival · 1/2», «Libre», «Partida en marcha»), que abre la vista de dardos en su *sala de
  espera* con «Jugar desde aquí» (entra `desde: lejos`) y «En tu pared (AR)» (si el aparato lo permite; la pared
  entra en la diana elegida). En el panel 3D de la pared, si no estás en ninguna partida y hay una diana libre,
  aparece «Unirme a la partida». Funciona con ratón y con el dedo (el chip mide ≥ 48 px). Un mundo lo activa solo
  con `"remoto": true` en su `dardos.json`; el servidor sigue decidiendo quién entra.
- **Partida.** El primer `jugar` es el anfitrión y la diana queda en `espera`; el segundo `jugar` de otra
  persona empieza la partida (la diana pasa a `ocupado`); un tercero recibe «Ya hay un duelo en marcha». Los turnos
  alternan anfitrión, invitado, anfitrión… (un turno = 3 dardos, mismo código y puntuación que v1). `lanzar`
  fuera de turno → `rechazado` «No es tu turno»; mientras se espera rival → «Espera a tu rival». Tras `rondas`
  rondas gana el total más alto; igual = empate. Un `lanzar` en una diana de duelo sin estar en la partida se
  rechaza (hay que hacer `jugar`).
- **Abandono.** Si uno hace `salir`, se desconecta o pasa `TURNO_INACTIVO_S` (60 s) sin lanzar en su turno,
  la partida termina y gana el otro por defecto (`abandono`). Un anfitrión que espera solo 60 s se cancela como
  una tirada suelta (`fin` con 0 dardos). En un duelo no se comprueba que sigas dentro del radio después de entrar.
- **Eventos nuevos.** `duelo{sitio, ronda, turnoDe, a, nombreA, puntosA, b, nombreB, puntosB, paredA, paredB}` cada vez que
  cambia el turno o cae un dardo (`ronda` 0 = esperando rival; `a` = anfitrión, `b` = invitado; los campos son
  planos porque el esquema no tiene listas) y `finduelo{sitio, ganador, empate, abandono, a, nombreA, puntosA, b,
  nombreB, puntosB, paredA, paredB, texto}` (con `empate` el `ganador` va a 0: la entidad 0 también existe, mira `empate`).
  Van a los dos jugadores **sea cual sea la distancia** y a quien esté a `CERCA_M` de la diana; alguien lejos que
  no juega no recibe nada. `dardo` llega además a los dos jugadores (la pared está a cientos de metros) y `fin`
  (fin de turno) también a los dos en cada turno. Los nombres salen de `api.who`, sin caracteres de control y
  con tope de 40 bytes, y viajan solo en campos `text`.
- **Trampas.** Sigue sin `Math.random` (`azarDe` con tick, entidad, número de dardo y diana); el servidor es el
  único juez; límites de ritmo sin cambios. Un cliente que manda `desde: "pared"` a una diana normal solo gana un rechazo.
- **Pruebas**: `test/dardos-duelo.test.ts` (diana v1 intacta, espera/entrada/tercero, pared solo en `remoto`,
  fuera de turno, dardos a 500 m, partida de 3 rondas igual en dos mundos, empate, abandono por salir/desconexión/
  inactividad, huella de la simulación); `test/dardos-duelo-cliente.test.ts` (el controlador visto por los dos
  jugadores y un curioso: turnos, puntos, `gane`/`empate`/`abandono`, dardos del rival, avisos).
- **Controlador de la página y de los agentes** (`features/dardos/client.ts`, historia AR-D2). `dardos.duelo()`
  devuelve `null` (no hay partida cerca, o en una diana v1) o `{ sitio, ronda, esperando, turnoDe, yo, miTurno,
  rival, yoPuntos, a, b, fin }`:
  - `ronda` 1-5; `0` y `esperando: true` = anfitrión sin rival (`b` y `rival` a `null`). `turnoDe` es la entidad
    con el turno (`null` si se espera o ya acabó). **La entidad 0 es una persona real**: lee `esperando`/`ronda`
    y `fin.empate`, nunca `ganador === 0`.
  - `yo`: soy uno de los dos; `miTurno`: `true` solo para quien tiene el turno; `rival: { entity, nombre, puntos }`
    y `yoPuntos` solo si `yo` (un curioso cerca de la diana tiene `yo: false`, `rival: null`, `yoPuntos: 0` y lee
    `a`/`b`). Un jugador en una pared lejana (fuera del alcance del estado) mantiene la partida; un curioso que se
    aleja de la diana la pierde.
  - `fin: null | { ganador (entidad | null si empate), empate, abandono, texto, gane (soy el ganador), cuando }`;
    se queda `DUELO_FIN_MS` (30 s) tras `finduelo` y entonces `duelo()` vuelve a `null`.
  - `alCambiar(fn)` recibe además el tipo `"duelo"`. `rechazado` («No es tu turno», «Espera a tu rival», «Ya hay un
    duelo en marcha»…) va a `estado().aviso`, como en v1. `jugar(sitio, "pared")` es la entrada desde una pared;
    `ofrece("dardos", …)` es `false` mientras estás en una partida; `salir()` vale con turno propio o dentro de una partida.
  - `clavados(sitio)`: los dardos del rival llegan a cualquier distancia; en una partida **se quedan** al acabar su
    turno y salen cuando empieza el siguiente turno de ese jugador (el primer dardo, como en v1); tras `finduelo`
    siguen `DUELO_DARDOS_MS` (6 s) y se quitan. Una diana sin campos de duelo no cambia nada.
- **Vista en AR y en la página** (historia AR-D3). Quien juega desde su pared en AR ve el duelo, no solo su diana:
  - *Entrar.* Al colocar la diana en la pared (el toque o el gatillo), la página elige la primera diana con `remoto`
    y `duelo` (mejor una con alguien esperando) y hace `dardos.jugar(sitio, "pared")`. Si el mundo no tiene
    ninguna, el AR funciona como en v1, sin cambios. Pieza: `apps/plaza/dardos-duelo.ts` (`montarDuelo`,
    `elegirSitioAR`); `view.dardosAR` admite `envolver` para envolver la diana de pared.
  - *Marcador 3D* sobre la diana (`packages/render/src/dardos-duelo-ar.ts`; un plano y una textura de canvas, porque
    WebXR no pinta DOM): los dos nombres, los puntos, «Ronda r/N», el turno resaltado (▶), «Esperando rival…» y, al
    acabar, «Ganas» / «Pierdes» / «Empate» (+ «tu rival se fue» si abandonó) durante `DUELO_FIN_MS`. Se repinta
    solo cuando `duelo()` cambia (`alCambiar("duelo")`), no cada fotograma. Los textos salen de funciones puras
    (`packages/render/src/dardos-duelo.ts`: `panelDe`, `pintarPanel`).
  - *Dardos del rival.* No aparecen de golpe: entran volando 0,4 s en arco desde un lado y arriba hasta donde caen
    (`salidaRival`, `vueloRival`) y luego se clavan. Los tuyos siguen como en v1. Los dardos que ya estaban al entrar
    no vuelan.
  - *Turno.* Con una partida en AR solo se lanza en tu turno en marcha: fuera de turno, esperando rival o tras el
    final la barra de fuerza no se carga y **no se envía nada** (`puedeLanzar`); el marcador dice «Es el turno de
    <nombre>».
  - *Salir.* Al acabar la sesión AR (cualquier motivo) se llama a `dardos.salir()` y el rival gana por abandono.
    Para eso `salir()` del controlador ahora también vale **en una partida en el turno del rival** (antes solo con
    turno propio). Se puede volver a entrar en AR más tarde.
  - *HUD de la página* (PC y móvil): una línea `.duelo` bajo el resultado, «Ana 12 – Luis (tú) 9 · Ronda 2/3 · Es el
    turno de Ana». El HUD se queda abierto mientras dura tu partida (también entre turnos) y «Dejarlo» sale de ella.
  - *Pruebas*: `test/dardos-duelo-ar.test.ts` (texto del marcador, turnos, vuelo, gating, diana elegida, línea del
    HUD, `salir()` en turno ajeno). El e2e con dos jugadores es `tools/e2e-piernas/dardos-duelo.mjs` (historia D5, abajo).
- **El duelo visto desde el mundo** (historia AR-D4). Quien camina por la plaza junto a la diana 3D ve el duelo de
  *esa* diana, juegue o mire:
  - *Campo nuevo en el cable.* `duelo` y `finduelo` suman `paredA` y `paredB` (bool, planos, por defecto `false`):
    el servidor dice quién entró con `desde: "pared"`. Es aditivo: la feature sigue en versión 2 y un cliente que no
    los lee no nota nada. En el controlador, `a.pared` / `b.pared` (opcionales).
  - *Letrero* sobre la diana 3D (`packages/render/src/dardos-duelo-plaza-3d.ts`, `crearLetreroPlaza`; un plano y una
    textura de canvas): mismos textos puros que el marcador de la pared (`panelDe`, `pintarPanel`): nombres, puntos,
    «Ronda r/N», turno resaltado, y el resultado (el texto del servidor para un curioso, «Ganas/Pierdes» para quien
    jugó) durante `DUELO_FIN_MS`. Sin duelo, oculto. Se repinta solo si cambia su contenido (`claveLetrero`).
  - *Invitación.* Con un anfitrión esperando solo, el pie dice «Esperando rival — ¿juegas desde tu pared (AR)?»,
    para que quien pase sepa que el duelo existe y cómo entrar.
  - *Etiqueta* «En su pared (AR)» bajo el letrero cuando alguien de la partida (o el anfitrión que espera) entró
    desde una pared. Pura: `letreroDe`.
  - *Dardos del jugador remoto.* En la diana 3D de la plaza llegan con el mismo arco corto que en AR
    (`vueloRival`, 0,4 s) desde arriba a la izquierda y luego se clavan. Solo si la diana tiene un duelo vivo, el
    dardo es de alguien que juega desde su pared y acaba de caer (`debeVolar`, menos de `RECIENTE_MS`: los que ya
    estaban al llegar se clavan sin más). Los de quien tira junto a la diana y todo lo de una diana v1 se clavan
    como siempre.
  - *Cómo se engancha.* `crearDianas3D` devuelve tres asas nuevas (`grupo`, `malla`, `alFotograma`) y la vista
    llama a `dardos.actualizar(dt)` cada fotograma; `montarDuelo` (`apps/plaza/dardos-duelo.ts`) recibe
    `view.dardos` y monta el letrero. Una diana sin duelo no cambia.
  - *Arreglo del controlador.* Un curioso se quedaba con «Esperando rival…» para siempre si el anfitrión desistía
    (`fin` sin `finduelo`); ahora `duelo()` vuelve a `null` y el letrero se va.
  - *Pruebas*: `test/dardos-duelo-plaza.test.ts` (textos, etiqueta, invitación, qué dardos vuelan, el arco, el campo
    de cable y el controlador visto por un curioso y por quien juega junto a la diana). El letrero pintado a PNG y el
    arco medido en un navegador (`work/motor-ar/capturas/duelo-plaza-letrero-*.png`).
- **Prueba en navegadores de verdad** (historia AR-D5, `tools/e2e-piernas/dardos-duelo.mjs`). Un PC (1280×800, ratón) y
  una Quest 3 emulada con una pared (IWER) juegan el duelo entero en un mundo desechable con una diana
  `{duelo, remoto, rondas: 1}` y la aparición a 45 m de ella (el jugador de pared queda fuera de `CERCA_M` + radio:
  solo le llega lo del duelo). Comprueba: el letrero de espera sobre la diana 3D; B cuelga la diana y entra
  `desde: "pared"`; A lee su nombre y «En su pared (AR)», B lee en el panel AR de quién es el turno; tira B
  fuera de turno (no se envía nada) y A fuera de turno («No es tu turno»); cada dardo cae en las dos pantallas; los
  puntos y el veredicto (Ganas/Pierdes/Empate) coinciden con el servidor; B sale de AR limpio; y una segunda
  partida en la que B sale de AR a mitad: A gana por abandono («tu rival se fue»). Sin errores de página. **Lenta**
  (~2-3 min con la máquina cargada, arranca su servidor y página en 8799/5181): no va en la batería rápida
  (`tools/auto.sh e2e` la salta, `E2E_LENTAS=1` la incluye); se corre sola con `node tools/e2e-piernas/dardos-duelo.mjs`
  (`SHOTS=<carpeta>` guarda capturas de A; en AR no se pintan fotos: IWER no dibuja). Para leer lo que ven las
  tres vistas hay un gancho de solo lectura, `__numinia.dardosHud.duelo()` (`linea`, `letrero`, `panelAR`).
  Quien juega desde una pared lejana no tiene diana junto a la que pulsar «E»: la prueba abre la vista de
  dardos con `__numinia.dardosHud.abrir()`; un botón real para ello queda pendiente.
- **Aún no**: contadores `duelos`/`ganados` en el marcador por invitado (cambiaría el evento `marcador` que
  fija `test/dardos.test.ts`) y lanzar con el gesto real en VR.

### Dardos v3: duelo por equipos de 1 jugador (2 a 4), turno con botón

Ajuste del mundo por diana (`dardos.json`): `"equipos": 2..4`. **Sin `equipos`** la diana es el duelo de 2 de antes: arranca sola al llegar
el segundo. **Con `equipos`** el anfitrión (el primero que juega) arranca con el botón «Empezar» cuando hay al menos 2 sentados; hasta
entonces pueden entrar más hasta el tope. El cambio de turno es **siempre** con botón: tras el 3.º dardo la visita queda en «retira los
dardos» (`retirando`), nada puntúa (`lanzar` se rechaza) y quien tiene el turno pulsa «Cambiar turno» (HUD de la página o panel 3D en
AR); si nadie pulsa, a los `RETIRANDO_S` = 12 s cambia sola. Al cambiar, los dardos de esa visita salen de la diana.
Intents nuevos (`sitio`): `cambiar`, `empezar`. Eventos `duelo` / `finduelo`: se añaden campos planos `c`, `d`, `nombreC/D`, `puntosC/D`,
`paredC/D`, `fueraA..D`, `equipos` (cuántos admite), `plazas` (cuántos sentados), `turnoEq` (1..4; 0 = nadie), `retirando`; el cliente
viejo que solo lee a/b sigue funcionando. Esquema `version: 3`. Reglas puras en `features/dardos/equipos.ts` (sin dardos dentro, para
reutilizarlas en la pesca). Un equipo que se va se salta; si queda uno, gana por defecto. Pruebas: `node --test test/dardos-equipos.test.ts
test/dardos-duelo-equipos-vista.test.ts`; e2e: `node tools/e2e-piernas/dardos-duelo.mjs` (tramo 6: tres jugadores).

### Dardos enlazados (v6, E1): en cualquier mundo, la diana de la Torre en tu pared

El dueño pidió que, **en cualquier mundo de Numinia**, al entrar en AR salga la diana «cosida» a la de la Torre de los
Alquimistas: la misma partida que la gente que está en la Torre. Sin código en el mundo: es un ajuste de datos (R-1).
- **El ajuste** (`features/dardos/enlace.ts`, una sola constante): `ENLACE_DARDOS = { servidor:
  "wss://alchemiststower.numinia.com/ws", diana: "torre", nombre: "la Torre de los Alquimistas" }`. Un mundo lo cambia en su `dardos.json`
  (`"enlace": { "servidor": "wss://otro/ws", "diana": "mesa", "nombre": "el Mirador" }`, una parte que falte es la de la casa; un
  `servidor` distinto sin `nombre` no hereda el de la Torre) o lo apaga
  (`"enlace": false`). Un `enlace` mal escrito se dice en el log del servidor (`enlace.servidor: debe ser una dirección
  ws:// o wss://…`) y **se queda el de la casa**: una errata no apaga la función en silencio. El servidor lo cuenta a la
  página en `/status` → `dardosEnlace` (`null` = apagado; sin el campo = un servidor antiguo: la página usa el de la casa).
  La página lo resuelve en `__numinia.dardosEnlace.vigente()`: **un mundo nunca se enlaza a sí mismo** (mismo host) ni lo
  hace si tiene diana propia con `duelo` + `remoto` (a la que la pared ya se une como siempre).
- **La conexión** (`apps/plaza/dardos-enlace.ts`, trozo propio: no se baja nada hasta que alguien lo pide): una
  segunda `ClientSession` ligera al servidor enlazado con **solo** el cliente de dardos (su propio controlador
  `crearCliente()`, no el de la página), que nunca manda movimiento. Tiene su invitado por servidor
  (`localStorage numinia.invitado@<host>`) y sale en el marcador con **el nombre que la persona tiene en este mundo**
  y «desde <nombre del mundo>». `__numinia.dardosEnlace.enlace()` da el objeto: `conectar()` →
  `"puerta" | "listo" | "error"`, `jugarEnPared()` (arranca AR, cuelga la pared y entra en la diana enlazada),
  `salir()`, `cerrar()`, `aceptar(versiones, datos)`, `vista()` (estado, `condiciones`, `duelo`, panel AR),
  `ar()`, `alCambiar(fn)` y el controlador en `.dardos`. Estados: `cerrado → conectando → puerta | listo →
  jugando` (o `error` con `motivo`; `estadoEnlace()` es una función pura, probada en Node).
- **La puerta de las condiciones es de verdad.** Si el mundo enlazado la tiene encendida, la conexión enlazada queda en
  `puerta` y el servidor **ignora** sus mensajes de dardos hasta que la persona acepte las normas de ese mundo
  (`vista().condiciones` = `puerta`, `abierta`, `faltan`, `capas`; `aceptar()` manda el mismo ACEPTAR que la pompa).
  `jugarEnPared()` no cuelga nada mientras esté cerrada y dice por qué. La interfaz para leerlas y aceptarlas es la
  de E2 (más abajo, «El botón de AR»).
- **El botón de AR** (E2, `apps/plaza/ar-elegir.ts` + `ar-elegir-logica.ts`, trozo propio que se precarga a los 2,5 s):
  si el mundo tiene enlace (`__numinia.dardosEnlace.vigente().enlace`), «Entrar en AR» abre un selector en la página plana
  con dos botones grandes: **«Dardos de <el mundo enlazado> en tu pared»** (el primero, con el foco) y **«El mundo en tu mesa»** (la
  maqueta de siempre). El nombre del mundo enlazado sale, por este orden, de: lo que **su propio servidor dice en `/status`**
  (`nombre`, su ficha; la página lo pide al abrir el enlace, con CORS `*`), el `nombre` del ajuste (la casa:
  «la Torre de los Alquimistas»), y el host. Nunca se enseña el host si hay nombre. Un mundo con **sus dardos apagados**
  (`funciones.json`) sigue ofreciendo la diana de la Torre: el enlace es de la diana de *otro* mundo (y ahí manda el
  interruptor de ese mundo). Sin enlace (la Torre, `enlace: false`, diana propia) el botón es el de siempre. La regla de XR manda
  cómo está hecho: `requestSession` tiene que ir dentro del clic, sin `await` antes, así que **todo lo lento pasa antes de
  ese clic**, con el selector abierto: se carga y conecta el enlace (`enlace()` + `conectar()`), y si la puerta de la Torre
  está cerrada el botón de dardos lleva a **sus normas en la pantalla plana** (la misma pompa `montarCondiciones` con la
  opción `enlazada`: las palabras hablan de la Torre, «Salir» solo vuelve al selector y aceptar no hace estallido; los datos
  opcionales salen sin marcar). Con las normas aceptadas el botón dice «Normas aceptadas. Toca para colgar la diana» y su
  clic llama a `jugarEnPared()`, que arranca AR en esa misma llamada. En unas gafas no hay DOM dentro de AR: por eso todo
  esto va antes. Si algo falla, una frase en castellano (`motivoParaPersonas`: «La Torre está llena ahora mismo…», «No se
  puede llegar a la Torre…») con **Reintentar**, y la maqueta siempre queda como salida. Salir de AR (el botón, el menú de
  las gafas, el límite de tiempo) **cierra el enlace**; si se pierde la conexión dentro de AR, se sale de AR y se avisa.
  Escape o «Cancelar» cierran el selector y el enlace.
- **El servidor** (aditivo: un servidor o una página antiguos no notan nada). La dirección lleva `?enlace=dardos`
  (`packages/net/src/enlace.ts`); el servidor hace de esa conexión una **visita**: no tiene avatar para nadie (no sale
  en los snapshots de los demás, no los recibe, `INPUT` y `VOZ` suyos se tiran), solo habla y oye con las funciones de
  `FUNCIONES_DE_ENLACE` (= `dardos`: del resto ni recibe ni acepta mensajes), no cuenta como persona en
  `/status.conectados` ni en `/health`, y cuenta en `/status.visitas`. Identidad, puerta y límites de ritmo son los de
  cualquiera. Cuenta en el aforo: ocupa una entidad.
- **Dardos v6** (aditivo): `jugar` admite `mundo` y `nombre` (texto, 32 bytes; solo desde `pared`/`lejos`) y el estado de
  la partida añade `mundoA`…`mundoD`; el letrero de la diana pone «En su pared (AR) · desde <mundo>».
- **Pruebas**: `test/dardos-enlace.test.ts` (ajuste y su validación, estados, la visita sin avatar que juega en la
  `remoto`, la puerta, el cliente con un servidor en memoria, el letrero). e2e con dos servidores y dos navegadores:
  `tools/e2e-piernas/dardos-enlace.mjs` (8913 Torre / 8911 otro mundo / 5311, también lenta: `E2E_LENTAS=1`): ahora por el
  botón real, el selector y las normas con clics de verdad (la sesión de AR nace dentro del clic, con la activación viva),
  más una pasada de móvil (selector, normas, «Salir», maqueta, Escape, la Torre sin enlace, la Torre caída con «Reintentar»).
  Las palabras y decisiones del selector (`ar-elegir-logica.ts`) y las de la pompa con `enlazada` se prueban en
  `test/ar-elegir.test.ts`.
