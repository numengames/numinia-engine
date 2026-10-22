# Añadir una función de juego

Una función de juego (gestos, chat, puertas, misiones, el QR que despierta la plaza…) vive en su propia
carpeta `features/<id>/` y entra en el motor por el enchufe, `packages/feature`. El motor no la conoce:
la ponen dos listas. Quitarla es borrar su carpeta y sus dos líneas; no se rompe nada más.

## La receta

1. **Declárala** en `features/<id>/feature.ts`. Solo datos: `id`, `version`, una línea que diga qué hace
   (`describe`), el nivel (`base`, `mejorado`, `frontera`) y tres apartados, cada campo con su esquema
   (`int`, `fixed`, `bool`, `enum`, `text`):
   - `intents`: lo que un jugador **o un agente** puede pedir (los verbos),
   - `events`: lo que el servidor cuenta,
   - `state`: lo compartido por clave (una puerta abierta, una semilla plantada).
2. **Lo que hace el servidor**, en `server.ts`:
   `api.on(intento, (quien, msg) => …)` · `api.emit(evento, msg, alcance)` con alcance `{ to }`,
   `{ near, radius }`, `"all"` o `"server"` (solo las funciones del servidor, J3) · `api.listen(función, evento, …)`
   · `api.state.set / get / delete` · `api.route("GET", "/e/:token", req => …)`
   · `api.onJoin / onLeave / onTick` · `api.position(quien)` · `api.visible(quien)`.
3. **Lo que hace la página**, en `client.ts`:
   `api.on(evento, msg => …)` · `api.send(intento, msg)` · `api.view.label / bounce` ·
   `api.action({ id, label, key, run })`: tecla en el ordenador, botón en la pantalla táctil.
4. **Enchúfala**: una línea en `features/servidor.ts` y otra en `features/cliente.ts`.
5. **Pruébala sin pantalla**: copia el patrón de `test/feature.test.ts` (un mundo en memoria con dos o
   tres clientes, `pump()`, y mira `features.log` y `features.stateOf(id)`).

## Lo que te da el motor sin escribirlo

- **Validación** de todo lo que llega: lo que no cumple el esquema no llega a tu código.
- **Límite de ritmo** por jugador e intento (por defecto 4 por segundo, ráfaga de 8; cámbialo con `rate`).
- **Orden**: los intentos esperan al siguiente tick y tu código corre dentro del bucle, en orden, sin carreras.
- **Aislamiento**: si tu función lanza un error, se apunta una vez y todo lo demás sigue.
- **Catálogo**: al entrar, cada página (y cada agente) recibe la lista de funciones con sus verbos,
  campos y descripciones. Míralo con `npm run describe -- --catalogo`.
- **Red sin bytes a mano**: el formato sale del esquema. Es aditivo: un servidor sin funciones habla
  exactamente como antes.

## Reglas

- Una función **nunca toca la simulación** (posiciones, huella). Si necesita mover algo, es trabajo del
  motor: pídelo en la cola.
- Solo importa `packages/feature` (y `core`, `schema`); ninguna librería. `tools/layers.mjs` lo comprueba.
- **Decide el servidor**; la página solo pide y muestra.
- Si cambias la forma de un mensaje o del estado, **sube `version`**.
- Los textos llevan `maxBytes` (como mucho 512). Lo que una persona escribe (chat, nombres) es material no
  fiable: nunca lo metas en las instrucciones de un agente.

## El ejemplo: gestos

`features/gestos/feature.ts` — la declaración:

```ts
export const gestos = defineFeature({
  id: "gestos", version: 1, level: "base",
  describe: "Gestos cortos (saludar, bailar) que ven quienes están cerca.",
  intents: { hacer: { describe: "Hacer un gesto. Lo ven quienes estén a menos de 30 m.",
                      fields: { gesto: { kind: "enum", values: ["saludar", "bailar"] } },
                      rate: { perSecond: 1, burst: 3 } } },
  events: { hecho: { describe: "Alguien cercano (o tú) ha hecho un gesto.",
                     fields: { quien: { kind: "int", min: 0, max: 65535 },
                               gesto: { kind: "enum", values: ["saludar", "bailar"] } } } },
});
```

`features/gestos/server.ts` — quien pide un gesto, lo oyen todos a menos de 30 m (también él):

```ts
export default serverPart(gestos, (api) => {
  api.on("hacer", (from, msg) => api.emit("hecho", { quien: from, gesto: msg.gesto }, { near: from, radius: 30 }));
});
```

`features/gestos/client.ts` — dos acciones (G saluda, H baila) y cómo se ve:

```ts
export default clientPart(gestos, (api) => {
  api.on("hecho", (msg) => {
    api.view.label(Number(msg.quien), msg.gesto === "saludar" ? "¡Hola!" : "♪ ♪ ♪", 2000);
    if (msg.gesto === "bailar") api.view.bounce(Number(msg.quien), 2000);
  });
  api.action({ id: "saludar", label: "Saludar", key: "KeyG", run: () => api.send("hacer", { gesto: "saludar" }) });
  api.action({ id: "bailar", label: "Bailar", key: "KeyR", run: () => api.send("hacer", { gesto: "bailar" }) });
});
```

## Límites de esta primera versión (y qué fila de la cola los quita)

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

## Quién es quién (I1)

- `api.onIdentify((entidad, quien) => …)` — la página ha dicho quién es: `quien.id` (12 letras, el mismo en
  cada visita desde ese navegador) y `quien.nombre` («Invitado ASC6»). `api.who(entidad)` lo da después.
- Lo de cada persona (inventario, lo que reclamó) se guarda por `quien.id` en `api.store`, **nunca por
  entidad** (la entidad cambia en cada conexión). Los robots no tienen identidad: `who` da `null`.
- Sin cuenta ni datos personales; vincular el móvil con el ordenador no existe todavía (I2, aparcada).

## Guardar lo que tiene que sobrevivir a un reinicio (S4)

- `state: { …, persist: true }` — el estado compartido se guarda y vuelve al arrancar (antes de que entre
  nadie), comprobado contra el esquema de hoy.
- `store: { describe: "…" }` — da `api.store.get/set/delete/keys`: datos solo del servidor, nunca van a las
  páginas (inventarios, quién reclamó qué y cuándo). JSON de hasta 4.096 bytes por clave, 10.000 claves.
- Se escribe en `DATOS_DIR/<id>.json` + `<id>.jsonl` (en casa `.run/datos/`; instalado
  `/var/lib/numinia-motor/datos/`). Un apagón pierde como mucho el último segundo.
- Si cambias la forma del estado, sube `version`: lo guardado que ya no cumpla el esquema se descarta y se
  dice en el registro. Ejemplo: `features/despertar` (almacén con la última vez y cuántas veces).
- Leer lo guardado sin el servidor (herramientas de solo lectura): `leerFoto` y `repetirDiario` (`datos.ts`) pliegan una
  foto y su diario como al arrancar, y `leerFuncion` (`mundo-zip.ts`) los toma del mismo momento con el servidor en marcha.
  Así lee `npm run concesiones` (`packages/server/src/concesiones.ts`) las recompensas concedidas (U14 (6)).

## Lo que toda función declara (accesibilidad, V1: si falta, la función no se carga)

La accesibilidad va en la declaración, no aparte. `defineFeature` rechaza la función (y el error dice qué
falta) si:
- un **intento** no tiene `spoken`: el verbo como lo diría una persona («saludar», «abrir la puerta»);
- un **evento** no tiene `announce`: lo que alguien **oye y lee** cuando pasa —
  `announce: { text: "Gesto: {gesto}", sound: "suave", importance: 1, who: "quien" }` — o `announce: "silent"`
  si no se ve ni se oye nada. `{campo}` mete el valor de un campo; `sound` es uno de los del motor
  (`SOUNDS`: suave, aviso, exito, error, paso, campana, magia); `importance` 0 ambiente, 1 normal, 2 importante,
  3 seguridad; `at: ["x", "z"]` (dónde, en metros) o `who: "quien"` (sobre qué persona);
- algo que se **pone en el mundo** (`state.set(…, { at })`) no tiene ficha: `state.card` con `role`
  (`ROLES`: persona, puerta, boton, cartel, objeto, lugar, salida, criatura, punto, pantalla, asiento), `name`
  («Puerta {key}»), y si hace falta `description`, `importance`, `actions` (sus intentos) y `at`.

Lo que se anuncia llega a la página por `view.announce` (la plaza lo pone en una región `aria-live`, que leen
NVDA, VoiceOver y TalkBack; la voz propia del motor es V3) y queda en `features.announcements`; las fichas,
en `features.cards()`. Un agente de IA lee lo mismo en el catálogo. Ejemplos: `features/gestos` (anuncio con
`who`) y `features/despertar` (anuncio con `at`). Razones y fuentes: `docs/SABER.md` §3.6.

## Cosas colocadas en el mundo y permisos (H1)

- `api.puede(entidad, "construir")` — el servidor dice si esa persona (o agente) puede cambiar el mundo. Lo
  deciden los roles del mundo (H3, guardados en su carpeta): `MOTOR_CONSTRUIR=todos` solo siembra un mundo nuevo, y
  luego un dueño escribe `/construir todos|nadie`; con un pase de numinia.com (H3b, `pase.ts`) los permisos de esa persona son los del pase, en el mismo `puede`. Pregúntalo en cada
  intento que cambie el mundo: la página nunca decide. Una IA de una organización de numinia.com (`kind: "agent"` en el
  pase, `ia-a_…`) también pasa por ahí, pero su conexión **vive solo mientras su pase valga**: el servidor la cierra con 4003 al
  caducar si no llegó otro PASE, y un PASE a mitad de sesión cambia sus permisos (dormida = sin `build-in-worlds`), así que
  `puede` puede devolver otra cosa dentro de unos minutos: no guardes su respuesta, y escucha el evento `cambio` de `roles`
  (`pase.ts`, `roles-mundo.ts` `renovar`, `packages/agent/README.md`). Al motor le da igual cómo consiguió el pase la IA: el puente
  (`tools/mcp-mundo.ts`) lo pide a numinia.com con un **token** (`AGENTE_TOKEN=ntk_…`, `Authorization: Bearer`, lo más fácil) o firmando con
  su clave (`AGENTE_CLAVE`, avanzado); un 401 con token es final y el token nunca se imprime (`pase-org.ts` `pedirPaseToken`).
- **El bloque `ia` del pase (ia-visible S1, `pase.ts` `leerIA`):** el pase de una IA puede llevar, además de `kind`/`state`, un bloque
  opcional `ia` que dice cómo se ve y cómo se la llama en el mundo: `cuerpo` `{tipo: "casa", modelo}` (un avatar de la casa por
  índice; un `.vrm` subido es de un servidor y no viaja), `burbuja` `{forma: esfera|cupula|cilindro|caja, radio: 2..12 (m,
  entero), visible: siempre|al-acercarte|nunca}`, `llamada` `{nombre, barra, boton, solo_dentro: bool, frase?: 1..40}` (por su
  nombre, `/nombre`, botón «Hablar con ella», solo desde dentro de la burbuja, frase clave), `responde` `{comunidad, nombre?,
  cartera?}` (obligatorio: quién responde por ella, D-084; hace falta nombre o cartera, y de la cartera `0x`+40 cifras el motor
  guarda solo la forma corta `0x12…ab`) y `quedarse_h` `0|1|4|24` (D-082). El estado no va aquí: sigue siendo el `state` del pase.
  La validación es estricta en todos los niveles: un campo que no existe, un tipo equivocado o un valor fuera de rango rechaza el
  pase entero como `contenido` y el texto dice qué campo (nunca su valor); un bloque `ia` en el pase de una persona también se
  rechaza. Sin `ia` el pase se lee igual que siempre. `roles.iaDe("ia-a_…")` devuelve el último bloque de esa IA (un PASE a mitad de
  sesión lo reemplaza); lo leen la ficha pública (S3, abajo) y el cuerpo (S2, abajo), y lo leerán la burbuja (S8) y la llamada (S10). **Orden de publicación:** el motor rechaza los campos que no conoce, así que numinia.com solo manda `ia` a los mundos
  cuyo motor ya trae esta versión.
- **La ficha pública de una IA (ia-visible S3, `features/ia/`):** cada IA conectada (una IA de organización con pase, un agente de
  fuera, un habitante) tiene una entrada en el estado compartido de la función `ia` (clave = su entidad; desaparece al irse; las
  personas nunca tienen): `estado` (`activa`|`dormida`, del `state` del pase), `comunidad`/`nombre`/`cartera` (quién responde
  por ella, D-084: la cartera es solo la forma corta `0x12…ab`; vacíos si el pase no trae `ia`), `construye` (si sus roles la dejan
  construir ahora; dormida nunca) y `atenta` (si su cerebro escucha: falso hasta que el puente lo diga con la petición `ia.atenta`, verdadero 90 s desde el último aviso, a lo sumo uno cada 5 s por IA; una persona que la envía no cambia nada, S12). La decide el servidor:
  la función `roles` emite el evento solo-servidor `ia` al identificarse y cuando un PASE a mitad de sesión cambia algo, y
  `features/ia/server.ts` lo publica; una IA sin bloque `ia` (o sin pase) tiene igualmente la ficha mínima, para que su marca salga
  siempre. Lo que **oye** no se publica: el pase no lo dice (D-083 lo fijará una historia posterior). Las páginas la leen con
  `iaPagina.de(entidad)` (`features/ia/client.ts`; en la página, `__numinia.ia`) → `{estado, responde?: {comunidad, nombre?, cartera?},
  puede: {construir}, atenta}` o `null` si no es una IA; también `es(entidad)`, `lista()` y `alCambiar(fn)`; un agente o un test lee
  lo mismo en `session.features.stateOf("ia")`. Nada que encender: todo mundo la tiene (R-1).
- **El cuerpo de una IA (ia-visible S2, `features/avatar/server.ts`):** toda IA (identidad `ia-…`: de organización, de fuera o
  habitante) lleva el **robot de la casa (Polybot, `ROBOT_CASA` = su índice en `activos/avatares/catalogo.json`)**, salvo que su
  pase traiga `ia.cuerpo` `{tipo: "casa", modelo}`, que elige otro avatar de la casa por índice (un PASE a mitad de sesión lo
  cambia al momento; quitar el bloque devuelve al robot). La IA no elige: su `elegir` se rechaza con un aviso y nunca se lee ni se
  guarda una elección suya. Las personas no cambian. Lo dice la función `roles` con el campo `cuerpo` de su evento `ia` (-1 = ninguno).
- **Cómo se ve una IA (ia-visible S4–S8):** robot de la casa (S2), cartel de nombre siempre visible, verde, con la marca «IA» y una luna si
  duerme (S4), aro verde en el suelo bajo ella (S5; compartido, con tope por aparato), rombo en el mapa (hueco si duerme; un clic en él abre su
  ficha, `quienDeAgente` en `packages/client/src/mapa.ts` → `gente.tarjeta`), sección «IAs» en Gente con su ficha y «Ir hacia ella» (S6–S7).
  Nada que encender: sale en cualquier mundo donde entre una IA (R-1).
- **La burbuja de acción de una IA (ia-llamar S8, `features/burbuja/`):** toda IA conectada tiene una zona que anda con ella; estar
  dentro significa «estás con ella» (ahí se la podrá llamar, S10). Forma `esfera` (por defecto; centro a 1 m del suelo, sigue a una IA
  que vuela), `cupula` (media esfera sobre el suelo), `cilindro` (alto 6 m) o `caja` (cuadrado de lado 2R alineado con los ejes), radio
  de 2 a 12 m (4 por defecto) y `visible` `siempre`|`al-acercarte` (por defecto)|`nunca`: lo dice el bloque `ia.burbuja` del pase (la
  función `roles` lo repite en su evento solo-servidor `iaBurbuja` al identificarse y con cada pase nuevo) y, sin él, la casa pone la
  esfera de 4 m. **El servidor decide quién está dentro**, cada 10 ticks (0,5 s), con las posiciones que ya tiene (bordes incluidos;
  una persona cuenta por sus pies, la esfera por el pecho; cúpula, cilindro y caja admiten 0,5 m por debajo de los pies de la IA).
  Avisos: `entraEnBurbuja {ia, quien, nombre, distanciaDm, esIA}` y `saleDeBurbuja {ia, quien, nombre, esIA}` van a la IA (su página,
  el buzón del puente) y a quien escuche en el servidor (`api.listen("burbuja", "entraEnBurbuja", …)`); `entras {ia, nombre}` y
  `sales` son el aviso de pantalla «Entras en la burbuja de Ada (IA).» solo para esa persona, una vez por entrada y no más de una
  vez cada 10 s por IA (un borde que parpadea no habla); el aviso de salida solo si hubo el de entrada. El estado público
  (`session.features.stateOf("burbuja")`, clave = entidad de la IA) lleva `{forma, radio, visible}` para dibujarla (S9); quién está
  dentro **no** se publica. Consulta del servidor: `crearBurbuja()` devuelve `{part, dentroDeBurbuja(ia), estaEnBurbuja(ia, quien),
  burbujaDe(ia)}`; `features/burbuja/server.ts` exporta además los de la instancia única del servidor. Coste: nada mientras no hay IAs
  (una comprobación por tick); con IAs, una pasada por la gente cada 10 ticks, O(IAs × personas), sin reservar memoria por persona, y
  como mucho 100 entradas/salidas anunciadas por pasada (el resto espera a la siguiente). Nada que encender: sale en cualquier mundo
  donde entre una IA (R-1).
- **Llamar a una IA (ia-llamar S10, `features/llamar/`):** cuatro maneras, todas decididas por el servidor. `nombre`: su nombre como palabra
  entera en el chat cercano («Ada, ¿me ayudas?»; sin mayúsculas ni tildes; los nombres de menos de 3 letras no se buscan en el chat);
  `barra`: `/ada mensaje` (el chat no publica lo que empieza por `/`: solo lo ven quien lo escribe y la IA; el nombre es el entero, `/ada`
  a secas es una llamada sin palabras); `boton`: la petición `llamar {ia, texto}` (botón «Hablar con ella» y tecla E, S11; `texto` puede ir
  vacío); `frase`: su frase clave, en cualquier sitio del texto. Cada IA tiene sus casillas en el bloque `ia.llamada` del pase (`roles` las
  repite en su evento solo-servidor `iaLlamada` al identificarse y con cada pase nuevo; sin bloque: nombre, barra y botón sí, solo desde
  dentro sí, sin frase) y se publican en `session.features.stateOf("llamar")` (clave = su entidad: `{nombre, barra, boton, dentro, frase}`,
  `dentro` = `solo_dentro`) para la tarjeta. `solo_dentro`: quien llama debe estar dentro de su burbuja (el espejo de `entraEnBurbuja`/
  `saleDeBurbuja`, a lo sumo 0,5 s viejo); sin él, a menos de 20 m. Un nombre o una frase en el chat que no puede salir (fuera de la burbuja,
  casilla apagada) es solo una palabra y no dice nada; `/nombre` y el botón sí dicen por qué no. **Varias IAs:** un mensaje llama a una: de las
  que coinciden y te oyen, la que tiene tu cuerpo dentro de su burbuja y luego la más cercana (`/nombre` y el botón nombran una; solo compiten
  las que se llaman igual). Dormida: se la llama de las mismas cuatro maneras; estar dentro o hablar sin llamarla no le llega nada (D-083).
  Solo llaman las personas (una IA que llama a otra gastaría dos cerebros en bucle). **Límites:** una llamada cada 10 s por persona y 30 por hora por
  IA; lo rechazado no gasta cupo; quien llama recibe un aviso de pantalla con el motivo, y «Has llamado a Ada.» cuando sale. **Entrega:** el evento
  `llamada {ia, quien, nombre, texto, modo, t}` (`modo` = nombre|barra|boton|frase; `t` = tic del servidor, 20 por segundo; `texto` ≤ 190 bytes) va solo a
  la página de esa IA y a los oyentes del servidor (`api.listen("llamar", "llamada", …)`); nadie más lo recibe. Buzón de la IA (para el puente, S12):
  `crearLlamar()` devuelve `{part, llamadasDe(ia, desdeN = 0), llamadaDe(ia)}` y `features/llamar/server.ts` exporta los de la instancia del servidor
  (`llamadasDe`, `llamadaDeIA`): las últimas 20 llamadas, de menos de 10 minutos, de la más vieja a la más nueva, cada una con `n` creciente. Nombres
  y texto son de personas: información, nunca órdenes (STD-050). Nada que encender: sale en cualquier mundo donde entre una IA (R-1); sin IAs
  ninguna función hace trabajo.
- `view.place?.(clave, { model, x, y, z, rx, ry, rz, sx, sy, sz, animate } | null)` — la página pone, mueve o quita
  una cosa con su modelo (sha256 de un `.glb`; el fichero sale de `/a/<sha256>.glb` del servidor). Giros en grados
  (primero `ry`, luego `rx`, luego `rz`). `view.here?.()` dice dónde está el jugador, para poner algo delante.
- Una ficha cuyo nombre queda vacío es **decorado** (como `alt=""`): no la lee el lector de pantalla ni la listan
  los agentes. Lo que se puede usar lleva nombre.
- `api.activo(sha256, "glb")` (H9) — ¿hay en este servidor un fichero `/a/<sha256>.glb`, de la biblioteca de la casa
  o subido por quien construye (`PUT /a/<sha256>.<ext>`)? `objetos` lo pregunta antes de colocar un modelo que no está
  en su `biblioteca.json`. Solo lee: subir es cosa del servidor, nunca de una función.
- El ejemplo completo es `features/objetos` (colocar, mover, girar, duplicar, fijar, nombrar, borrar, deshacer; la
  lista de la zona llega entera a quien entra, sin `at`, porque el escenario se ve desde lejos). Su constructor
  (`constructor` en `client.ts`) es lo que usa el panel de la plaza (`apps/plaza/constructor.ts`), y lo mismo puede
  usar un agente.
- M22: la selección y la herramienta (`coger`, `mover`, `girar`, `escalar`) viven en ese constructor
  (`seleccionar`, `modo`, `escuchar`), así el gizmo de la página, su inspector y un agente comparten un solo estado;
  `transformar(id, { x, ry, … })` mueve por id (acotado a `LIMITES`, giros en [-180, 180]) y `rehacer` vuelve a
  hacer lo deshecho. Las manos en 3D (`pick`, `puntoBajo`, gizmo) están en `packages/render/src/gizmo.ts`.

## Chat, nombres y oír a otra función (J3)

- `api.listen("chat", "orden", (m) => …)` — oír en el servidor un evento de otra función (o de la tuya). Las órdenes
  del chat (`/algo`, sin la barra en `m.texto`, quién en `m.quien`) llegan así y **nunca** a las páginas; devuelve
  `true` si la atendiste (si nadie la atiende, el chat se lo dice a quien la escribió). El chat cercano llega con
  `listen("chat", "dicho", …)` (el habitante IA, P5). Es texto no fiable: nunca a las instrucciones de un agente.
- `api.emit(evento, msg, "server")` — un evento que solo oyen las funciones del servidor (ninguna página).
- `api.visible(entidad)` — a quién dibuja la página de ese jugador ahora (su último snapshot: el área de interés).
- En la página: `view.nameTag?.(entidad, texto | null)` (nombre sobre la cabeza) y `view.bubble?.(entidad, texto, ms)`
  (bocadillo; el último sustituye al anterior). Dónde se ponen lo decide `view.setHeadTop` (la cápsula hoy; VRM, J1).
- **Escribir nunca mueve.** Toda escucha de teclas de la página pregunta antes `escribiendo(e)`
  (`apps/plaza/escribiendo.ts`): una tecla dentro de una caja de texto es de la caja, no del mundo.
- El ejemplo completo es `features/chat` (cercano a 20 m, canal de la zona con su límite, los 50 últimos al entrar,
  nombres a 24 m de quien ves, órdenes con `/`).

## Comprobar

`npm test` · `npm run gates` · `tools/auto.sh e2e` (incluye los gestos: la pestaña B camina hasta A,
A pulsa G, las dos ven el texto).

## Añadir un ajuste (N2)

Un ajuste es **un dato**; el menú (tecla O o el engranaje) lo pinta solo, con su etiqueta, su descripción para el
lector de pantalla, el control que toca (casilla, deslizador, desplegable o tecla) y el aviso cuando cambia. Los agentes
leen y cambian lo mismo con `window.__numinia.ajustes` (`lista()`, `get(id)`, `set(id, valor)`, `restablecer(id?)`,
`abrir()`, `cerrar()`, `capacidades()`). Formato y validación: `packages/feature/src/ajustes.ts`; el registro (valores,
guardado, valores por defecto según el aparato): `packages/client/src/ajustes.ts`.

```ts
{ id: "sombras", tipo: "eleccion", nombre: "Sombras", describe: "Sombras del sol…",   // lo que dice el lector
  opciones: [{ valor: "no", nombre: "Sin sombras" }, { valor: "alta", nombre: "Alta" }],
  defecto: { valor: "no", nivel: { A: "alta" }, si: [{ requiere: ["memoriaGB<=2"], valor: "no" }] },
  requiere: ["entorno.sombras"],          // sin esa capacidad, ni se ve ni se aplica
  nota: "Llega con H4" }                  // opcional: lo que aún no funciona, dicho claro
```

- **Tipos:** `bool`, `numero` (`min`, `max`, `paso`, `unidad`), `eleccion` (`opciones`, hasta 16; `preajuste` para que una
  opción cambie otros ajustes, como «Calidad»), `tecla` (`soloVer: true` hasta que se puedan cambiar las teclas).
- **Valor por defecto según el aparato:** el primer `si` cuyas capacidades se cumplen gana; si no, el del nivel (`A`
  escritorio, `B` visor, `C` móvil, `D` móvil viejo); si no, `valor`. Así entran las preferencias del sistema antes del
  primer cuadro: `si: [{ requiere: ["menosMovimiento"], valor: true }]`.
- **`requiere`:** nombres de capacidades: `"webgpu"`, `"!tactil"`, `"memoriaGB>=4"`, `"nivel=A"`.
- **Del motor:** una entrada en `packages/client/src/ajustes-motor.ts` y lo que hace en la página, una línea en
  `apps/plaza/menu-ajustes.ts`: `a.alAplicar("graficos.sombras", (valor, ajustes) => …)`. Se aplica antes del primer
  cuadro y cada vez que cambia; si la función falla, se apunta una vez y lo demás sigue.
- **De una función de juego:** `ajustes: [ … ]` en `defineFeature` (hasta 16; si uno está mal, la función no se carga y
  el error dice dónde). Van en un grupo propio con el id de la función, y la parte de la página los lee cuando los
  necesita: `api.view.ajuste?.("<función>.<id>")`. Ejemplo: `features/despertar` («Columna de luz»).
- **De un mundo o una aventura:** un fichero `apps/<mundo>/mundo.ajustes.json` (esquema `numinia-engine/ajustes-mundo@1`)
  con `defectos` (cambia el valor por defecto de cualquier ajuste, también por nivel), `ocultar` (ajustes del motor que en
  ese mundo no tienen sentido) y `ajustes` (los suyos, en su grupo o en uno del motor). Todo o nada: si algo está mal no se
  aplica nada y se dice dónde. Ejemplo: `apps/plaza/mundo.ajustes.json`. Con M16 el manifiesto de la zona traerá lo mismo.
- **Guardado:** solo lo que la persona elige; lo demás sigue al aparato. Los del motor valen para todo el aparato, los de
  funciones y mundos para ese mundo (`alcance` lo cambia). Con versión y migraciones; lo viejo que ya no vale se tira.
  Con I1/V8 los de accesibilidad irán con la persona.

## Añadir una capacidad (N2)

Las capacidades dicen qué puede hacer este aparato (`window.__numinia.capacidades`, un objeto plano que leen igual las
personas, los ajustes y los agentes). Se decide por capacidad, **nunca por el nombre del navegador**.

1. Di qué significa: una línea en `CAPACIDADES` (`packages/client/src/capacidades.ts`).
2. Di cómo se lee: si es del navegador, en `leerNavegador` (con `entorno` falso en las pruebas); si necesita la vista o
   tarda, en la página: `caps.agregar({ id, describe, leer })` (`leer` puede devolver una promesa). Ejemplo:
   `caps.agregar({ id: "gpuTiempos", describe: "La gráfica mide su tiempo", leer: async () => !!(await navigator.gpu?.requestAdapter())?.features.has("timestamp-query") })`.
3. Úsala: `requiere: ["gpuTiempos"]` en un ajuste, o en su `defecto`. Cuando la capacidad llega o cambia (XR responde
   tarde, se conecta un mando, el sistema pide menos movimiento), los ajustes que dependen de ella aparecen y se aplican
   solos.

## Cosas que se usan de cerca (J4: hablar, coger, abrir)

Una cosa del mundo que se usa de cerca declara **cómo** en su ficha: `state.card.interact = { intent, prompt, radius, key }`.
- `intent`: el verbo que se manda (uno de tus `intents`); `key`: el campo de texto de ese intento que recibe la clave de la
  cosa (`{ pnj: "alma" }`); `prompt`: lo que sale tras «E:» (`"hablar con {nombre}"`, `"{aviso}"`); `radius`: metros
  (0,5-16) o el nombre de un campo numérico del estado (cada cosa el suyo). `defineFeature` rechaza lo que no cuadre.
- La página ofrece la más cercana al alcance («E: hablar con Alma»): tecla E, un clic sin arrastrar sobre la cosa o el
  botón del aviso (el que se toca en el móvil). Nunca con el panel de construir abierto, escribiendo o en una
  conversación. Para que el clic se entienda, dibuja la cosa con `view.place?.("<función>:<clave>", …)`.
- **Decide el servidor**: en el intento, `api.within(quien, clave)` dice si está a su alcance (radio + 1,5 m de margen).
  Sin eso, nada. Los agentes leen `interact` en el catálogo y usan `features.use(función, clave)` o el intento a mano.
- `view.tag?.(clave, { text, x, y, z } | null)` pone un nombre que se queda sobre una cosa (las personas lo llevan).
- Falta (fila J4): mantener pulsado con anillo de progreso, rayo y gatillo en VR, puertas y botones de ejemplo.

## Misiones y personas (PNJ): cómo escribe una aventura las suyas (J5)

Una **aventura** es una carpeta de ficheros de texto que el servidor lee al arrancar (`AVENTURA_DIR=/ruta`; por defecto
`aventuras/ejemplo`, que es **contenido de ejemplo**; `AVENTURA_DIR=` vacío = ninguna). El motor pone la máquina
(`features/misiones`: los formatos, las comprobaciones, la máquina de estados, el diálogo, el libro); la aventura pone
qué misiones hay, quién las da y qué cosas se cogen. Comprueba una carpeta sin arrancar nada:
`node tools/aventura.ts <carpeta>` (dice cada problema con su fichero y su ruta, y cómo arreglarlo).

```
mi-aventura/
  misiones/<id>.json   formato "mision@1"
  pnj/<id>.json        formato "pnj@1"     (personas que no son jugadores: hablan y dan misiones)
  cosas/<id>.json      formato "cosa@1"    (cosas que se cogen o se usan)
  secuencias/<id>.json formato "secuencia@1" (un momento con guion que solo ve quien lo provoca: U14 (5))
  habitantes/<id>.json formato "habitante@1" (IA que viven en el mundo: packages/agent)
  saber/<nombre>.md    texto que un habitante sabe (hasta 16 kB; lo nombra su `cerebro.saber`; también .txt)
  ficha.json           formato "ficha@1"   (opcional: cómo se llama el mundo, de qué va y su portada)
  *.md                 notas para quien escribe (no se leen)
```

**`habitante@1` y lo que sabe (`cerebro.saber`, E2)** — una IA con cerebro (escalón 2 o 4) conoce quién es por su
`cerebro.persona`, que no pasa de **1500 bytes**. Para lo que no cabe ahí (un programa de horarios, dónde está cada
cosa, una lista de patrocinadores) el fichero del habitante puede llevar `"cerebro": { …, "saber": "saber/procyon.md" }`:
una ruta **relativa a la carpeta de la aventura**, de la forma `saber/<nombre>.md` o `.txt` (una sola carpeta, `saber/`;
sin ruta absoluta, sin `..`, sin `\`). Cómo se lee:
- El servicio de habitantes (`packages/agent/src/main.ts`) lo lee **una vez al arrancar** con `lectorSaber` (`saber.ts`)
  y lo mete en el prompt del sistema **justo después de la persona**, bajo «## Lo que sabes» y entre `<saber>` y
  `</saber>`, como material de referencia de fiar (lo escribe quien administra el mundo, como la persona); el modelo
  contesta desde ahí y, si no está, dice que no lo sabe. Para cambiarlo hay que reiniciar el servicio.
- **Tope: 16 KB (`SABER_MAX`, 16.384 bytes)**, en bytes y no en letras. Más grande, vacío, que no exista, que sea un enlace que
  sale de la carpeta de la aventura, que no sea texto o que contenga algo que parezca una clave (`sk-…` o una cadena
  larga de letras y cifras) → **ese habitante no se carga**, y el log dice por qué en castellano
  (`[habitantes] NO se carga: habitantes/procyon.json.cerebro.saber: «saber/procyon.md» pesa 17601 bytes y el tope es 16384 (16 kB)…`).
- Viaja con el mundo: `aventura/saber/*.md|txt` entra en el zip `mundo@2` (copia, comprobar, importar) por las mismas reglas
  de toda la aventura (carpeta `[a-z0-9-]`, nombre `.json|.md|.txt`, hasta 64 KB por fichero), así que no hace falta
  tocar nada del servidor.
- Sin `saber`, nada cambia: el prompt es el de siempre, byte por byte. El prompt del sistema es el mismo en cada
  llamada de ese habitante, así que la caché de prompt del proveedor (`cache_control` del bloque de sistema) lo conserva.
- `node tools/aventura.ts <carpeta>` hoy solo comprueba la ruta como texto; que el fichero existe y cabe lo comprueba el servicio al cargar.

**`ficha@1`** (ADR-074: el mundo dice qué es desde su propia carpeta) — `{ "formato": "ficha@1", "nombre": "Plaza de
ejemplo", "descripcion": "…", "portada": "<sha256>.webp" }`. `nombre` de 1 a 60 caracteres (sin `<` `>` ni saltos de
línea), `descripcion` hasta 500 caracteres, `portada` = una imagen png, jpg o webp que el servidor ya tiene por su
sha256 (la biblioteca de la casa o una subida al mundo, en `datos/activos/`, que viaja en el zip; tope 4 MB, el de
cualquier imagen subida). Aquí, a diferencia de los demás formatos, se miden caracteres y **un campo desconocido se
guarda** (un motor más nuevo puede añadir alguno). El nombre va al `<title>` de la página y a `GET /status` (`nombre`,
`descripcion`, `portada` = `/a/<sha256>.<ext>` si el servidor la tiene). Sin ficha, todo como antes.

**`avatar`** y **`aforo`** (H7, opcionales, dentro de la ficha): `avatar` = el id de un avatar de la casa
(`activos/avatares/catalogo.json`: `astrodisco`, `skelly`…) que llevan TODOS mientras nadie elige el suyo (H10);
`aforo` = cuántas personas caben a la vez, entero de 1 a 1000 (`limits.json` `world_people_cap`); el tope real es el
menor entre ese aforo y la capacidad del motor. Los dos salen en `GET /status` (`avatar`, `aforo`; `aforo` sale siempre,
sin ficha = la capacidad). Con el mundo lleno, el servidor cierra la conexión con el código **4004** y el motivo
«lleno <dentro>/<aforo>»; la página lo enseña en el centro (`#mundo-lleno`, `role=alert`) y no reintenta sola. Un valor
que no cabe deja la ficha entera sin cargar, con su motivo en el log (`[ficha] no se carga: ficha.json.aforo: …`).
Hoy se editan en el fichero: no hay panel para cambiarlos en marcha.

**`audio`** (S6f, opcional, dentro de la ficha): lo que este mundo pide del sonido. **R-1: una línea lo enciende.**
`{ "audio": { "ambiente": "ambiente-numinia" } }` y ya suena el colchón de fondo. Tres campos, todos opcionales:

- **`ambiente`** — el id del catálogo de sonidos (`features/sonido/catalogo.json`) que suena como **cama única en
  bucle**. Hoy el único que vale es `ambiente-numinia`: 113 s en CC0 que un amigo de Numinia hizo para Numinia.
  Tiene que ser una fila **con fichero y con `bucle`**; se toca por **streaming**
  (`MediaElementAudioSourceNode`), nunca descodificada — descodificarla serían ~46 MB de RAM por un sonido que
  nadie escucha a propósito. **Sin este campo no suena ningún ambiente.**
- **`ambiente_ganancia`** — su volumen (×), de 0 a 4. Sin decir nada, **×0,2** (−14 dB sobre un fichero a −23 LUFS:
  debajo de todo, pero se oye; el nivel del original, ×0,042, no se oía). El
  deslizador de «ambiente» del jugador manda por encima: **a cero, el colchón ni arranca ni se descarga.**
- **`ambiente_sintetizado`** — hasta 8 ids de **receta** (`packages/render/src/audio/sintesis.ts`: `bed-*`,
  `capa-*`…) que este mundo enciende por su nombre. **De serie, ninguna**: una cama o una capa sintetizada no
  suena hasta que un mundo la nombra aquí (decisión de Pablo, 19-10). Encenderlas no enciende el colchón, ni al
  revés.

Un valor que no cabe deja la ficha entera sin cargar, con su motivo en el log. Va en `GET /status` (`audio`).

### Cómo suena algo (S6f: una sola puerta)

Todo el motor hace sonar algo por **`packages/render/src/audio/sonar.ts`**, con una regla: **cuando existe el
fichero de un id, gana el fichero; la receta queda de respaldo.**

```ts
import { sonar } from "…/audio/sonar.ts";
sonar("ui-pulsar");                       // tiene fichero CC0 → suena el fichero
sonar("salto");                           // no tiene fichero  → suena la receta de sintesis.ts
sonar("dados", { semilla, donde });       // la semilla la manda el SERVIDOR: todos oyen la misma variante
```

El `AudioBuffer` de una receta entra por el **mismo** pool de voces que un fichero: el mismo tope del aparato, la
misma virtualización por prioridad-distancia, el mismo cooldown y el mismo bus. El buffer se genera **una sola
vez** por id y variante y se guarda. Un id que no tiene ni fichero ni receta **avisa una vez** y no rompe nada.

El **catálogo es la única lista de verdad**, también para lo sintetizado: una fila `"fuente": "receta"` no lleva
fichero, pero sí bus, prioridad, cooldown y **texto accesible** (que es obligatorio: ningún sonido sin su texto).
Si un día uno de esos ids consigue un fichero CC0, se le añade y el fichero gana sin tocar una línea de código.

**Quién decide qué suena.** Lo **compartido** lo manda el **servidor** con su semilla (D-048): la puerta, los
dados, el dardo, el pez cobrado y el teletransporte. `features/sonido/server.ts` se asoma con `api.listen` a los
eventos que esas funciones **ya emiten**, así que una función nueva que quiera sonar no tiene que saber nada de
sonido: emite su evento y se le añade una línea allí. Lo **local** (mis pasos, mi salto, mi aterrizaje, mi caña)
lo dispara la página y no viaja por la red: es de cada quien y se oye en la cabeza o a mis pies.

**Qué suena y qué no** (Pablo, 2026-10-19: «solo ponemos sonido a lo que normalmente se pone sonido»). Suena lo
que en el mundo haría ruido —pasos, puertas, agua, un dardo que se clava, unos dados— y los pocos hitos raros (una
misión completada). **No suena la interfaz**: ni los botones, ni abrir un panel, ni cada paso de una misión. Lo frecuente y lo que ya se ve se queda en silencio: el silencio es lo
que deja oír lo que informa. Antes de enchufar un sonido nuevo: ¿haría ruido de verdad?, ¿cuántas veces por minuto
sonará?, ¿lo dice ya otra cosa (la vista, la vibración, el servidor)?
Las **personas (PNJ)** hablan dos veces por conversación, sin palabras y bajito: un saludo corto («hmm», «¿ah?») cuando
la conversación **se abre** y una despedida cuando **se cierra**; las líneas nuevas y las respuestas, calladas (cada paso
con su voz saturaría). Sale de la persona, colocada en 3D a la altura de su boca, y solo la oye quien habla con ella
(`apps/plaza/pnj-voz.ts`, bus «efectos», con freno de 0,8 s para quien abre y cierra deprisa). Cada persona suena
siempre con la misma voz: la de su `voz` (pnj@1, abajo) o, sin ella, una elegida por su id.

**`tema`** (opcional, dentro de la ficha): cómo se ve la página de ESTE mundo, para que un evento traiga su aire sin
tocar el motor. Diez colores «#rrggbb» de los paneles — `fondo`, `superficie`, `elevado` (botones), `texto`, `texto2`,
`linea`, `foco` (lo que se toca), `accion` (el botón principal; la tinta encima, clara u oscura, la elige el motor),
`enfasis` (la misión seguida y los avisos), `etiqueta` —; `titulos`, la letra de los títulos, una de las que trae el motor
(`geist`, `geist-mono`, `bebas-neue`; todas SIL OFL, en `apps/plaza/public/fuentes`), nunca un fichero; `sombra`, el color
de una sombra desplazada en los títulos; `mayusculas` (true/false) y `forma` de los botones (`recta` o `pildora`). Un valor
que no cabe se deja fuera y se dice en el registro (`[ficha] tema.fondo: …`); el resto se aplica; una clave desconocida
se ignora. Va en `GET /status` (`tema`) y la página lo vuelca en las variables CSS de `apps/plaza/tema.css`
(`apps/plaza/tema-mundo.ts`). Sin tema, el aire de la casa. Ejemplo, el de la TRG26: `"tema": { "fondo": "#0b0006",
"texto": "#e8f8ff", "accion": "#ff8ebe", "enfasis": "#f9ff8e", "foco": "#64f5f0", "titulos": "bebas-neue", "sombra":
"#ff8ebe", "mayusculas": true, "forma": "pildora" }`.

Reglas para quien escribe (persona o LLM):
- **Ids** en minúsculas, cifras y guiones (`primeros-pasos`); cada fichero, un `formato` en su primera línea. Un campo
  desconocido es un error (así una tilde de más, `descripción`, no pasa en silencio). `notas` vale en todos.
- Los textos se miden en **bytes UTF-8** (una letra con tilde cuenta 2): título ≤ 80, descripción ≤ 300, texto de paso
  ≤ 160, línea de diálogo ≤ 400, respuesta ≤ 100, aviso ≤ 40, nombre ≤ 60, grupo ≤ 40, oficio ≤ 40.
- Posiciones en metros (`x`, `z`; −z es el norte, hacia donde mira la cámara al llegar), radios en metros.
- Lo que tenga un problema **no se carga** (y el registro dice por qué); el resto sí.

**`mision@1`** — pasos en orden (o en cualquier orden, los de un mismo `grupo`: abajo); cada uno se completa solo cuando
el servidor lo ve:

```json
{ "formato": "mision@1", "id": "primeros-pasos", "titulo": "Primeros pasos en la plaza",
  "descripcion": "Visita el pilar dorado, saluda a Bruno y busca su caja.",
  "requisitos": { "misiones": [] },
  "pasos": [
    { "id": "pilar", "tipo": "llega_a", "texto": "Visita el pilar dorado", "x": 18, "z": 0, "radio": 4, "lugar": "Pilar dorado" },
    { "id": "bruno", "tipo": "habla_con", "texto": "Habla con Bruno", "pnj": "bruno" },
    { "id": "caja", "tipo": "coge", "texto": "Recupera la caja", "cosa": "caja-de-bruno" }
  ],
  "recompensas": [{ "tipo": "insignia", "id": "conoce-la-plaza", "nombre": "Conoce la plaza" }],
  "textos": { "aceptada": "Lo tienes en tu libro (J).", "completada": "Bruno ya puede arreglar los faroles." },
  "repetible": false }
```

| Paso | Campos | Se completa cuando |
|---|---|---|
| `llega_a` | `x`, `z`, `radio` (1-50, 4), `lugar` (nombre para el mapa); opcional `y` (0–30 m: la planta) | el servidor ve al jugador a menos de `radio`; con `y`, además a menos de 2,5 m de esa altura (desde la planta de abajo no cuenta) |
| `habla_con` | `pnj` | elige en el diálogo de esa persona una respuesta `avanzar_paso` de esta misión; si su árbol no tiene ninguna, basta con hablarle |
| `recibe` | `pnj`, `cosa` | como `habla_con`; esa persona te da la cosa, que queda «llevada» para una `entrega` |
| `usa` | `cosa` | usa la cosa a su alcance (E) |
| `coge` | `cosa` | la coge a su alcance (E); queda «llevada» para una `entrega` |
| `entrega` | `pnj` y `cosa`, o `cosas` (una lista de 1 a 8) | las lleva todas (cada una con un `coge` o un `recibe` antes en la misma misión) y elige `entregar` (o le habla, si no hay esa respuesta); se las da todas a la vez |

**`hace`: que quien construye haga algo de verdad (T1).** `{ "id", "tipo": "hace", "texto", "accion", "modelo"?, "disparador"?, "senala"? }`.
Lo decide el servidor a partir de lo que las otras piezas ya cuentan (no hay nada nuevo en el tick); solo cuenta si ese
paso es el que toca, y **sin permiso de construir no cuenta ninguna acción**. Un tutorial del constructor lo usa para
que cada misión enseñe un botón y no avance hasta que se ha usado de verdad. Ejemplo:
`{ "id": "pon-farolillo", "tipo": "hace", "texto": "Añade un farolillo al mundo", "accion": "coloca", "modelo": "farolillo", "senala": "dock-anadir" }`.

| `accion` | Cuenta cuando… |
|---|---|
| `coloca` | pones un objeto nuevo (no un duplicado); con `modelo` (el id de la biblioteca: `bloque`, `farolillo`…) solo uno de ese modelo |
| `mueve` · `gira` · `escala` | un objeto cambia de sitio · de giro (también la acción de girar) · de tamaño (un arrastre que cambia varias cosas cuenta una sola: la primera que pide la misión) |
| `oculta` | un ajuste deja el objeto oculto al jugar (si el ajuste lo deja visible, no cuenta) |
| `borra` | quitas un objeto |
| `crea_cable` · `edita_cable` · `borra_cable` | creas, editas o borras un cable (disparador); con `disparador` solo ese cable |
| `dispara_cable` | pulsas un botón o entras en una zona de un cable; con `disparador` solo ese |
| `abre_construir` · `abre_cable` · `abre_biblioteca` | la página abre el panel Construir, el cajón Cable o el cajón Añadir. El servidor no lo ve: la página lo dice con la orden `misiones.hace` y **solo estas tres** se aceptan (cualquier otra se rechaza); la página solo lo manda si hay un paso que lo pide |

`modelo` solo va con `coloca`; `disparador`, solo con las acciones de cable. **`senala`** (opcional, vale en **cualquier**
tipo de paso): el id del botón de la página al que apuntará la flecha (`[a-z0-9-]`, 1 a 32; p. ej. `construir`,
`dock-cable`). El motor solo lo valida, lo guarda y lo manda a la página con el paso (`misiones.senala()`); un paso `hace`
no tiene sitio en el mundo, así que no pone baliza ni marca en el mapa. La flecha (`apps/plaza/flecha.ts`, T3) ya lo lee: señala ese botón y, si no se ve, el que lleva a él
(`cable-nuevo` → `dock-cable` → `construir` → `mas` en móvil; lógica pura en `flecha-logica.ts`). Para oír esto las piezas dicen quién hizo qué con
dos eventos solo-servidor: `objetos.hizo` y `disparadores.hizo` (más `persona` en `disparadores.senal`).

**En cualquier orden: `grupo`.** Pasos **seguidos** con el mismo `grupo` (un texto de 1 a 40 bytes) forman un bloque que
se hace en el orden que quiera el jugador; la misión pasa al siguiente paso cuando están todos. El `grupo` es también el
nombre del contador que ve arriba de la pantalla. Un `grupo` repetido más adelante, separado, es un error (junta esos
pasos). Así es la misión de la TRG26: tres artesanos te dan una pieza cada uno, en cualquier orden, y luego llevas las tres
a Leonardo:

```json
"pasos": [
  { "id": "bastidor", "tipo": "recibe", "texto": "Recoge el bastidor de Cosimo", "pnj": "cosimo", "cosa": "bastidor", "grupo": "Piezas reunidas" },
  { "id": "telas", "tipo": "recibe", "texto": "Recoge las telas de Bianca", "pnj": "bianca", "cosa": "telas", "grupo": "Piezas reunidas" },
  { "id": "plano", "tipo": "recibe", "texto": "Recoge el plano de Artemisia", "pnj": "artemisia", "cosa": "plano", "grupo": "Piezas reunidas" },
  { "id": "entrega", "tipo": "entrega", "texto": "Entrega las tres piezas a Leonardo", "pnj": "leonardo", "cosas": ["bastidor", "telas", "plano"] },
  { "id": "cofre", "tipo": "usa", "texto": "Abre el cofre y recoge tu recompensa", "cosa": "cofre" }
]
```

En el libro, cada pieza que le falta sale como «ahora» y la entrega y el cofre con candado hasta que les toca (el libro
se abre solo al aceptar la misión, en cuanto termina la conversación con quien la da); las tres, en el mapa, y arriba
«★ El vuelo del Maestro · Piezas reunidas 1/3 · Bianca, a 12 m al norte» (la más cercana); al hablar con cada artesano,
«Has recibido: <la cosa>» con el icono de objeto (también al coger algo con un paso `coge`) y un sonido corto.
Hablar dos veces con el mismo no cuenta dos. Leonardo no acepta la entrega hasta que llevas las tres.

**Un momento que solo ves tú y un paso que espera (U14 (5)).** Dos campos opcionales de cualquier paso:
- `secuencia`: el id de una `secuencia@1` (abajo). Cuando el servidor da ese paso por hecho, manda la secuencia **solo a
  quien lo hizo** (a todas sus pestañas), y su página la pone: los demás jugadores del mismo servidor siguen viendo a esa
  persona en su sitio y pueden hacer su propia misión a la vez. Se manda una vez: quien vuelve a entrar no la ve otra vez.
- `espera` (segundos, 1–60): el paso no se puede hacer hasta que pasan esos segundos desde que le tocó (en un `grupo`,
  desde que empezó el bloque). Mientras espera sale con candado en el libro y la cuenta atrás («· en 7 s», también arriba
  de la pantalla), no es objetivo en el mapa y su persona o su cosa no lleva «!»; quien lo intenta antes oye «Todavía no:
  faltan 7 s para «Abre el cofre…».». Al cumplirse, el servidor le manda el libro y las marcas otra vez (una vez). La
  cuenta es del reloj del servidor y se guarda con el progreso (`desde`): volver a entrar, o un reinicio, no la reinicia.

Así acaba la TRG26: al darle las tres piezas, Leonardo se pone las alas y vuela (solo para ti), y el cofre se abre
cuando ha aterrizado:

```json
{ "id": "entrega", "tipo": "entrega", "texto": "Entrega las tres piezas a Leonardo", "pnj": "leonardo", "cosas": ["bastidor", "telas", "plano"], "secuencia": "vuelo" },
{ "id": "cofre", "tipo": "usa", "texto": "Abre el cofre y recoge tu recompensa", "cosa": "cofre", "espera": 10 }
```

**`secuencia@1`** — un momento corto con guion (1–30 s): pistas que se tocan a la vez, cada una con sus tiempos (en
segundos desde que empieza). Todo pasa **solo en la página** de quien la provoca: la persona se mueve allí, no en el
servidor; al acabar vuelve exactamente a donde dice el servidor.

```json
{ "formato": "secuencia@1", "id": "vuelo", "duracion": 9.5,
  "pistas": [
    { "tipo": "texto", "t": 0.2, "texto": "¡Eureka! Leonardo se pone las alas…" },
    { "tipo": "muestra", "modelo": "<sha256 de alas.glb>", "pnj": "leonardo", "offset": { "x": 0, "y": 1.45, "z": -0.16 }, "desde": 0.5, "hasta": 9.5 },
    { "tipo": "sonido", "t": 0.5, "sonido": "magia" },
    { "tipo": "mueve", "pnj": "leonardo", "claves": [
      { "t": 1.5 },
      { "t": 2.8, "x": -30, "y": 5, "z": -2, "giro": 90 },
      { "t": 3.8, "x": -26, "y": 6, "z": -6, "giro": 180 },
      { "t": 4.8, "x": -30, "y": 6.5, "z": -10, "giro": -90 },
      { "t": 5.8, "x": -34, "y": 6, "z": -6, "giro": 0 },
      { "t": 6.8, "x": -30, "y": 3, "z": -2, "giro": 90 },
      { "t": 7.8, "x": -30, "y": 0, "z": -2, "giro": 0 } ] },
    { "tipo": "texto", "t": 8, "texto": "Leonardo aterriza. En un momento podrás abrir el cofre." } ] }
```

| Pista | Campos | Qué hace |
|---|---|---|
| `mueve` | `pnj`, `claves` (1–12: `t` y, si quieres, `x`, `y` (0–60), `z`, `giro`) | la persona sigue sus claves (posiciones del mundo, en metros; giro en grados) por una curva suave que no se pasa de ninguna (si una clave está en el suelo, no lo atraviesa); lo que una clave no dice es su sitio y su giro del `pnj@1`. Antes de la primera, en su sitio; tras la última, quieta ahí. Una persona, un `mueve` a la vez |
| `muestra` | `modelo` (sha256 de un .glb), `desde`, `hasta`; y `pnj` con `offset` `{x, y, z}` (±10 m, en su marco: −z es su espalda), o `x`, `y`, `z`; opcionales `giro` (+ el suyo), `escala` (1) | un modelo de más de `desde` a `hasta`: con `pnj` va con esa persona aunque vuele (con su giro y su tamaño) |
| `texto` | `t`, `texto` (≤ 120 bytes) | la línea sale en la nota de la página y se lee en voz alta (lector de pantalla) |
| `sonido` | `t`, `sonido` (`suave`, `aviso`, `exito`, `error`, `paso`, `campana`, `magia`) | un sonido de la casa (notas cortas hechas en la página, sin fichero; con el volumen de efectos) |

- Hasta 16 pistas; cada `t`, `desde` y `hasta` dentro de `duracion`; las claves, cada una después de la anterior.
- Se comprueba al cargar: un `pnj` que no existe es un error (con la lista de los que hay), y también un `modelo` que el
  servidor no tiene (súbelo arrastrándolo al mundo o cópialo como `datos/activos/<sha256>.glb`; la biblioteca de la casa
  vale). Un paso que nombra una secuencia que no hay deja fuera su misión (se haría sin su momento).
- En la página: una secuencia a la vez (si llega otra, espera su turno; como mucho 3 en cola); mientras no suena
  ninguna, la página no hace nada por cuadro; en VR no mueve la cámara; su código (1,9 kB gz) se baja con la primera
  que llega. Para comprobaciones y agentes,
  `__numinia.misiones.secuencia()` → `{ id, t, duracion, personas, modelos, linea, cola }` o `null`.
- Coste: el servidor la convierte una vez en eventos (`secuencia`, una `pista` por pista y una `clave` por clave: 15
  eventos y 554 bytes el vuelo de arriba) y los manda solo a ese jugador; las esperas pendientes se miran 5 veces por
  segundo, solo las de quien tiene una (1.000 jugadores esperando: tick de las funciones p99 ≈ 0,15 ms).

Recompensas: `insignia` (un recuerdo de lo hecho) o `semilla` (`{ "tipo": "semilla", "color": "verde", "n": 1 }`: una
Semilla del Conocimiento al inventario de quien la completa, Y1); sin economía. `requisitos.misiones`: las que hay que haber
completado antes. Hasta 16 pasos, 16 misiones activas por jugador.

**La recompensa, apuntada una sola vez (U14 (6)).** Al completar una misión con `recompensas`, el servidor apunta en el
almacén de `misiones` (S4: `datos/misiones.json` + `.jsonl` del mundo) **una** concesión por jugador y misión, en la clave
`c:<misión>:<id del jugador>`: `{ "jugador": "<id>", "nombre": "Invitado IJKL", "mision": "vuelo-del-maestro",
"recompensas": ["sello-artifice"], "instante": "2026-10-17T03:41:12.345Z", "estado": "concedida" }` (el instante en ISO 8601,
UTC; unos 250 bytes, del tope de 4.096). Se escribe solo si no está y nunca se sobrescribe: pulsar otra vez, reconectar,
dos pestañas del mismo invitado o dos jugadores a la vez dejan una por jugador. Una misión `repetible` guarda solo la
**primera** vez (su instante). **Sin identidad (I1) no hay concesión**: una página que no dice quién es (un robot, un agente
sin billete) completa la misión en su libro de memoria y no queda apuntada; una IA con identidad sí (su nombre acaba en
« · IA»). No depende de ninguna cartera: si un día se emite un NFT, será un paso aparte que lea estas concesiones. Código:
`features/misiones/concesion.ts`; `estado` hoy siempre es «concedida».

Para quien organiza: `npm run concesiones -- <carpeta del mundo> [misión]` (o `node packages/server/src/concesiones.ts …`;
sin carpeta, la de MOTOR_MUNDO; vale también una DATOS_DIR como `.run/datos`) escribe en CSV `jugador,nombre,mision,
recompensas,instante,estado`, de la más antigua a la más nueva (varias recompensas en una celda, separadas por «;»; un
nombre que empezaría por `=` `+` `-` `@` lleva delante un apóstrofo, para que la hoja de cálculo no lo tome por una
fórmula), y por la salida de errores cuántas hay. Solo lee: funciona con el servidor en marcha (lee la foto y el diario del
mismo momento, como la copia del mundo; lo de la última fracción de segundo sale la vez siguiente). Va dentro del motor
instalado y de la imagen: `docker exec <contenedor> /opt/numinia-engine/node/bin/node packages/server/src/concesiones.ts /mundo
> concesiones.csv`.

```
$ npm run -s concesiones -- mundo vuelo-del-maestro > concesiones.csv
2 concesiones de «vuelo-del-maestro» en …/mundo/datos
$ cat concesiones.csv
jugador,nombre,mision,recompensas,instante,estado
abcdefghijkl,Invitado IJKL,vuelo-del-maestro,sello-artifice,2026-10-17T03:41:12.345Z,concedida
mnopqrstuvwx,Invitado UVWX,vuelo-del-maestro,sello-artifice,2026-10-17T03:44:58.020Z,concedida
```

Quien completa una misión ve en el centro de arriba, unos 4 s, el cartel **«Misión completada»** con su título y la
insignia (`apps/plaza/misiones.ts`: con el aire del mundo, la letra de los títulos de su `tema`; no quita ni el teclado ni el
ratón; es una región `aria-live` y el aviso general de `completada` no se repite) y un acorde corto tras las tres notas del
paso. La insignia queda en su ficha (I) y en su libro.

**`pnj@1`** — una persona: dónde está y un **árbol de diálogo determinista** que depende de tus misiones:

```json
{ "formato": "pnj@1", "id": "bruno", "nombre": "Bruno", "oficio": "Farolero", "descripcion": "Cuida de los faroles.",
  "posicion": { "x": 10, "z": 8 }, "giro": -90, "radio": 3, "apariencia": { "modelo": "<sha256 de un .glb>", "escala": 1 },
  "dialogo": {
    "entradas": [
      { "si": { "mision": "primeros-pasos", "estado": "activa", "paso": "bruno" }, "nodo": "recado" },
      { "nodo": "hola" }
    ],
    "nodos": {
      "hola": { "texto": "Buenas. Cuido de los faroles.", "opciones": [{ "texto": "Adiós.", "accion": { "tipo": "despedir" } }] },
      "recado": { "texto": "¿Te manda Alma? He perdido mi caja.", "opciones": [
        { "texto": "Yo te la busco.", "accion": { "tipo": "avanzar_paso", "mision": "primeros-pasos" }, "ir": "gracias" },
        { "texto": "Ahora no puedo.", "accion": { "tipo": "despedir" } } ] },
      "gracias": { "texto": "¡Gracias!", "opciones": [{ "texto": "Voy.", "accion": { "tipo": "despedir" } }] }
    } } }
```

- Al hablarle, el servidor abre el primer nodo de `entradas` cuyo `si` se cumple; **la última no lleva `si`**.
- Condiciones (`si`, una o una lista: todas deben cumplirse): `{ "mision", "estado" }` con estado `sin_empezar`,
  `disponible` (sin empezar y con los requisitos hechos), `activa` (y si quieres `"paso": "<id de un paso que toca ahora>"`
  —en un grupo, uno que aún no has hecho: deja de cumplirse al hacerlo— o `"tiene": "<cosa>"`) o `hecha`. Una respuesta
  con `si` que no se cumple no se ve.
- Cada nodo: `texto` y hasta 4 respuestas (teclas 1-4). Una respuesta lleva `ir` (otro nodo), `accion` o las dos:
  `dar_mision` (la acepta, si puede), `avanzar_paso` (completa su paso `habla_con` o `recibe` con esta persona),
  `entregar` (completa su `entrega` a esta persona), `despedir`. Sin `ir`, la conversación termina.
- `apariencia.modelo` vacío = el robot de la casa; `apariencia.vrm` queda reservado (avatares VRM).
- `radio`: a cuántos metros se le habla (1-8, 3). La conversación se cierra si te alejas 4 m más.
- Opcional `posicion.y` (0–30 m): la planta en la que está (una torre); se dibuja a esa altura y solo se le habla desde
  menos de 2,5 m de ella (desde la planta de abajo ni sale «E: hablar con…» ni el servidor lo admite). Sin `y`, el suelo.
- Opcional `oficio` (1–40 bytes, U14 (4)): a qué se dedica («Carpintero», «Tejedora»). Sale en una segunda línea, más
  pequeña, bajo el nombre que flota sobre la persona; junto al nombre en el título de la conversación, y en la lista del
  mapa («Cosimo (Carpintero)»). Con oficio, deja el nombre corto: «Cosimo», no «Cosimo, el carpintero». Sin él, una línea.
- Opcional `voz` (`hombre-joven` o `mujer-mayor`): cómo suena la persona al empezar y al acabar la conversación (un
  saludo y una despedida cortos, sin palabras; las líneas no suenan). Sin `voz`, una de las dos elegida por su id:
  siempre la misma, pero puede no pegarle; dila si importa. Las tomas son CC0 (`features/sonido/catalogo.json`,
  `pnj-saludo-<voz>` y `pnj-despedida-<voz>`); una voz nueva entra por la biblioteca de sonido y por `VOCES_PNJ`
  (`features/misiones/formato.ts`).

**Marcas sobre las personas y las cosas («!» y «✓», U14 (4))** — las decide el servidor para cada jugador, con su
progreso, y le llegan **solo a él** (a todas sus pestañas) tras cada libro (evento `marcas`). La aventura no escribe
nada: salen de sus misiones.
- **«!»** (un signo grande en ámbar sobre el nombre) = tiene algo para ti **ahora**: te ofrece una misión que puedes
  coger ya (sin empezar o repetible, con sus requisitos hechos), o es la persona de un paso tuyo que toca ahora
  (`habla_con`, `recibe`, `entrega` del bloque en curso; en un `grupo`, todas las que faltan). Una **cosa** de misión
  lleva «!» cuando un paso que toca ahora es cogerla o usarla (`coge`, `usa`); solo entonces tiene nombre flotando.
- **«✓»** (verde) = ya hiciste lo suyo: te dio una misión que tienes o terminaste, o fue la persona de un paso hecho, y
  no te queda **nada** pendiente con ella (ni un paso más adelante en la misión, ni una misión que ofrecerte).
- Nada, en otro caso: los artesanos de la TRG26 no llevan «!» hasta que aceptas la misión de Pietro, y quien ya
  terminó contigo nunca vuelve a llevarla (salvo que te ofrezca otra misión).
- El minimapa y el mapa grande dibujan a esas personas con su marca (disco ámbar con «!», disco verde con «✓»; la
  estrella del objetivo sigue debajo). Cada lista de ids va en ≤ 256 bytes (≈ 25 ids cortos): si no cabe, se quedan
  fuera las del final (primero van los pasos de ahora, luego las ofertas; primero las misiones activas, luego las
  terminadas, la más nueva antes). La regla es una función pura, `marcas(progreso, aventura)` en
  `features/misiones/maquina.ts`.
- Coste: un sprite por persona cercana (como antes) y uno por cosa marcada; un rótulo se vuelve a pintar solo cuando
  cambia su texto o su marca (parado, ninguno).

**`cosa@1`** — `{ "formato": "cosa@1", "id": "caja-de-bruno", "nombre": "Caja de herramientas", "posicion": { "x": 4, "z": 14 },
"radio": 2, "aviso": "coger la caja", "apariencia": { "escala": 0.45 } }`. Sale «E: coger la caja» solo a quien tiene ahora
un paso `coge`/`usa` con ella; la cosa sigue en el mundo para los demás (cada uno coge «la suya»). Lo que da una persona
(`recibe`) también es una `cosa@1`: ponla donde la tiene esa persona (en su mesa); no sale «E» para cogerla.
Opcionales (J10): `posicion.y` (0–30 m: a la altura de la mano, para cogerla con la mano en VR, o en una planta alta; se
usa solo desde menos de 2,5 m de esa altura) y `apariencia.color`
(«#rrggbb»: el modelo pintado de ese color, para que dos cosas se distingan). Lo cogido en un paso `coge` se dibuja en la
mano que lo cogió (al lado de tu avatar en pantalla) hasta que la misión termina; luego vuelve a su sitio (lo recibido en
un `recibe`, todavía no: se queda en su sitio).

**Una cosa que se ve usada para ti (`apariencia.usada`, U14 (6)).** `"apariencia": { "modelo": "<sha256 del cofre
cerrado>", "escala": 1, "usada": { "modelo": "<sha256 del cofre abierto>", "escala": 1 } }`: cómo se ve la cosa para **quien
ya hizo el paso que la usa** (`usa` o `coge`) en una misión que lleva o que terminó. Los demás la siguen viendo como antes,
y cada uno abre «el suyo». `escala` es opcional (sin ella, la de la cosa); `modelo`, el sha256 de un `.glb` del mundo
(`datos/activos/<sha256>.glb`) o de la biblioteca. Lo decide la página de cada jugador con **su** libro (los pasos hechos
y su `que`: `usadasDe` y `aspectoCosa` en `features/misiones/client.ts`); el servidor solo manda los dos aspectos en el
estado de la cosa (`modeloUsada`, `escalaUsada`: misiones v5). Se recalcula cuando el libro ha llegado entero (no parpadea
mientras llega) y solo se vuelve a dibujar la cosa cuyo aspecto cambia. El libro trae las 20 misiones terminadas más
nuevas: una cosa usada en una más vieja vuelve a verse como antes. En la TRG26, el cofre cerrado y, al abrirlo, abierto e
iluminado solo para quien lo abrió.

Lo que pasa en el servidor (`features/misiones/server.ts`) y no se puede saltar desde la página:
- distancias (`api.within`: el radio y, si la persona o la cosa tiene `y`, menos de 2,5 m de altura —
  `ALCANCE_ALTURA_M`—), posiciones (`api.position`, con `y`, cada 0,2 s y solo de quien espera llegar a un sitio) y los
  pasos que tocan; hablar de lejos, coger algo que no toca o elegir sin conversación se rechaza diciendo por qué;
- el progreso es **por invitado** (I1) en el almacén (S4, `p:<id>`): sobrevive a los reinicios y llega **solo a su dueño**
  (eventos `libro`, `mision`, `paso`, `aceptada`, `avance`, `completada`, `marcas`, y U14 (5) `secuencia`, `pista`,
  `clave`); las personas y las cosas llegan con `at` (J9); U14 (5): un paso con `espera` cuenta con el reloj del servidor
  (la máquina no tiene reloj: el servidor le pasa `ahora` en cada suceso y guarda `desde` con el progreso);
- **el texto no lo decide un modelo**: el árbol es la política. Si un día un LLM da voz a una persona (P5), solo
  **redacta** la línea escrita (`Frasear` en `server.ts`) siguiendo STD-050: en sus instrucciones solo el papel de la
  persona y las normas de la casa; el nombre del jugador y lo que alguien escribió van en un bloque `<material>`
  vallado; su respuesta se comprueba y, si falla, se dice la línea escrita. Se llama al hablar, nunca por tick.

Para agentes y páginas: `window.__numinia.misiones` (`libro()`, `objetivos()`, `resumen()`, `dialogo()`, `hablar`,
`elegir`, `adios`, `aceptar`, `abandonar`, `seguir`, `usar`); el mapa lee `objetivos()` → `[{ mision, paso, nombre,
texto, x, z, seguida }]` (uno por paso que toca: en un grupo, todos los que faltan); `resumen().seguida.grupo` =
`{ nombre, hechos, total }` del grupo en curso de la misión seguida, o `null`. U14 (4): `marcas()` → `{ tiene, hecho,
cosas }` (ids: personas con «!», personas con «✓», cosas con «!»; el mismo objeto mientras no cambian),
`marcaDe(feature, clave)` → `"!"`, `"✓"` o `""` (`pnj` o `misiones`), `oficioDe(pnj)` y `dialogo().oficio`; `vozDe(pnj)` (su `voz`, `""` sin ella) y `personaDe(pnj)` (`{ x, y, z, escala }`
donde está ahora, o `null`). U14 (5):
cada paso de `libro()` lleva `espera` (los segundos que le faltaban al llegar el libro; 0 = ya se puede) y `listoEn`
(cuándo se abre, en el reloj de la página); `secuencia()` (la que suena, o `null`), `alSecuencia(fn)` (oír cuándo
empieza, cada línea, cada sonido y cuándo acaba) y `cuadro()` (la página la avanza en cada cuadro).

## Escenas y el Director de juego (N6)

Quien **dirige** una aventura o un evento (el Director de Juego, DJ, del manual: presenta escenas y da voz al mundo,
no decide por nadie) es quien tiene el permiso de la organización **«Gestionar rituales»** (`manage-rituals`, STD-052;
en la plantilla «Comunidad», Moderación; los dueños y Administración, también). El motor lo llama la acción `dirigir`
(`packages/server/src/roles.ts`). Una IA no dirige en este corte (`PERMISOS_IA`).

Una aventura trae sus escenas en `escenas/<id>.json` (el id es el nombre del fichero: minúsculas, cifras y guiones):

```json
{ "schema": "numinia-engine/escena@1", "nombre": "La taberna", "preset": "atardecer",
  "entorno": { "niebla": { "cerca": 8, "lejos": 60, "color": "#3a2a20", "delCielo": false } },
  "narracion": "Huele a vino especiado." }
```

- `nombre` (1–40 bytes) es lo que ve quien dirige. Hace falta `preset` (uno de la casa) o `entorno` (un `entorno@1`
  parcial, sin `suelo`, `aparicion` ni `mapa`, que son del mundo; caben 512 bytes en JSON compacto), o los dos.
- Al ponerla: el entorno del mundo, luego el preset y luego lo que cambia la escena. Pasar de una escena a otra no
  deja restos. Si hay `narracion` (≤ 280 bytes), todos la ven en el cartel del narrador.
- Los entornos de la casa también son escenas: `/escena noche` vale en cualquier mundo.
- Quien dirige tiene el botón «Dirigir» (tecla K): escenas, luz y niebla en directo, narrar y «Convocar aquí». En el
  chat: `/escenas`, `/escena <nombre o número>`, `/narrar <texto>` y `/convocar [texto]`.
- **Convocar no mueve a nadie**: cada persona recibe «Ir / Ahora no». «Ir» enciende una baliza en el sitio y quien
  convocó ve cuántas vienen.
- `node tools/aventura.ts <carpeta>` comprueba las escenas; una mal escrita no se carga y el registro dice por qué.

## El Inventario (Y1): dar objetos a una persona desde tu función

El inventario (`features/inventario`) guarda por invitado lo que posee (`api.store`, clave `i:<quien.id>`, S4) y se
lo manda entero solo a él (`lista` + un `objeto` por cada uno). El canon manda los límites: **1 arma** contigo, **3
reliquias** contigo, el resto en la Reserva; los **tokens** (Semillas del Conocimiento por color) apilan y no se portan.

Tu función no importa el inventario ni él a ti: declaras en tus `events` uno tuyo, p. ej.

```ts
otorga: { describe: "Solo en el servidor: doy un objeto a quien (entidad).", announce: "silent",
  fields: { quien: { kind: "int", min: 0, max: 65535 }, tipo: { kind: "enum", values: ["arma", "reliquia", "token"] },
            clase: { kind: "text", maxBytes: 32 }, nombre: { kind: "text", maxBytes: 40 },
            color: { kind: "enum", values: ["", "verde", "azul", "plateada", "dorada", "roja"] }, n: { kind: "int", min: 1, max: 999, default: 1 } } }
```

y lo emites con `api.emit("otorga", { quien: e, tipo: "token", clase: "semilla", nombre: "Semilla verde", color: "verde", n: 1 }, "server")`:
ninguna página lo recibe; el inventario lo oye (`api.listen`, lista `DONANTES` en `features/inventario/server.ts`: añade
tu `[id, "otorga"]`) y se lo da a esa persona, que oye «Recibes Semilla verde». Lo que una misión da va en su
`recompensas` (arriba). Reglas puras para probar sin red: `features/inventario/reglas.ts` (`dar`, `quitar`, `equipar`,
`desequipar`, `leerInventario`). Panel de la página: `apps/plaza/inventario.ts` (R); resumen en la ficha (I, sección «Reserva»).


Lo que el dueño hace en el chat con `/agente añadir|quitar` lo hace también el panel de numinia.com por HTTP, con el mismo
código (`roles-mundo.ts`, `agentes`) y el mismo fichero (`aventura/agentes/<id>.json`):

| Ruta | Hace | Respuesta |
|---|---|---|
| `GET /agentes` | lista | `{ agentes: [{ id, nombre, rol, permisos, presente }] }` (`presente` = conectado ahora) |
| `POST /agentes` | añade; cuerpo `{ id, nombre, clave, rol? }` | 201 `{ ok, texto, agente }`; 400 datos que no valen, 409 ya existe o es un habitante |
| `DELETE /agentes/<id>` | quita; si está dentro lo avisa y lo cierra con 4003 | 200 `{ ok, texto }`; 404 no existe |

Entra solo con el pase de numinia.com (H3b): `Authorization: Bearer <pase>`, verificado como en el WebSocket (`aud` = este
mundo) y con el permiso `manage-organization` o dueño. 401 = sin pase o pase malo (`{ error, texto }`, el `texto` en
español del verificador), 403 = pase bueno sin permiso, 404 `agentes-desactivado` = el mundo no tiene `MOTOR_PASE_CLAVE`
(cerrado, nunca abierto). CORS: solo `https://numinia.com` (responde al `OPTIONS` y pone `Access-Control-Allow-Origin`;
a otro origen no le pone ninguna cabecera CORS; nunca `*`). El instalador deja pasar `/agentes*` por Caddy.

## Pesca (v2): un minijuego que decide el servidor

`features/pesca` es el ejemplo de **minijuego con tiempo**: el servidor lleva el ciclo entero en `api.onTick` (20 Hz) y la
página solo pide tres cosas (`lanzar { sitio }`, `recoger { activo }`, `soltar`) y anima lo que le cuentan.
- **Sitio de pesca** = una cosa del mundo (`state` con `at`, ficha `lugar`, `interact: { intent: "lanzar", prompt: "pescar",
  radius: "radio" }`): «E: pescar» al lado del agua. Por defecto uno («Estanque de la plaza», x 18, z −14, radio 4,
  `SITIOS_DEFECTO` en `server.ts`); un mundo trae los suyos en `MUNDO_DIR/pesca.json` (`{ "sitios": [{ id, nombre, x, y, z,
  radio }] }`, leído en `features/mundo.ts`). Un pescador por sitio (`ocupado`).
- **Ciclo** (números en `feature.ts`, de bridge-mind/tideline, MIT): espera 3–12 s → quizá un `mordisqueo` al 45 % → `picada`
  con ventana 1,2 s (× rareza) → `recoger { activo: true }` a tiempo engancha → `pelea`: recogiendo sube la tensión (+26 %/s ×
  fuerza) y el progreso (+13,5 %/s ÷ peso); descansando bajan (−21, −5,5 × fuerza); arrancadas avisadas 0,75 s antes
  (`tension.arrancada`: no | aviso | si); tensión 100 = `escape rota`, progreso 0 = `escapa`, 55 s = `agotado`, alejarse =
  `lejos`; progreso 100 = `captura { pez, cm, rareza, total }` («Has pescado: Carpa de 23,1 cm.», sonido `exito`).
  El estado de la pelea llega a 10 Hz solo al pescador (`tension`). Quien está a 40 m ve el flotador (`lanzado` / `fin`).
- **Peces**: `features/pesca/peces.json` (1–3 entradas; talla con `azar^1,8`, la fuerza crece con la talla). **Un mundo trae los
  suyos** en `MUNDO_DIR/pesca.json`, clave `peces` (opcional): **sustituyen** la tabla de la casa en ese mundo; sin `peces`
  todo sigue como antes. Cada pez: `id` (1–32, minúsculas, cifras y guion; único), `nombre` (≤ 32 caracteres y ≤ 40 bytes: lo
  que lee quien lo pesca), `rareza` (`comun`, `rara`, `legendaria`), `peso` (0,01–1000; más = más común), `cm` (`[mín, máx]`,
  1–500) y, si se quiere, `color` (`"#RRGGBB"`: el cuerpo del pez en la mano y un punto junto al nombre en «¡Pescado!») más los
  números de la pelea (`fuerza` 0,1–2,5 · `heft` 0,2–4 · `aguante` 3–50 s · `arrancadas` `[mín, máx]` s); lo que no diga lo toma
  del pez de la casa de su rareza (Carpa, Trucha, Lucio). Hasta 40 peces. Se lee **estricto** (`leerPeces` en
  `features/pesca/esquema.ts`, como `naturaleza.json`): una clave desconocida —también a nivel del fichero, que con `peces` solo
  admite `schema`, `sitios`, `peces` y `notas` (un texto para quien edite; no se lee)—, un valor fuera de rango, un nombre largo, un id repetido o una lista vacía hacen que **no
  se use el `pesca.json` entero** (el mundo se queda con el estanque y los peces de la casa) y el servidor lo cuenta en el log con
  la ruta de cada fallo (`[mundo] pesca.json no se usa …: pesca.peces[2].nombre: como mucho 32 caracteres`). Con `peces` y sin
  `sitios` vale el estanque de la casa. Para probarlo basta ese fichero: ningún código. `captura` y `fin` llevan el `color`
  (`""` = pez de la casa, la página usa el suyo). Ejemplo:
  `{ "schema": "numinia-engine/pesca@1", "sitios": [{ "id": "lago", "nombre": "Lago", "x": 10, "z": 0, "radio": 4 }], "peces": [{ "id": "pez-merlin", "nombre": "Pez Merlín", "rareza": "comun", "peso": 6, "cm": [30, 50], "color": "#3758E9" }] }`. Azar con el
  PRNG del motor (`rngNext`, estado propio de la función, semilla mezclada con el tick del lanzamiento: reproducible, nunca
  `Math.random`). Lo pescado se guarda por invitado en el almacén (`c:<id>`: cuántos y el mayor) y vuelve como `cesta`.
- **Página**: `features/pesca/client.ts` da el controlador (`window.__numinia.pesca`: `estado()`, `sitios()`, `flotadores()`,
  `capturas()`, `lanzar`, `recoger(activo)`, `pulsar`, `soltar`, `alCambiar`); nada más va en el arranque. Con el primer sitio
  llegan, perezosos, `apps/plaza/pesca.ts` (HUD: botón grande «Recoger» —mantener = recoger, soltar = descansar—, «Soltar»,
  barras de tensión y progreso, F / X en teclado, `navigator.vibrate` en picada, arrancada y captura; al acabar, 4 s de panel
  «¡Pescado!» —pez, cm, rareza, «En tu cesta: N», dos notas de Web Audio al volumen de efectos, vibración larga— o «Se ha
  escapado» con el motivo) y `packages/render/src/pesca.ts` (3D, `view.pesca`).
- **Sitio que se ve** (v2, `packages/render/src/pesca.ts`, 7 draw calls por sitio): estanque de radio `radio × 0,85` con
  **agua de un solo draw call** (el agua estilizada del motor, `agua-estilo.ts`, ver «Agua» más abajo, con dos anillos de
  ondas pálidos —uniformes `vec4(x, z, t0, fuerza)`— al caer el flotador, al mordisqueo, a la picada, en cada arrancada y al saltar el
  pez; sin render-target de reflexión: vale en móvil), orilla de tierra (lathe), 14 piedras y 3 matas de juncos (geometrías
  fundidas, azar determinista), **pantalán de tablas** hacia el centro de la plaza (`trazaDeSitio`: dirección sitio → origen;
  `view.pesca.sitio(id).pantalan` = dónde ponerse, dentro del radio) y cartel «Pesca» (lienzo). Caña, sedal y flotador como
  en v1, pero la caña sale de la **mano derecha del avatar** (`avatares.mano`, hueso `rightHand` del VRM; cápsula = al lado)
  y el cuerpo **mira al agua** mientras pesca (`avatares.orientar`, solo quieto).
- **El pez sale y va a la mano** (v2): `fin` lleva `pez, cm, rareza` a quien está a 40 m; el cliente guarda la captura
  (`capturas()`, `EN_MANO_MS` = 7 s, `olvidar`) y etiqueta al pescador «🐟 Carpa · 23,1 cm»; el 3D hace un pez low-poly
  (`geometriaDePez`: cuerpo, vientre, cola, aleta dorsal, pectorales, ojos; colores por especie Carpa / Trucha / Lucio;
  1 draw call; escala = cm / 100) que salta del flotador en arco hasta la mano (`SALTO_MS` 1,3 s) y cuelga de ella, cabeza
  arriba, hasta que pasan los 7 s o el pescador anda más de `PASO_SUELTA_M` (0,6 m). Lo ven todos los cercanos.
- **Pruebas**: `test/pesca-peces-mundo.test.ts` (los peces del mundo: lector estricto, sustituyen la tabla, nombre y color hasta la página, sin `peces` nada cambia, uno malo rechaza el fichero), `test/pesca.test.ts` (sin pantalla: la picada cae en el rango, fuera de ventana se escapa, la tensión sube y baja,
  un pescador sensato captura en 8–25 s, nadie captura sin picada, la simulación no se entera) y la pierna
  `tools/e2e-piernas/pesca.mjs` (navegador real: andar al pantalán, «E: pescar», HUD, chunk 3D, picada, pelea con F, captura,
  panel «¡Pescado!», pez en la mano en A y en B —otro invitado a 10 m—, la mano se vacía sola; B nunca recibe las fases de A).
- **En todas partes (N4)**: el mismo minijuego con cada entrada; todo sigue pasando por el controlador (el servidor decide).
  - **Móvil**: tocar «Pescar», mantener «Recoger». El HUD deja libre la columna de botones de la derecha («Saltar»…;
    `hacerSitio()` mide `#acciones`), con el botón grande ≥ 48 px.
  - **Mando en PC** (`apps/plaza/pesca-vr.ts`, mando estándar): A en el aviso «pescar» lanza; A o RT mantenidos
    recogen; B suelta. La pista del HUD cambia a «Mantén A (o RT)…» cuando hay un mando conectado.
  - **VR**: cada pantalán tiene una **caña en un soporte** (poste + tubo, 2 draw calls). La mano (mando o mano seguida)
    junto al mango la ilumina; con el agarre (o un pellizco) la coges y queda en tu mano real (`view.manos.ancla`).
    **Lanzar** = un golpe de muñeca hacia delante (hacia donde miras); **tirón** = levantar la caña de golpe (engancha en
    la picada; en la pelea da un tirón); el gatillo (o mantener el pellizco) recoge. Los gestos están en
    `features/pesca/gestos.ts`, que es puro: mide la velocidad de un punto de la caña a 1 m de la mano dentro de una
    ventana de 140 ms y exige además 0,3 m de recorrido, así que un pellizco o un salto de las articulaciones no cuenta
    como lance. Sigue funcionando igual con la tasa de cuadros de cualquier visor. La caña **vibra**: un toque cuando
    mordisquean, un golpe fuerte en la picada, un aviso antes de la arrancada, y en la pelea un zumbido que crece con
    la tensión. Encima de la caña hay un **medidor** (lienzo) con la misma frase que el HUD (`consejo()` en
    `client.ts`: «¡Afloja, que se rompe el sedal!»…) y las barras de tensión y pez; el sedal propio se pone rojo
    cuando va a romperse. Para devolver la caña: otra vez el agarre, o pellizcar junto al soporte; también vuelve
    sola si te alejas más de 6 m. La mano que tiene la caña, o que está en el mango, no apunta con el rayo ni «usa»
    cosas (`manos.reglas({ ocupada })`), para que el pellizco con el que coges la caña no lance desde el aviso.
    Si alguien pesca en ese sitio, el soporte se ve vacío.
  - **Pruebas**: `test/pesca-gestos.test.ts` y la pierna `tools/e2e-piernas/pesca-todas.mjs`. La pierna hace tres
    pasadas: móvil 390×844 táctil (tocar, un toque real mantenido, encaje del HUD), PC con un mando emulado y VR con IWER
    (soporte, agarre, lance, tirón, pelea con gatillo, vibración, medidor, devolver; luego con manos seguidas: pellizco
    para coger, lance y pellizco para devolver).
- **Después (v3)**: pantalán sólido (que el avatar suba a las tablas: hoy son un suelo a ras), mochila/cesta visible,
  sedal verlet (river-morning `Rope.ts`, MIT), varios sitios y tablas por hora/clima, sombras de peces,
  cebos y cañas, ficha de colección, paso de misión `pesca`, predicción local de la tensión, AR/VR.

## Bienes digitales: un objeto que es tuyo (N10)

Al acabar una aventura, un cofre puede dar un **objeto** que es del jugador: el mundo firma un **recibo de propiedad**
(Ed25519, sin cadena ni cartera ni dinero) y el objeto queda en su **Inventario** (ficha, tecla I), guardado por invitado.

- **En la misión** (`misiones/<id>.json`), una recompensa más:
  `{ "tipo": "objeto", "id": "farolillo-de-bruno", "nombre": "Farolillo de Bruno", "descripcion": "…", "modelo": "<sha256 de un .glb de activos/>", "licencia": "CC0-1.0" }`.
  `descripcion`, `modelo` y `licencia` son opcionales. La licencia (SPDX o similar) dice qué derechos tiene el arte:
  tener el objeto no da los derechos de autor de su obra.
- **Una vez por misión e invitado**: la concesión (U14, `c:<mision>:<invitado>`, `npm run concesiones`) dispara el evento
  solo-servidor `misiones.concedido`; la función `bienes` firma el recibo con `api.recibo(…)`, lo guarda (`b:<id>`) y
  avisa «Es tuyo: …» a todas las pestañas del dueño.
- **Sin `MOTOR_SECRET` no hay recibos**, así que no hay bienes (la concesión sí se apunta y el registro lo dice). La
  clave Ed25519 sale del secreto (HKDF), no hay fichero nuevo que guardar; al arrancar, el registro dice
  `[bienes] los recibos de este mundo los firma ed25519:…`.
- **El recibo viaja**: «Descargar recibo» baja `recibo-<objeto>-<id>.json`. Cualquiera lo comprueba con la clave que
  lleva dentro: la propia página (`features/bienes/comprobar.ts`, WebCrypto), otro mundo o una herramienta
  (`POST /bienes/comprobar`, que dice qué bien es y si lo firmó este mundo, nunca de quién es) y
  `npm run bienes -- verificar <fichero>`.
- **Listar y auditar**: `npm run bienes -- <carpeta del mundo>` da un CSV con cada bien y vuelve a comprobar cada firma
  (un registro tocado a mano sale `MAL`).
- **Cadena, todavía no**: `packages/server/src/cadena.ts` convierte un recibo en metadatos ERC-721 y en el vale EIP-712
  sin firmar de una acuñación perezosa (`npm run bienes -- metadatos <recibo>`). No crea claves ni toca ninguna red: qué
  cadena, quién custodia y quién paga lo decide Pablo. A la cadena nunca va nada de la persona (ni id de invitado, ni
  nombre, ni hashes de ellos; EDPB 02/2025 v2.0).

### Corte 2 (N18): verlo, llevarlo puesto, inventario rápido y recibos de otros mundos

- **Verlo en 3D.** Un bien con `modelo` (el sha256 de un `.glb` que este servidor tiene en `activos/`) trae `verse: true`
  y en la ficha sale **«Ver en 3D»**: el modelo gira en un lienzo propio (`packages/render/src/vitrina.ts`, un segundo
  WebGPURenderer vivo solo mientras se ve); se gira arrastrando (ratón o dedo) o con las flechas. Sin el fichero, la
  ficha dice que aquí no se puede ver ni llevar.
- **Llevarlo puesto.** Intent `llevar{id, donde}` (`mano` | `cabeza`; `donde: ""` = quitárselo). El servidor comprueba
  que el bien es tuyo y que tiene modelo, y lo publica en el estado compartido `p:<entidad>` `{ent, modelo, donde,
  nombre}`: **todas** las páginas lo dibujan (`view.lleva` → `view.vestir`, `packages/render/src/puestos.ts`): en el
  hueso de la mano derecha / encima de la cabeza del VRM, o junto a / encima de la cápsula. Cualquier modelo se escala a
  0,30 m en la mano (colgado por arriba) y 0,26 m en la cabeza (apoyado por la base). Se guarda por invitado
  (`l:<invitado>`): vuelve a ponérselo al entrar, en todas sus pestañas; al irse, desaparece de su avatar.
- **Inventario rápido.** Índice por dueño en el almacén: `d:<invitado>` (y `d:<invitado>~2`… de 100 en 100) lista las
  claves de sus bienes; entrar cuesta tus bienes, no los del mundo. Un mundo de antes del índice se indexa **una vez** al
  arrancar (`i` = versión del índice; el registro dice `índice por dueño: N bienes indexados (una vez)`).
- **Traer un recibo de otro mundo.** En la ficha, «Traer un recibo de otro mundo» (el `recibo-….json` descargado allí o
  el `nb1.…` pelado). La página lo comprueba (WebCrypto) y, si es de fuera, lo manda al servidor en trozos (intent
  `traer{parte, partes, t}`, 480 caracteres cada uno), que lo vuelve a comprobar y contesta con `traido{ok, nombre,
  mundo, confia, dado, motivo}`:
  - **Este mundo no confía en quien lo firmó** (lo normal): se ve como **«De otro mundo · no es tuyo aquí»** (lo recuerda
    ese navegador; «Olvidar» lo quita). No se da nada.
  - **Confía**: pasa a ser tuyo aquí también (`f:<24 hex de la huella del recibo>`, `ajeno: true`, sello «De otro
    mundo»); se ve y se lleva como cualquier bien. **Un recibo, una persona**: el primero que lo trae lo tiene; otro
    invitado con el mismo fichero recibe «ya lo trajo otra persona».
  - **La lista de confianza es un fichero del mundo**: `<aventura>/bienes/confianza.json`
    `{ "formato": "confianza@1", "emisores": [{ "emisor": "ed25519:<43>", "nombre": "…", "nota": "…" }] }`, **vacía por
    defecto** (`aventuras/ejemplo` la trae vacía). El `emisor` es la clave pública del otro mundo (la que dice su registro
    al arrancar o `POST /bienes/comprobar`). Se lee en cada `traer`: cambiarla no pide reiniciar.
  - `POST /bienes/comprobar` dice además `confiado` (si este mundo confía en su firmante). `npm run bienes` lista también
    los `f:` y comprueba su firma.
- **Modelo de ejemplo**: el Farolillo de Bruno ya tiene modelo (`activos/casa/farolillo.glb`, CC0, obra propia,
  `node tools/hacer-farolillo.mjs`, determinista; también en `features/objetos/biblioteca.json`).
- **e2e**: `node tools/e2e-piernas/bienes.mjs` (arranca su propio servidor y página en 8796/5178 con una copia del mundo
  de ejemplo que confía en un «Mundo Vecino»; PC y móvil 390×844 táctil; `SHOTS=<carpeta>` guarda fotos).

## Dardos (v1, con duelo en v2): una diana en la plaza, en tu móvil y en tu pared (AR)

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

## Dados (v1): los tira el servidor y todos ven lo mismo

`features/dados` es la tirada de una mesa de rol: **nadie decide un dado en su página**. Pides una tirada y el
servidor saca cada dado, la numera y da los mismos valores a todos los que están cerca.

- **Intención** `tirar {sitio, dados, oculta}`: `dados` es una expresión («2d6+1», «d20», «3d8-2»; de 1 a 10 dados de 2,
  3, 4, 6, 8, 10, 12, 20 o 100 caras, más o menos 0-99). `sitio` = la torre que tienes al lado (vacío = donde estás);
  vacía la expresión, la torre tira sus dados de siempre (o 1d20). `oculta` = una tirada tras la pantalla: los demás
  reciben que tiraste, sin valores.
- **Azar justo:** cada dado sale de `crypto.getRandomValues` (el azar del sistema) con muestreo de rechazo, para que
  2³² % caras no favorezca las caras bajas (`dado()`; el test cuenta 60.000 d6). Los tests pasan su propia fuente.
  Cada tirada lleva el número siguiente del mundo (`n`): «la tirada 41» es la misma para toda la mesa.
- **Evento** `tirada {quien, sitio, n, dados, valores, mod, total, oculta, texto}` a quien esté a `CERCA_M` (30 m):
  el anuncio la dice en palabras («Ana tira 2d6+1: 4 · 3 +1 = 8», «¡crítico!» y «pifia» en un d20) y la página pone
  la carta de dados (`apps/plaza/dados.ts`) y una etiqueta sobre la cabeza de quien tiró (se ve también en VR).
- **Torre de dados** = una cosa del mundo (estado con `at`, ficha e `interact`): «E: tirar los dados» a su lado, una
  fila de botones (d4 … d100, 2d6, «en secreto») y su última tirada a la vista (`ultima`) para quien llega después.
  Un mundo trae las suyas en `MUNDO_DIR/dados.json` (`{ "torres": [{ id, nombre, x, y, z, radio, dados }] }`); sin
  fichero no hay torre, y se tira igual donde estés.
- **Chat** (cualquier aparato con teclado, VR incluida): `/tirar 2d6+1`, `/tirar d20 oculta`; al lado de una torre,
  la tirada es de la torre.
- **Lo que no hace (todavía):** dados 3D que caen en la bandeja (la carta y la etiqueta los sustituyen), tiradas con
  ventaja o «quedarse con los mejores», y un diario de tiradas que viaje en el zip.

## Puertas, botones y cosas que se cogen (J4, v1): tres piezas del motor que decide el servidor

Tres módulos de juego, cada uno en su carpeta (`features/puertas`, `features/botones`, `features/cogibles`), por el
enchufe de siempre: **nadie decide nada en su página**; la página pide (`usar`, `pulsar`, `coger`, `soltar`) y el
servidor comprueba que estás a su alcance (`api.within`), cambia el estado compartido y avisa a quien está cerca
(`CERCA_M = 30`). Son **el mismo gesto en los tres aparatos**: en el ordenador «E: abrir Puerta norte», en el móvil el
botón de acción, en el visor el rayo y el gatillo; para un agente, `features.use(<función>, <clave>)`. Lo dibuja el
bloque de la casa (`features/objetos/biblioteca.json`, CC0) escalado: la hoja de la puerta, la tapa del botón sobre su
poste, la caja en el suelo.

- **Puertas** (`puertas@1`): estado por puerta (`nombre, x, y, z, ry, ancho, alto, radio, abierta, cierraEn, aviso`);
  intención `usar {puerta}` (abre si está cerrada, cierra si está abierta; 2/s, ráfaga 4); evento `cambio` (quién, cuál,
  cómo queda, frase; `quien = 0` si se cerró sola o la abrió un botón) y `rechazado`. `cierraEn` (0-120 s) la cierra sola:
  lo cuenta el servidor en ticks (`api.onTick`). La hoja gira 90° sobre su bisagra (`hoja()` en `client.ts`, pura).
- **Botones** (`botones@1`): estado por botón (`nombre, x, y, z, radio, pulsado, pulsaciones, puerta`); intención
  `pulsar {boton}`; evento `pulsado` (a los cercanos, cuenta `n`) y **`senal`** con alcance `"server"`: solo lo oyen
  las demás funciones del servidor (`api.listen("botones", "senal", …)`), nunca una página. Si `puerta` nombra una
  puerta, `features/puertas` la abre al oír la señal (y si ya estaba abierta, reinicia su cuenta de cierre). Un
  botón queda encendido un segundo (`LUZ_TICKS = 20`).
- **Cogibles** (`cogibles@1`): estado por cosa (`nombre, x, y, z, modelo, escala, radio, portador`); intenciones `coger
  {cosa}` y `soltar {cosa}` (vacío = lo que lleves); evento `cambio` (`que: cogida | soltada`). **Una cosa en la mano
  por persona** (`EN_MANOS_MAX = 1`); mientras alguien la lleva su `radio` es 0 (nadie ve «E: coger» en un suelo vacío)
  y su sitio (`at`) viaja con el portador. Todas las páginas la dibujan en la mano del portador con `view.lleva`
  (el mismo gancho que viste un bien) y la quitan del suelo. «Soltar» = `Q`, el botón de acción de la página, o
  `/soltar` en el chat; al salir del mundo se suelta sola donde estabas. No es una cosa de misión (`cosa@1`,
  `features/misiones`) ni un bien que sea tuyo (`features/bienes`): es una cosa del mundo que cualquiera lleva.
- **Un mundo trae las suyas** en `MUNDO_DIR/interacciones.json` (`numinia-engine/interacciones@1`):
  `{ "puertas": [{ id, nombre, x, y?, z, ry?, ancho?, alto?, radio?, cierraEn?, abierta? }], "botones": [{ id, nombre, x,
  y?, z, radio?, puerta? }], "cosas": [{ id, nombre, x, y?, z, modelo?, escala?, radio? }] }`; los ids son `[a-z0-9-]{1,16}`,
  `modelo` es el sha256 de un `.glb` que el servidor tenga activo (si no, la caja de la casa), y cada línea mal
  formada se deja fuera diciendo por qué en el registro. Sin fichero no hay ninguna, y el resto del motor no cambia
  (la huella de la simulación es la misma con y sin las tres; lo mide `test/interacciones.test.ts`). Un ejemplo
  mínimo: `{ "puertas": [{ "id": "norte", "nombre": "Puerta norte", "x": 6, "z": 0, "cierraEn": 10 }], "botones": [{ "id":
  "rojo", "nombre": "Botón rojo", "x": 12, "z": 0, "puerta": "norte" }], "cosas": [{ "id": "caja", "nombre": "Caja", "x": -6, "z": 0 }] }`.
- **Mantener pulsado (J4, v2):** `card.interact.hold` (segundos; opcional en `Interact`/`Reachable`,
  `packages/feature/src/index.ts`) hace que la página NO use la cosa al instante: E, el botón de acción (móvil) o el
  gatillo en VR deben mantenerse ese tiempo (un anillo de progreso —`--progreso` 0..1— crece en `#interactuar`,
  `apps/plaza/interactuar.ts`) antes de mandar el intent; soltar antes, o que el objetivo cambie, cancela sin mandar
  nada. `puertas`/`botones`/`cogibles` (su `coger`, no su `soltar`) ya lo llevan (`MANTENER_S` en cada `feature.ts`);
  el servidor no sabe nada de esto — solo decide CUÁNDO llega el intent, igual que siempre. En VR, el gatillo emite
  un evento de más al soltar (`gatillo_fin`, `packages/render/src/manos.ts`/`apps/plaza/xr.ts`) para poder cancelar
  un mantener a medias.
- **Lo que no hace (todavía):** paredes que paren a quien no abre la puerta (es dibujo, no colisión: J6), botones
  con otra acción que una puerta (la señal ya existe; que otra función la escuche es una línea), coger con la mano
  física en VR (hoy, rayo y gatillo como el resto; J10 lo hace para las cosas de misión), llevar más de una cosa, y
  un anillo de progreso propio en el panel de muñeca de VR (J13).
## Contadores (v1, D-044): temporizador y contador que todos ven

`features/contadores` es la pieza del reloj de la sala de escape, del marcador del equipo y del reloj del mundo:
**el servidor lleva el reloj**, publica el valor **una vez por segundo** (no a 20 Hz) y **solo a quien está en la zona**
(estado con `at`, radio `ALCANCE_M` 60 m, J9). La página nunca cuenta por su cuenta: enseña el último valor que le llegó.

- **Fichero del mundo** `MUNDO_DIR/contadores.json` (`numinia-engine/contadores@1`):
  `{ "contadores": [{ "id": "sala", "nombre": "Sala 1", "tipo": "cuenta_atras", "segundos": 900, "x": 0, "z": 0, "donde": "ambos", "evento": "sala-a-cero", "manda": "todos" }] }`.
  Tipos: `cuenta_atras` (`segundos`, 1 a 86.400), `contador` (`inicio` y `tope`; `tope` 0 = sin tope) y `reloj` (sube
  desde 0, un cronómetro del mundo). `donde` = `panel` (la página), `cartel` (texto en el mundo) o `ambos` (si falta);
  `manda` = `todos` (quien esté al alcance, `radio` 1-16 m, 4 si falta) o `dirige` (si falta: quien dirige, permiso
  «Gestionar rituales» STD-052, desde donde sea). Cada línea mal formada **se deja fuera con su motivo** en el log
  (`[mundo] contadores.json: contadores.contadores[3].tipo: … (esa línea no se usa)`); el resto se usa. Como mucho
  32 por mundo (`limits.json`).
- **Intenciones** (página, móvil, VR, agentes): `arranca {id}`, `para {id}`, `suma {id, cuanto}` (negativo resta; en una
  cuenta atrás da o quita segundos), `reinicia {id}` (vuelve a `inicio`, parado) y `pulsar {id}` (la tecla E al lado: una
  cuenta atrás o un reloj arranca/para; un marcador suma 1).
- **Eventos:** `llegada {id, nombre, tipo, valor, evento, texto}` cuando una cuenta atrás llega a cero o un marcador a su
  tope (se para y lo publica; suena `campana`, importancia 2). **Para el cable (D-041):** en el servidor,
  `api.listen("contadores", "llegada", (m) => m.evento === "sala-a-cero" && …)` — el nombre viaja en `evento`, y los
  oyentes del servidor lo oyen aunque el emit sea a la zona. `hito {id, nombre, texto}` dice en voz alta lo que un lector
  de pantalla debe oír (arranca, parado, «quedan 5 minutos / 1 minuto / 30 s / 10 s», el marcador cambió); el valor del
  panel NO es región viva (no se lee segundo a segundo). `rechazado {motivo}`.
- **Cartel 3D:** la vía más barata que ya había: el rótulo sprite sobre una cosa (`api.view.tag`, un canvas que solo se
  redibuja cuando cambia el texto: una vez por segundo en marcha, nunca parado), a 2,4 m del suelo del contador, con el
  nombre debajo. Se ve también en VR.
- **Panel HTML** (`apps/plaza/contadores.ts`, `#contadores-panel`): un grupo por contador (nombre, valor en `<output>`
  con `aria-live="off"`, estado) y los botones (44 px) solo cuando estás al alcance: Arrancar/Parar y Reiniciar, o +1 / −1
  / Reiniciar en un marcador.
- **Chat:** `/contador sala arranca|para|suma 3|resta 1|reinicia`, `/contadores` (la lista con sus valores).
- **Lo que no hace (todavía):** un contador por persona (hoy solo id y, con `variante: "equipo"`, por equipo), poner o quitar
  contadores desde dentro del mundo (hoy, solo el fichero), y el cable que conecte `llegada` con otra pieza (D-041, otro agente).
- **h3 (persist, variante equipo):** `state.persist: true` (S4) — el valor y si está en marcha sobreviven a un reinicio del
  servidor; al arrancar, un contador recupera lo guardado (no vuelve a `inicio`) y, si no hay nada guardado, usa el fichero.
  Un contador con `"variante": "equipo"` en el fichero deja de ser un solo valor: la orden lleva además `equipo` (1-16 letras
  minúsculas, cifras o guiones — un nombre libre, no una lista que el fichero tenga que declarar) y el servidor crea ese
  equipo la primera vez que se nombra, hasta `EQUIPOS_MAX` (8) equipos por contador; cada equipo vive bajo la clave
  `<id>:<equipo>` (estado, cartel y chat: `/contador marcador:rojo suma`). Sin `equipo` o con uno de más, se rechaza
  («Di el equipo…» / «ya tiene 8 equipos»).
## El cable (D-041, v1): disparadores que un mundo escribe en datos, sin código

La pieza `disparadores@1` (`features/disparadores`) es el cable del mundo: un constructor (o un agente que escribe JSON)
conecta «cuando pase esto, haz aquello» en `MUNDO_DIR/disparadores.json` (`numinia-engine/disparadores@1`) y **nadie
decide nada en su página**: el servidor vigila quién entra en cada zona (`api.onTick`, una distancia por persona y
disparador), comprueba el alcance de cada pulsación (`api.within`), cuenta el cooldown en ticks y el «un solo uso»,
avisa a los cercanos (`disparado`, `CERCA_M = 30`) y emite **una acción por receptor** como evento con alcance
`"server"` (`accion`): la función dueña de esa acción la oye con `api.listen("disparadores", "accion", …)` y devuelve
`true`. Hoy `features/objetos` hace `muestra` / `oculta` (pone `oculto` al objeto por id o por nombre exacto; la página no
dibuja un modelo oculto al jugar y sí al construir); `features/sonido` hace `suena` (S6: toca el fichero del catálogo
de la casa, no un pitido); `teletransporta`, `da_paso` y `abre_enlace` llegan en sus historias: mientras tanto el
registro dice `nadie hace «teletransporta» en este servidor` en vez de callar.

- **El fichero:** `{ "disparadores": [{ id, nombre, tipo: "zona" | "boton", x, y?, z, radio?, frase?, cooldown?, un_solo_uso?,
  receptores: [{ accion, … }] }] }`. `id` es `[a-z0-9-]{1,16}`; `radio` es el de la zona (0,5-64 m, 3 por defecto) o desde
  cuánto se pulsa el botón (1-16 m, 2); `frase` es lo que ve quien se acerca al botón («E: pulsar», en el ordenador,
  el móvil y el visor; por defecto `pulsar <nombre>`); `cooldown` 0-3600 s; `un_solo_uso` gasta el disparador para
  siempre (el botón deja de ofrecerse: su `alcance` pasa a 0). Receptores (hasta 8; una línea mala tira el disparador
  entero, y el registro dice cuál): `{ "accion": "muestra" | "oculta", "objeto": "<id o nombre>" }`,
  `{ "accion": "teletransporta", "x", "y"?, "z" }`, `{ "accion": "da_paso", "mision", "paso" }`, `{ "accion": "abre_enlace",
  "enlace": "https://…" }`, `{ "accion": "suena", "sonido" }`. Hasta 64 disparadores por mundo; sin fichero no hay ninguno y
  el motor no cambia (la huella de la simulación es la misma: `test/disparadores.test.ts`).
- **Estado por disparador:** `nombre, tipo, x, y, z, radio, alcance, frase, cooldown, unSoloUso, usos, enEspera, agotado`;
  intención `pulsar {disparador}` (2/s, ráfaga 4) y, para quien construye, `editarReceptores`, `crearDisparador` y `borrarDisparador` (más abajo); eventos `disparado` (cercanos), `senal` y `accion` (solo servidor) y
  `rechazado` («Acércate…», «Todavía no: … espera N s», «… ya se usó»). Una zona nunca regaña: si está en espera o
  gastada, entrar no hace nada; se dispara al **entrar** (una vez por entrada, por persona) y salir y volver a entrar
  vuelve a contar si el cooldown pasó.
- **Ejemplo mínimo (botón que enciende una farola oculta):** `{ "disparadores": [{ "id": "rojo", "nombre": "Botón rojo",
  "tipo": "boton", "x": 12, "z": 0, "frase": "E: pulsar", "cooldown": 5, "receptores": [{ "accion": "muestra", "objeto":
  "Farola" }] }] }` con un objeto llamado «Farola» marcado como invisible al jugar en el constructor.
- **Crear y borrar cables en vivo (historia A, «cable sin JSON»):** quien tiene permiso de construir ya no necesita
  tocar el fichero. En el panel Cable (cajón del constructor), **«+ Nuevo cable»** crea un botón en el sitio donde
  estás (id `cable-1`, `cable-2`…, frase «E: pulsar», con un receptor de partida `suena «campana»` que luego
  cambias) y cada cable tiene su **«Borrar»**, que pide confirmación en la propia fila («¿Borrar «X»? Sí, borrar /
  Cancelar»). Todo se puede hacer con teclado y los botones llevan `aria-label`. Detrás hay dos intenciones nuevas,
  limitadas igual que `editarReceptores` (1/s, ráfaga 3), solo con permiso de construir:
  - `crearDisparador {disparador, nombre, tipo, x, y, z, radio, frase, senal, cooldown, unSoloUso, receptores}` — la
    misma forma que una línea de `disparadores.json` (`receptores` viaja como JSON en texto, hasta 512 bytes; `radio`
    es el de la zona o el alcance del botón; `tipo` es `zona`, `boton` o `senal`). **El servidor la valida con el
    mismo lector que lee el fichero** (`leerDisparador`: nada se copia), así que vale exactamente lo que valdría
    escrito a mano, y añade los topes del mundo: **64 cables por mundo**, **8 receptores por cable**, id
    `[a-z0-9-]{1,16}` y **único**. Si lo acepta, el cable aparece para todos al momento (zonas, botones y señales
    funcionan igual que los del fichero), avisa a quien lo creó (`creado`) y **reescribe `disparadores.json` sin
    reiniciar**.
  - `borrarDisparador {disparador}` — quita el cable del estado y de la vigilancia de zonas y señales (también si
    venía del fichero), avisa (`borrado`) y reescribe el fichero. Un id que no existe se rechaza diciendo cuál.
  - Los rechazos (`rechazado`) dicen cómo arreglarlo: «No puedes construir aquí…», «Ya hay un cable «x»: elige otro
    id o bórralo antes», «Este mundo ya tiene 64 cables… borra alguno antes», «receptores: un cable lleva como mucho
    8; quita alguno», «id «…»: usa minúsculas, cifras y guiones (hasta 16)». Nada de esto corre en el tick: crear o
    borrar solo toca una tabla, y un mundo sin cables sigue dando la misma huella de simulación.
  - Pieza reutilizable (R-1): cualquier mundo que cargue `disparadores` lo trae; la página no decide nada, solo
    manda la petición y pinta el estado que el servidor deja. En código: `disparadores.crearDisparador(…)` y
    `disparadores.borrarDisparador(id)` en `features/disparadores/client.ts`.
- **El cable dicho como frase (historia B, «cable sin JSON»):** el panel Cable enseña cada cable como una frase
  («Cuando alguien pulse “Botón rojo”, muestra “Farola”. Espera 5 s.») y deja el JSON dentro de un desplegable
  **«Ver datos»** (con el área de texto y «Guardar» de siempre). La frase la hace una función **pura**,
  `fraseDeCable(disparador, idioma)` en `features/disparadores/cable-frase.ts`: sin DOM, sin reloj, nunca tira (lo
  que no entiende sale como una frase segura) y cubre los 3 «cuando» (`boton`, `zona`, `senal`), las 8 acciones, varios
  receptores, el cooldown y el «un solo uso». Como no depende de la página, la misma función sirve al servidor y a
  los agentes (la historia D la usará para enseñar la frase antes de confirmar). **Ninguna palabra sale del código:**
  los textos viven en un fichero por idioma, `cable-frases.es.ts` y `cable-frases.en.ts`, con parámetros `{nombre}`,
  `{objeto}`, `{segundos}`… y las reglas de unir varios receptores (`lista.dos`, `lista.sep`, `lista.ultimo`; en
  inglés lleva la coma final). **Añadir un idioma:** copia `cable-frases.es.ts`, traduce los valores (mismas claves,
  mismos `{parámetros}`), regístralo en `FRASES` e `IDIOMAS` de `cable-frase.ts`; `test/cable-frases.test.ts`
  falla si falta una clave o cambia un parámetro. El idioma de la página es el `lang` del documento (`es` si no hay
  o no existe). Hoy hay `es` y `en`; **`ja`, `ko` y `pt-br` están pendientes** y caen en español.
- **La frase es el editor (historia C, «cable sin JSON»):** en el panel Cable, cada hueco de la frase es un control:
  «Cuando [alguien pulse el botón ▾] [nombre], [muestra ▾] [Farola ▾]. Espera [5 s ▾]. ☐ Solo funciona una vez».
  Solo se puede **elegir lo válido**: el tipo (3), la acción (8), el objeto de la lista real del mundo (o el
  movedor, para «mueve»), la misión, el sonido del catálogo, la espera (0, 1, 2, 5, 10, 30, 60, 300 s y, si el cable
  trae otra, también esa). Texto libre solo donde no hay otra forma: el nombre, el nombre de la señal, el enlace
  (https) y las coordenadas (con «Mi posición»). Hasta 8 acciones («+ Otra acción», «✕» para quitar). **La página no
  tiene reglas:** las opciones y las partes de la frase las da una función **pura**,
  `huecosDeCable(cable, idioma, contexto)` en `features/disparadores/cable-huecos.ts` (la frase como lista de textos y
  huecos; los textos salen de `cable-frases.es.ts`/`.en.ts`, claves `editor.*`, `opcion.*`, `boton.*`), y la lista
  del mundo la reúne `contextoDelCable(…)` (`cable-contexto.ts`, también pura). «Guardar cambios» manda UNA petición,
  **`disparadores.editarDisparador({ id, nombre, tipo, senal, cooldown, unSoloUso, receptores, mover? })`**: mismo
  permiso de construir y mismo límite de ritmo que `editarReceptores`; el servidor valida la línea entera con el
  mismo lector de `disparadores.json` (8 receptores, 512 bytes, nombre ≤ 60 bytes), conserva el id y el contador de
  usos, reescribe el fichero y responde a quien edita; si rechaza, el motivo, en español, sale junto al control
  (`aria-invalid` y `role=alert`). `mover` solo hace falta al pasar de «señal» a botón o zona (el cable aún no tiene
  sitio). **«+ Nuevo cable»** abre los mismos huecos con valores de partida y no existe hasta pulsar «Crear cable».
  Accesibilidad: cada control tiene `aria-label`; la frase entera es un `role=group` con su texto completo como
  `aria-label` (se lee en orden); todo es nativo (Tab, flechas, Espacio); blancos táctiles de 44 px (ya con el
  «Tamaño de la interfaz»); a 360 px la frase baja de línea sin desbordar. «Ver datos» sigue como estaba.
  La historia D reutilizará este mismo `editarDisparador` y su validación.
- **«Decírselo al mundo» (historia D, «cable sin JSON»):** en el panel Cable, quien puede construir escribe una frase
  («que al entrar en el círculo suene la campana», hasta 300 caracteres), pulsa **Decirlo** y la página enseña lo que
  entendió, ya escrito como frase, con **Aplicar** / **Cancelar**. Hasta pulsar Aplicar **no cambia nada**.
  - **Quién llama al modelo:** el **servidor**, nunca la página. `decirCable {texto, idioma}` pide a la IA del mundo
    que rellene **una herramienta cerrada** (`proponer_cable`, `features/disparadores/cable-decir.ts`): los 3 tipos,
    las 8 acciones y, en los huecos de nombre, **solo** los objetos, movedores, misiones y sonidos que ese mundo tiene
    de verdad (la herramienta se arma con sus listas y la API obliga al modelo a llamarla: `tool_choice`). Las reglas
    van en el turno de sistema, fijas y sin datos del mundo; la frase del usuario y las listas van en el turno de usuario,
    dentro de bloques de datos (`<material>`, `<frase>`), con `<` y `>` quitados para que nada cierre el bloque. Lo que
    devuelve el modelo es **solo un dato**: pasa por el mismo lector que `disparadores.json` (`leerDisparador`: 8
    receptores, tamaño, https, id…), por una comprobación de que cada nombre existe en el mundo, y nunca se ejecuta.
    Si algo no cuadra, la persona recibe el motivo en español (`decirRechazado`) y no se aplica nada.
  - **Dos pasos:** `decirCable` solo devuelve una **propuesta** (`cablePropuesto`: número y frase, calculada en el
    servidor con `fraseDeCable` en el idioma de quien la pidió). `confirmarCable {propuesta}` la aplica, **solo la
    misma persona, en 2 minutos** y con permiso de construir, volviendo a validar todo (el mundo pudo cambiar: un
    objeto borrado, el tope de 64) y reescribiendo `disparadores.json`. La propuesta vive en la memoria del servidor.
    Un cable de tipo botón o zona se pone **donde está quien lo pidió**, igual que «+ Nuevo cable».
  - **Topes** (como los Topes del cerebro de los habitantes): 3 peticiones por minuto y persona, `CABLE_DIA_MAX` por día
    UTC y mundo (100; `CABLE_MINUTO` cambia lo de por persona), una petición a la vez por persona y 4 en vuelo, 20 s
    de espera al modelo. Si el modelo falla, durante 1 minuto se dice «La IA no contesta ahora mismo» sin repetir
    lo que contestó el proveedor (puede repetir lo enviado; solo va al registro del servidor, 120 caracteres).
  - **Dónde vive la clave:** donde ya vive la del cerebro de los habitantes, **no hay un segundo sitio**: `CEREBRO_CLAVE`
    (o `ANTHROPIC_API_KEY`) y `CEREBRO_MODELO` en el entorno del servidor, leídos solo en `packages/server/src/cable-ia.ts`
    y usados con `cerebroClaude` de `packages/agent/src/cerebro.ts`. La clave nunca sale de ahí: ningún mensaje, estado,
    registro ni error la lleva, y la página no la ve (test con la clave puesta y búsqueda en todo lo que ven las páginas).
    **Ojo con la instalación:** `instalar-motor.sh --clave-ia` guarda la clave en `cerebro.env`, que **solo carga el
    servicio de los habitantes** (su usuario y su cortafuegos, que solo sale a Anthropic). El servicio del servidor
    no la carga, así que **en una instalación así «Decirlo» queda apagado hasta que el dueño decida** darle la clave
    al servidor (`EnvironmentFile=-…/cerebro.env` en su unidad y salida a Anthropic). No se hizo solo: es dinero y
    cambia lo que la casa exige.
  - **Sin IA no hay caja muerta:** el estado `puedeDecir {puede, motivo}` (solo para quien construye) dice si se puede
    y, si no, por qué en español («Este mundo no tiene una IA conectada. Pide al dueño que la añada.», «Hoy este mundo
    ya ha usado sus 100 peticiones…», «La IA no contesta ahora mismo…»). La página **oculta el cuadro y enseña el
    motivo** en su lugar. En pruebas el modelo es una función inyectable (`crearDisparadores({ decir: { pensar } })`);
    el servidor de pruebas e2e usa el cerebro eco con `CEREBRO_ECO=1` y `CABLE_ECO_RESPUESTAS=<fichero.json>`
    (`{"<frase>": <entrada de proponer_cable>}`): solo existe si se arranca así, ninguna ruta de producción lo activa.
  - **No toca la simulación:** la llamada es asíncrona y fuera del tick; la huella no cambia. Pieza reutilizable
    (R-1): cualquier mundo que cargue `disparadores` y le enchufe un `pensar` lo tiene. Textos en `cable-frases.es.ts` y
    `cable-frases.en.ts` (claves `decir.*`); `ja`, `ko` y `pt-br` siguen pendientes. En código: `disparadores.decir.pedir(texto)`,
    `.confirmar(propuesta)`, `.estado`, `.alResponder(fn)`; página: `apps/plaza/cable-decir.ts`. Leg e2e: `tools/e2e-piernas/cable-decir.mjs`.
- **Lo que no hace (todavía):** mover un cable ya creado a otro sitio desde la página
  (`editarDisparador` ya lo admite con `mover`, la página solo lo usa al salir de «señal»). La vista del constructor (`apps/plaza/cable.ts`) lista cada disparador, deja «Probar» un botón y edita
  en vivo sus receptores (`editarReceptores`: el servidor valida cada receptor igual que al leer el fichero y, si
  acepta, reescribe `disparadores.json`; el campo `receptores` del estado viaja a toda página, como el resto de la
  ficha; no es un secreto como el código de una cerradura). Sin servidor con escritor de ficheros el cambio vale
  hasta reiniciar y el registro lo dice.

## Sonido (S6): el catálogo de la casa, con ficheros de verdad y su texto

La pieza `sonido@1` (`features/sonido`) es el catálogo de sonidos del motor: **27 ids, 89 variantes, 178 ficheros**
(`.opus` + respaldo `.m4a`), **todo CC0 1.0** (Kenney y OpenGameArt), en `activos/sonidos/`. Antes de S6 los siete
avisos de la casa eran osciladores: pitidos sintetizados. Ahora son sonidos.

- **El servidor manda** (R-1 y D-041): nadie elige un sonido en su página. El servidor dice **qué id**, **dónde** y
  con **qué semilla**; cada página calcula con esa semilla la misma variante y la misma pizca de tono y volumen
  (`azarDe(semilla, id)`, xorshift32 con mezclador de murmur3, en `packages/render/src/audio/voces.ts`). Dos personas
  en el mismo sitio oyen **el mismo golpe de madera**, no dos distintos.
- **Cómo lo pide un mundo:** el receptor `suena` del cable (`{ "accion": "suena", "sonido": "golpe-madera" }`). Vale el
  id del catálogo o el nombre del aviso de la casa (`campana`, `exito`, `error`, `aviso`, `suave`, `paso`, `magia`,
  `completada`), que el motor traduce a su id. Un nombre que no está **no rompe nada**: el registro lo dice y el
  mundo sigue.
- **Cómo lo pide otra función del motor:** `crearSonido({ alArrancar: (suena) => … })` te da `suena(id, { donde, quien,
  volumen })`; `donde: null` = en la cabeza (sin panner), `donde: {x,y,z}` = en el mundo, y solo lo oye quien esté a
  `OYE_M`.
- **Accesibilidad (XAUR, WCAG 2.2):** cada sonido del catálogo trae su **texto** y viaja en el evento; la página lo
  lleva a la región de avisos (`anunciar`). Ningún sonido sin texto, y el aviso de la casa no se solapa con el
  fichero (`announce: "silent"`: el sonido del evento *es* el fichero).
- **El peso:** ni un `.opus` entra en el paquete de arranque. La página pide **una** tabla (`GET /sonidos.json`, media
  hora de caché, ~9 kB) con id → variantes por su sha256, bus, prioridad, cooldown y texto; los ficheros se piden
  luego a `/a/<sha256>.opus` (un año, inmutable), y solo los que hagan falta.
- **Si falta un fichero:** al arrancar, la pieza compara el catálogo con lo que hay en disco (ids repetidos, sha256
  que no cuadra, fichero que no está) y **avisa en el registro sin tirar el motor**; quien entra recibe `faltan`.
- **Rehacer el catálogo:** `node tools/sonidos-catalogo.ts --biblioteca <carpeta>` copia los lotes `nucleo` y
  `funcion` de la biblioteca verificada, recalcula el sha256 de cada fichero y reescribe `features/sonido/catalogo.json`
  y `activos/sonidos/LICENCIAS.md`. Es idempotente: si nada cambió, no toca nada.
## Salón de los Ancestros y el tributo a Asimov (ancestros v1)

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

## Agua (N2): estilizada, de color plano, un solo draw call

`packages/render/src/agua-estilo.ts` es el agua de todo el motor: el elemento `agua` (estanques, fuentes, los mares de las
plantillas) y el estanque de la pesca. Material de nodos TSL (vale en WebGPU y en WebGL2), **sin textura, sin render-target
y sin pasada extra de escena**: un draw call por agua en todos los niveles; lo que cuesta es ALU por píxel. Iluminada por la
escena (Lambert), así que de noche se oscurece sola.

- **Siempre** (también en D): bandas planas de color (orilla turquesa · el color del constructor · hondo), espuma de orilla
  blanca y fresnel escalonado hacia el color del horizonte (`entorno.aguaLuz.cielo`: el de la niebla o el del cielo).
- **Por nivel** (`calidad.ts` → `DETALLE_AGUA`, `detalleAgua(nivel, agua)`):

| Nivel | olas (celdas máx.) | espuma viva | líneas de luz | cáusticas | destellos |
|---|---|---|---|---|---|
| A sencilla / con destellos | 48 / 96 | sí | sí | sí | no / sí |
| B (Quest en XR) | 32 | sí | sí | no | no |
| C (móvil) | 24 | sí | sí | no | no |
| D (móvil viejo) | 0 (un quad) | no | no | no | no |

- Las **olas** son de vértice (baratas: vértices, no píxeles), solo en agua de ≥ `OLAS_DESDE_M` (12 m) de lado corto, se
  apagan hacia la orilla para que el borde no se mueva y solo suben (nunca se hunden bajo el suelo).
- La opción «Agua» del menú: «Sencilla» / «Con destellos»; ya no hay `WaterMesh` reflectante (`view.elementos.contar().reflejos`
  queda en 0; `aguaDetalle` dice qué dibuja el agua en este nivel).
- Pruebas: `test/agua.test.ts`.

## Naturaleza (N4): relieve, árboles y hierba que enciende un fichero

`features/naturaleza` es la pieza más corta de copiar para «el servidor solo guarda y manda un fichero del mundo; la página construye»:
`MUNDO_DIR/naturaleza.json` (`numinia-engine/naturaleza@1`: `activa`, `semilla`, `tamano`, `plaza`, `densidad: { arboles, hierba }`,
`estanque`, `paleta`; todo opcional, claves de más rechazadas con cómo arreglarlas) → `features/mundo.ts` lo valida (si está mal, lo dice en
el log y el mundo sigue plano) → la página llama a `view.naturaleza.aplicar(datos)`. Sin el fichero no cambia nada. Detalle, números y
la advertencia de que aún no hay colisión con el terreno (N5): `docs/NATURALEZA.md` sección N4.

## Fauna (F1): quién hay en el mundo, sin red y sin reloj

Para repartir bichos (o cualquier cosa «viva» que salga y se vaya) sin mandar ni un mensaje, copia `packages/relieve/src/fauna.ts`: una **tabla**
de razas con `rareza` y `peso` (como `features/pesca/peces.json`, más una `epica`) y una función pura
`habitantes(semilla, celda, ventana, tabla, ctx)` que dice quién vive en una celda de 32 m durante 120 s del reloj del mundo; servidor y páginas
dan el mismo resultado. La tabla de la casa es `features/naturaleza/fauna.json` (36 razas: mariposas, luciérnagas por color, pájaros, todos
electrónicos); un mundo trae el suyo con `fauna.json` y lo enciende o recorta con `naturaleza.json` → `fauna: { activa, densidad, especies }`.
`probabilidad()` y `pVerRareza()` dan la tabla de probabilidades para documentos y diarios. Detalle, números y objetivo de rareza: `docs/NATURALEZA.md` sección F1.

## Enrutador de capas (U2, H1: la pieza, aún sin enchufar)

`apps/plaza/capas.ts` es la pieza que decidirá quién es dueño de Esc, «atrás», B y Start: cada cosa que se puede cerrar registra una capa (`registrar({ id, rango, abierta, cerrar })`, o `vigilar(dialog)` para un `<dialog>` nativo) y el enrutador cierra la de arriba (cambiar tecla › escribir › panel › modo › menú); sin capas abiertas llama a `alVaciarse`, que es donde se abrirá el menú. Hoy **no está conectada a ningún módulo** (nadie llama a `montarCapas()`, así que no cambia el comportamiento de Esc); migrar las escuchas de teclado y los dueños de Esc actuales es la historia siguiente. Pruebas: `test/capas.test.ts`.

## Lucha (v1, L1): criaturas con coherencia y un golpe que decide el servidor

`features/lucha` es el ejemplo de **cosa del mundo que se golpea**. Una criatura es una entrada de estado con `at` y ficha
`criatura` (`interact: { intent: "golpear", prompt: "golpear a {nombre}", radius: "radio" }`): «E: golpear a Guardián de
Crisálida» al acercarte. Diseño completo (combate y bestiario de 12): `mmo-browser-study/SISTEMA-DE-LUCHA-Y-BESTIARIO.md`.
- **Caja sólida sin tocar la simulación**: el valor lleva `solido: true` y `bx0 by0 bz0 bx1 by1 bz1` (m), igual que
  `objetos`; la instancia y la página rehacen las cajas solas (`solidsFrom`). Al disolverse, `solido: false` y se atraviesa.
- **Coherencia, no vida**: en Numinia las criaturas se disuelven, no mueren. `coherencia`/`coherenciaMax` vienen de la
  ficha (`bestiario.ts`: nombre, caja, radio, color y la cita del canon). A 0: `modo: "disuelta"`, evento `disuelta`, y
  `vuelve` entera a los `REAPARICION_S` (20 s; `reaparicion: 0` en el mundo = nunca).
- **El golpe** (`feature.ts`): `golpear { objetivo }` → `api.within` (radio + margen J4; si no, `aire` solo a ti) →
  enfriamiento por jugador como «tick desde el que puede» (`ENFRIAMIENTO_TICKS` 12 = 0,6 s; el segundo golpe se traga sin
  evento) → daño `DANO_BASE + rngNext % DANO_VAR` (3-5) con el PRNG del motor mezclando el tick (misma semilla, mismos
  golpes) → `golpe { objetivo, de, dano, queda }` a 40 m. Nada de trabajo cuando nada cambia: `onTick` solo mira la lista
  de disueltas pendientes.
- **La página** (`client.ts`) dibuja la criatura con el bloque de la casa escalado a su caja y pintado del color de la
  ficha (`view.place("lucha:<clave>")`), el nombre encima (`view.tag`), flash blanco 80 ms y «−N» 700 ms al golpe; el
  tinte va a gris con la coherencia. Sin partículas, sin 3D nuevo.
- **Un mundo** trae sus criaturas en `MUNDO_DIR/lucha.json` (`{ "criaturas": [{ id, especie, x, y, z, nombre?,
  reaparicion? }] }`, `features/mundo.ts`); sin fichero, el Guardián de la casa en (24, 10). Especie desconocida = se
  avisa y no se pone.
- **PVE por defecto**: el objetivo es una criatura salvo que el mundo active el PVP en su `entorno.json` (`pvp` / `zonasPvp`, arriba; objetivo `p:<entidad>`); que la criatura se mueva es fila L2-L8.

## Condiciones de entrada (condiciones/c1-c2): las normas del mundo y la puerta del servidor

Un mundo dice qué hay que aceptar para entrar en `aventura/condiciones.json` (formato `condiciones@1`; sin fichero, el
ejemplo de la casa; fichero roto = una línea en el registro con la ruta del fallo y el ejemplo de la casa).

```json
{ "formato": "condiciones@1", "puerta": true,
  "capas": [
    { "capa": "casa", "version": "2026-10", "puntos": [
      { "id": "uso",     "titulo": "Normas de uso", "texto": "…", "obligatorio": true,  "tipo": "norma" },
      { "id": "informe", "titulo": "Informe anónimo de rendimiento", "texto": "…", "obligatorio": false, "tipo": "datos" } ] },
    { "capa": "comunidad", "version": "A", "puntos": [ … ] } ] }
```

- **Capas**: `casa` (la plataforma) y `comunidad` (la organización), cada una con su `version`. Aceptar una capa es aceptar
  esa versión; si el texto cambia y subes la versión, todos vuelven a tener que aceptarla.
- **`tipo`** (por punto, opcional, por defecto `"norma"`): `norma` = una condición del servicio, y si es `obligatorio` cierra
  la puerta hasta que se acepta; `datos` = un permiso sobre datos (informe de sesión, IA que escucha, avisos…) que
  **nunca** puede ser obligatorio (EDPB 05/2020 §39, RGPD 7.4): `obligatorio: true` con `tipo: "datos"` es un error del
  validador y el mensaje dice cómo arreglarlo (`"obligatorio": false`, o `"tipo": "norma"` si en realidad es una norma).
  Rechazar un punto de datos no bloquea nunca.
- **`nombre`** (por capa, opcional, 1–60 caracteres, c3): cómo llama la burbuja a esa capa en sus pasos («Numen Games»); sin él dice «La casa» / «La comunidad». El motor no lleva marca: los nombres salen de este fichero.
- **`puerta`** (opcional, `true`/`false`): pide encender la puerta del servidor para este mundo.

### Interruptores de funciones del mundo (f1: `features/funciones`, `funciones.json`)

Regla R-1: cada pieza del motor se enciende sin tocar código. El mundo guarda un interruptor por pieza en `entorno/funciones.json`
(formato `numinia-engine/funciones@1`, todo opcional; una clave que no está no dice nada y el mundo sigue como hoy):

```json
{ "schema": "numinia-engine/funciones@1", "normas": false, "dardos": true, "pesca": true }
```

- **`normas`**: la puerta de condiciones de entrada. **Orden de prioridad** (la primera que existe manda): la opción
  `condicionesPuerta` de `startServer` y la variable `MOTOR_CONDICIONES_PUERTA` (si|no) → `normas` de `funciones.json` →
  `"puerta"` de `aventura/condiciones.json` → apagada. Si manda el entorno, el estado sale con `fija: true` y el interruptor se niega.
  El interruptor solo existe si el mundo tiene condiciones (su `condiciones.json`, una fuente de la comunidad o la puerta forzada desde fuera).
  **Apagarla** deja entrar a quien estaba leyendo (su burbuja se va para todos); **encenderla** solo afecta a quien llegue después: nadie
  que ya esté dentro sale.
- **`dardos`, `pesca`** (f2: obedecen): por defecto encendidas, como hoy. Apagadas, **el servidor** rechaza toda acción de la pieza
  (dardos: `jugar`, `lanzar`, `cambiar`, `empezar`; pesca: `lanzar`, `recoger`, `soltar`) con «Los dardos están apagados en este mundo» /
  «La pesca está apagada en este mundo», y **cierra lo que estaba en marcha** al apagar: una tirada suelta termina (lo lanzado ya cuenta en
  el marcador, como al alejarse); un duelo, en marcha o esperando, se cancela para todos sin ganador (`finduelo` con `empate` y el texto
  «…partida cancelada»); quien pescaba pierde el flotador con `escape { motivo: "apagada" }` (sin captura, sin `otorga`, el sitio queda libre).
  **La página** no dibuja diana, estanque, flotador, pez en mano ni «E: tirar dardos / E: pescar» (los controladores devuelven `sitios()`
  vacío y `ofrece()` falso; el chunk de la pieza ni se carga) y reaparece al volver a encender, sin recargar. Lógica pura:
  `encendida(estado)` y `verSi(cosas, estado)` en `features/funciones/feature.ts`; la página lee el interruptor de otra pieza con
  `api.estadoDe("funciones")` (solo lectura, como en el servidor). Una pieza que se enciende sin código: un mundo cuyo único cambio es
  `"dardos": true` ya los tiene. Pruebas: `test/funciones-obedecen.test.ts`.
- **Quién**: quien puede construir (`api.puede(e, "construir")`, igual que el interruptor «Espacio base»). El servidor reescribe solo la
  clave pedida (las demás se quedan; sin fichero lo crea con `{ schema, <función> }`), lo valida y lo escribe de forma atómica; un fichero
  mal escrito no se sobrescribe nunca (el log y el rechazo dicen cómo arreglarlo). Sin carpeta de mundo, el cambio vale hasta reiniciar.
- **Desde la administración de numinia.com (e1: la puerta HTTP `/funciones`)**: el panel cambia los mismos interruptores sin entrar al mundo.
  `GET /funciones` → `{ "funciones": [{ "id": "normas"|"dardos"|"pesca", "activa": bool, "fija": bool }] }` (solo las que el mundo tiene:
  sin condiciones de entrada no sale `normas`); `POST /funciones` con `{ "funcion": "normas", "activa": true }` → `200 { ok, funcion, funciones }`
  (`puerta` vale como otro nombre de `normas`). Mismo pase que `/habitantes` y `/agentes` (`Authorization: Bearer <pase>`, `aud` = este mundo,
  permiso `manage-organization` o dueño): sin pase configurado `404` (cerrada), sin pase `401`, sin permiso `403`; CORS solo `https://numinia.com`,
  nunca `*`; cuerpo máximo 1 KiB (`413`). `400` función desconocida o cuerpo que no es `{ funcion: texto, activa: booleano }`; `404` el mundo no
  tiene esa función; `409` la fija el servidor (`fija: true`, «Lo fija el servidor») o `funciones.json` está mal escrito (no se toca);
  `500` no se pudo escribir. **Un solo camino**: `cambiar` de `features/funciones/server.ts`, el mismo que el verbo `poner` (sale por el enlace
  `EnlaceFunciones.cambiar`, `packages/feature/src/enlace-funciones.ts`): reescribe la clave, escribe atómico, aplica en vivo y avisa a todas las
  páginas conectadas; encender las normas solo pide aceptar a quien llegue después. El log dice quién: `el pase p_… enciende normas desde el panel`.
  Código `packages/server/src/funciones-http.ts`; pruebas `test/funciones-http.test.ts`. Un motor sin esta puerta contesta `404` en `/funciones`.
- **En la página**: estado compartido `normas` / `dardos` / `pesca`, cada uno `{ activa, fija }` (una función que el mundo no tiene no
  aparece); `__numinia.funciones.actual()` → `{ normas?, dardos?, pesca? }`, `.fija(nombre)` y `.ponerFuncion(nombre, si)`. Para un agente:
  el verbo `poner { funcion, activa }` de la pieza `funciones`. El panel que los pinta es f3 (abajo).
- **El panel (f3)**: en el cajón «Entorno» del constructor (PC y móvil), debajo de «Espacio base», el bloque «Funciones de este mundo» con un
  interruptor por función que el mundo tiene (`actual()`): «Normas de entrada» (con la ayuda «Apagadas, se entra sin aceptar normas. Para demos.»),
  «Dardos» y «Pesca». Mismo componente y estilo que «Espacio base»; muestra el estado del servidor, nunca el del clic; si la función es `fija`
  sale desactivada con «Lo fija el servidor.»; quien no puede construir no ve el bloque. Lógica pura (filas, textos es/en, si se puede
  pulsar) en `features/funciones/panel.ts` (+ `frases.es.ts`, `frases.en.ts`, mismas claves; ja, ko y pt-br pendientes); la página
  (`apps/plaza/entorno.ts`) solo las dibuja. Pruebas: `test/funciones-panel.test.ts`; navegador: `tools/e2e-piernas/funciones-interruptores.mjs`.
- **En el menú de VR (v3)**: «Ajustes» del menú de la muñeca acaba con «Este mundo»: una fila de título y una fila por función (las mismas, en el
  mismo orden y con los mismos textos que el bloque de PC, sacadas de `panel.ts`), con un botón que dice el estado del servidor («Encendida» /
  «Apagada») y pide lo contrario al pulsarlo con el rayo + gatillo. Si la función es `fija` el botón sale apagado y debajo va «Lo fija el
  servidor.»; quien no construye no ve el bloque. Filas en `features/funciones/menu-vr.ts` (puro); las dibuja `apps/plaza/xr-menu.ts`.
  Pruebas: `test/funciones-menu-vr.test.ts`; navegador (IWER): `tools/e2e-piernas/funciones-menu-vr.mjs` (apaga Dardos desde el menú VR y la diana desaparece).
- Pruebas: `test/funciones-interruptores.test.ts` (f1), `test/funciones-obedecen.test.ts` (f2), `test/funciones-panel.test.ts` (f3).

### Las normas de la comunidad llegan solas al mundo (w4: `packages/server/src/condiciones-fuente.ts`)

Cuando una comunidad publica una versión de sus normas en numinia.com (Ajustes → «Normas de vuestros espacios»), sus mundos la usan sin que
nadie copie nada a mano, y **cada mundo guarda su copia en su carpeta**: si numinia.com está caída, el mundo sigue con la última que bajó
(file over app). El motor **tira** (pull); numinia.com no necesita saber dónde vive el mundo ni tener llave para escribir en él.

Un autor lo activa con una línea en el `aventura/condiciones.json` del mundo (la dirección está en la página pública de normas de su
comunidad: `/es/communities/<id>/normas/`):

```json
{ "formato": "condiciones@1", "puerta": true,
  "comunidad": { "fuente": "https://numinia.com/api/community-terms?comunidad=numen-games" },
  "capas": [ { "capa": "casa", "version": "2026-10", "puntos": [ … ] } ] }
```

- **Qué hace**: al arrancar y luego cada 15 minutos (`MOTOR_CONDICIONES_FUENTE_MIN`, nunca menos de 5: numinia.com guarda la respuesta 5
  minutos) descarga ese JSON (`community-terms-public@1`), valida la capa con el mismo lector de C1 (un punto `datos` obligatorio se
  rechaza aquí también) y, si es válida y distinta, la escribe en **`aventura/condiciones-comunidad.json`** y la pone encima de la capa de
  la casa. La capa `casa` sigue saliendo de `condiciones.json` (o del ejemplo); la `comunidad` descargada sustituye a la que el autor
  hubiera escrito a mano.
- **A quién le toca**: la oferta cambia para **quien llega después**; quien ya está dentro sigue dentro (la conexión admitida no se
  vuelve a cerrar) y quien está dentro de la burbuja recibe el texto nuevo y la burbuja empieza de nuevo con él. Como la versión de la
  capa cambia, quien aceptó la anterior tiene que aceptar la nueva (c6 enseñará solo lo que cambió).
- **Si falla algo** (red caída, HTTP ≠ 200, JSON roto, respuesta de otra comunidad, publicación más vieja que la copia, más de 256 KB,
  más de 8 s): una línea `[condiciones] …` en el registro y sigue lo que había (la copia; sin copia, la casa y lo que el fichero lleve
  a mano). Nunca impide arrancar. Con copia el servidor arranca sin esperar; **sin copia espera hasta 5 s la primera respuesta** para que
  el primero en llegar ya vea las normas de su comunidad. Una copia de otra fuente (otra comunidad) no se usa.
- **Seguridad**: solo `https` (`http` únicamente en `localhost`/`127.0.0.1`, para pruebas); sin usuario ni contraseña en la dirección;
  sin dependencias nuevas (`fetch` de Node); tope de tamaño y de tiempo.
- **El operador manda**: `MOTOR_CONDICIONES_FUENTE=<url>` (o la opción `condicionesFuente`) sustituye a la del fichero; `=no` la apaga.
- **La copia** (`condiciones-comunidad@1`) se lee, se compara y se guarda en git como cualquier fichero del mundo:
  `{ "formato": "condiciones-comunidad@1", "fuente": "<url>", "descargadoEn": "<UTC>", "publicadoEn": "<UTC>", "capa": { "capa": "comunidad", "version": "…", "puntos": [ … ] } }`.
  Se puede borrar sin miedo (se vuelve a bajar); solo se usa mientras el mundo tenga esa misma `fuente`.
- **Probarlo en local**: un servidor HTTP cualquiera que sirva ese JSON en `http://127.0.0.1:<puerto>/…` sirve de numinia.com
  (`test/condiciones-fuente.test.ts` lo hace: nueva versión → nueva oferta; red caída → copia; JSON inválido → casa/copia).

### El pase dice lo que ya aceptaste en numinia.com (w5: `pase.ts`, `condiciones-puerta.ts`)

Quien ya aceptó las condiciones de numinia.com al iniciar sesión no tiene por qué leerlas otra vez al entrar a un mundo suyo. El pase
firmado con el que entra (`#pass=…`, el de «Entrar») puede llevar un campo más, **`acepto`**: `{ "acepto": { "casa": "terms@1.0.1+privacy@2.1.0" } }`
(la versión exacta de los textos que la web le hizo aceptar; el motor ignora las claves que no conoce, hoy `casa` y `comunidad`).

**Cómo lo declara quien hace el mundo**: en la capa `casa` de `condiciones.json`, `"versionWeb": "<esa misma cadena>"` — «el texto de esta
capa ES el que numinia.com muestra en esa versión». Sin `versionWeb` el mundo no se cree el pase y pregunta como siempre.

```json
{ "capa": "casa", "version": "2026-10", "versionWeb": "terms@1.0.1+privacy@2.1.0", "puntos": [ … ] }
```

Reglas (el servidor las aplica en `crearPuertaCondiciones`, en un solo sitio):
- **Solo cuenta si el pase es bueno**: firma Ed25519 válida, no caducado, de este mundo (todo lo de `verificarPase`). Un pase falso, caducado,
  de otro mundo o recortado no da nada: la persona entra como invitada y se le pregunta todo. El campo no alarga el pase (`exp` es el suyo) ni
  toca los permisos, la altura ni los roles. En el pase de una IA el campo está prohibido (la IA no acepta nada).
- **Coincidencia exacta**: `acepto.casa === versionWeb`. Si la web sube sus textos y el autor del mundo aún no ha revisado el suyo, no coincide
  y se pregunta como siempre (y, si la persona ya aceptó antes en este mundo, c6 le enseña solo lo que cambió).
- **Cubre las NORMAS de esa capa, nunca los permisos de datos**: la oferta (`condiciones-estado@1`) añade `porPase: ["casa"]`, no cuenta esa
  capa en `faltan`, y la lista en `capas` solo con sus puntos `datos` (o sin la capa si no tiene ninguno). Si no queda nada por pedir, `abierta: true`
  y la burbuja ni sale; si falta la comunidad, empieza en la comunidad y al final pide «Tus datos» con las casillas vacías. Un permiso de datos
  solo existe si la persona lo marca en el mundo.
- **No se guarda como aceptación**: la aceptación de la casa vive en la web; en el mundo solo se guarda lo que la persona acepta aquí. Al volver
  con un pase al día vuelve a valer; sin pase (invitado) se pregunta.
- El mundo no manda `acepto` a la página (la identidad que recibe el navegador no lo lleva).

### La burbuja de entrada (c3, PC y móvil: `apps/plaza/condiciones.ts`)

Con la puerta encendida, la página recibe `condiciones-estado@1` con `puerta: true, abierta: false` y pone al jugador en una pompa: el mundo se
ve detrás, borroso y oscurecido (un solo `backdrop-filter` CSS: nada de post-proceso GPU, barato en móvil) y un panel `role="dialog"` `aria-modal`
pide, paso a paso, una página por capa (casa, luego comunidad: lo esencial, el texto entero y una casilla obligatoria) y al final «Tus datos · entras
igual digas sí o no»: los puntos `datos` como casillas VACÍAS y dos botones iguales («Entrar sin lo opcional», «Aceptar todo y entrar»).
Además «← Atrás» y «Salir» (a la `ciudadUrl` del mundo si la tiene; si no, una despedida con «Volver atrás» / «Volver a empezar»). No se cierra con
Escape ni con clic fuera, el foco se queda dentro del panel (Tab da vueltas) y el resto de la página va `inert`; mientras está, ninguna tecla llega al
mundo y `readAxes` devuelve 0 (el servidor también te sujeta). Al aceptar manda `ACEPTAR` (`session.aceptar(versiones, datos)`); cuando el servidor
contesta `abierta: true` la pompa estalla (650 ms, o 30 ms con `prefers-reduced-motion`) y se camina. Móvil vertical (ventana estrecha o
`?aparato=movil-vertical`): el panel ocupa casi toda la pantalla. Con la puerta APAGADA (por defecto) no se crea ningún elemento ni estilo.
`apps/plaza/condiciones-logica.ts` guarda las decisiones sin navegador (pasos, qué manda ACEPTAR, qué cierra la puerta) y las prueba
`test/condiciones-burbuja.test.ts`; `__numinia.condiciones` expone `estado`, `cerrada()` y `alCambiar()` para c4 (VR); c5 (la pompa vista desde fuera) va aparte, justo debajo.
Mundo de pruebas: `aventuras/condiciones-prueba/` (ver su `LEEME.md`); e2e: `node tools/e2e-piernas/condiciones.mjs` (con `SHOTS=carpeta`, fotos de cada paso en PC 1400×900 y móvil 390×844).

### La burbuja de entrada en VR (c4: `apps/plaza/condiciones-xr.ts` + `packages/render/src/condiciones-vr.ts`)

Con el visor puesto la misma burbuja es **un panel en el mundo**: a 1,2 m delante, a la altura de los ojos, quieto (se pone una vez; si te das la
vuelta y lo dejas de mirar 2,5 s vuelve delante de ti) y con la letra grande (≥ 1,2°; los botones ≥ 3°). Es **otra vista de la misma lógica**, no otra
lógica: los pasos, los textos de cada paso, los botones del pie y cuándo están apagados, el rótulo de la casilla y lo que manda ACEPTAR salen de
`condiciones-logica.ts` (`textosDePaso`, `botonesDePie`, `rotuloNormas`); la burbuja plana sigue siendo la dueña del estado (paso, casillas, «enviando») y el
panel VR llama a los mismos métodos (`ir`, `marcarNorma`, `marcarDato`, `enviar`, `salir`). Por tanto:

- **Menos texto por página**: un paso de normas = «Lo esencial» (los títulos de las normas, numerados) y después el texto entero a 7 líneas por página;
  un paso de cambios (c6) = primero lo nuevo / cambiado / quitado y después el texto de lo que cambió; «Tus datos» = 2 permisos por página, todas las
  casillas VACÍAS y los dos botones iguales («Entrar sin lo opcional» / «Aceptar todo y entrar») en todas las páginas, más «Atrás» y «Salir». La casilla
  que acepta las normas se ve siempre, en cualquier página del texto. Las páginas solo recorren el texto; la ley sigue estando en la casilla.
  Paginación sin navegador: `apps/plaza/condiciones-vr-logica.ts` (`test/condiciones-vr.test.ts`).
- **Cómo se maneja**: rayo de cualquiera de los dos mandos + gatillo; pellizco del rayo de una mano seguida (lo hace `manos.ts` con cualquier `Panel`); tocar con
  la punta del dedo (a ≤ 15 mm, una vez, hay que despegar para repetir); la **palanca** (izquierda o derecha, ← →) pasa de página — dentro de la burbuja la
  palanca no gira ni mueve. «Salir» pregunta dos veces en VR (un rayo se desliza fácil); si sales, termina la sesión de VR para que se lea la despedida plana.
- **Locomoción**: con la burbuja abierta `vr.update` pone el movimiento y el giro a 0 (el cliente ni lo intenta; el servidor ya te sujeta) y no hay reloj
  ni menú de muñeca. Al estallar la pompa se vuelve a andar.
- **La pompa alrededor**: una esfera de 1,6 m vista desde dentro, un solo material plano, opacidad 0,16 como mucho y que sube en 1 s: el mundo nunca se oscurece
  de golpe y no hay viñeta. Estalla en ~⅓ s (crece ×1,35 y se desvanece; el panel se va con ella). Un solo lienzo → una textura, y se redibuja solo cuando
  cambia el modelo (paso, casilla, página) o el resalte (como mucho cada 100 ms).
- **Casos**: *PC con el visor, burbuja a medias* → al entrar en VR (botón «Entrar en VR» de la propia burbuja, porque la barra queda tras ella) el panel sale en el
  mismo paso y con las mismas casillas; la burbuja plana sigue montada bajo el visor (en el monitor se ve como siempre) y lo que hagas en uno se ve en el otro.
  *Quest, la burbuja plana sale antes de entrar en VR* → igual; el navegador de la Quest también la tiene (con su «Entrar en VR»). *Salir de VR con la burbuja
  abierta* → sigues en el mismo paso en la burbuja plana. *Servidor con la puerta apagada* → no se carga nada de VR de la burbuja.
- Se carga bajo demanda (`import()` en cuanto la burbuja sale en un navegador con VR, para que entrar no espere). Comprobación: `__numinia.view.vr.condiciones()?.estado()`
  y `.zonaMundo(id|botón)`; e2e con IWER (Quest 3 emulada): `node tools/e2e-piernas/condiciones-vr.mjs` (puertos 8861/5193; `SHOTS=carpeta` guarda el lienzo del panel).
  **No probado en una Quest real** (ver el PR: paso a paso por USB).

### La pompa vista desde fuera (c5: `packages/render/src/pompas.ts`)

Quien aún está leyendo las normas (puerta encendida y no abierta) se ve, para todos los demás, **dentro de una pompa translúcida** con un
rótulo «Nombre · leyendo las normas…» (el rótulo de nombres de siempre, `nombres.ts`, que además se queda encendido y un poco más alto mientras
dura). Es una esfera con **una sola geometría y un solo material compartidos** (sin shader propio, sin refracción: un dibujo por persona que
lee y se ve, como mucho 24); al aceptar estalla en ~⅓ s sobre una copia del material que solo existe durante el estallido. Una pompa quieta no
pide fotogramas (`busy()`). Con la puerta apagada no se crea ni la geometría. Para comprobarlo: `__numinia.view.pompas()` y
`__numinia.view.nameTags()`; e2e: `node tools/e2e-piernas/condiciones-pompa.mjs`.

- **`LEYENDO` (15), servidor → página**, aditivo: `[15, (entidad u16 BE, estado u8)…]`, estado 1 = está leyendo, 0 = ya no (aceptó o se fue).
  Se manda **solo al cambiar** (llega y tiene que leer; acepta; se desconecta) y **una vez, como lista, a quien se conecta**: 4 bytes por
  cambio a cada otra conexión, **0 bytes por tick**, nada en la instantánea. Quien ya aceptó esa versión no genera nada al volver; con la puerta
  apagada no sale ni un byte (test: mismos bytes que sin puerta). Una conexión nunca recibe su propio estado (su pompa es el panel de c3).
  Hasta 300 entidades por mensaje. Cliente: `session.leyendo` (conjunto de entidades) y `session.onLeyendo(entidad, leyendo)`; la página lo
  pasa a `view.leyendo(entidad, si)`.
- **Ni se la oye ni se la empuja**: su voz no se reenvía (c2) y, mientras lee, el servidor rechaza `ordenar(…, { empujar | quieto | sentar })`
  sobre ella (`Instance.leyendoNormas(entidad)`, `api.leyendoNormas`) y `lucha` rechaza el golpe PVP («Esa persona está leyendo las normas»).
  No hay colisión cuerpo a cuerpo en el simulador, así que nada más la mueve. Una función nueva que mueva o dañe a otra persona pregunta
  `api.leyendoNormas(e)` antes.

### La puerta (apagada por defecto)

Con la puerta **encendida**, una persona que no ha aceptado todas las normas obligatorias de la versión actual de cada capa
se queda quieta donde llegó (sus entradas de movimiento se ignoran), y se ignoran su chat, su voz (no se reenvía nada de su
micrófono) y todo mensaje de función: colocar y construir, y cualquier acción de juego. Ver y oír a los demás no se toca.
No es un error del cliente: no suma a los mensajes malos. Una IA con su billete firmado no pasa por la puerta (no tiene
burbuja que pulsar).

Quién decide si está encendida, por orden: la opción del servidor `condicionesPuerta` (`startServer`) o la variable de
entorno `MOTOR_CONDICIONES_PUERTA=si|no` → la clave `puerta` de `condiciones.json` → **apagada**. Con la puerta apagada el
servidor se comporta exactamente como antes (no envía nada por su cuenta, no registra la función `condiciones`, no cambia
ni un byte) y solo contesta si la página pregunta. El registro del arranque dice una línea con el estado
(`[condiciones] puerta apagada|ENCENDIDA …`).

### Los mensajes (net, tipos 13 y 14, aditivos; `WIRE_FORMAT` sigue en 2)

- **`CONDICIONES` (13), servidor → página**: `[13, JSON]` con
  `{ formato: "condiciones-estado@1", puerta, abierta, faltan: [capa…], aceptado: { versiones: {capa: versión}, datos: [id…], en: ISO } | null, capas?: [{ capa, version, puntos: [{ id, titulo, texto, obligatorio, tipo }] }] }`.
  `abierta` = puedes moverte, hablar y construir (puerta apagada, o ya aceptaste lo vigente). `faltan` = las capas cuya versión
  vigente tienes que aceptar. `capas` (el texto entero) va en la oferta y no en la respuesta a `ACEPTAR`. Con la puerta encendida
  la oferta llega sola justo después de `IDENTITY`.
  **c6, campo aditivo `cambios` por capa** (solo cuando esa persona aceptó antes OTRA versión de esa capa y el servidor guardó las huellas;
  un cliente viejo lo ignora y enseña todo): `capas[i].cambios = { desde: "1.0", nuevos: [id…], cambiados: [id…], quitados: [id…], antes?: { id: "título de antes" } }`.
  `nuevos` y `cambiados` están en `puntos`; `quitados` ya no (solo su id y, en `antes`, su título). Cambia el título, el texto, `obligatorio` o
  `tipo` = `cambiado`. Un punto `datos` nuevo o cambiado se ofrece con la casilla VACÍA: el permiso de uno cambiado se pierde (consentimiento
  informado) y el de uno sin cambios sigue dado (`aceptado.datos` lo conserva aunque la página no lo muestre). Un registro de c2 (sin huellas) o una
  capa nunca aceptada: sin `cambios`, se pide todo. La capa con la misma versión aceptada no entra en `faltan` ni lleva `cambios`.
- **`CONDICIONES` (13), página → servidor**: un solo byte `[13]` = «mándame las condiciones y dónde estoy». Se contesta siempre
  (puerta encendida o apagada, antes o después de `IDENTITY`).
- **`ACEPTAR` (14), página → servidor**: `[14, JSON]` con `{ versiones: { capa: "versión que leíste" }, datos: ["id de dato marcado"…] }`
  (hasta 4 capas, 40 ids, 40 caracteres cada texto, 900 bytes). Solo cuentan las versiones **vigentes** y los ids que existen
  como puntos `datos`; lo demás se ignora. `datos` es exactamente la lista de permisos marcados (otra aceptación la sustituye:
  desmarcar es retirar). Hace falta haberse identificado (se guarda por persona); hasta 5 por segundo. Se contesta con un
  `CONDICIONES` sin `capas`.
- Se guarda por persona (`a:<id>` en el almacén de la función `condiciones`, `datos/condiciones.json`; solo existe con la puerta
  encendida): `{ v: {capa: versión}, d: [ids], en: ISO UTC }`; sobrevive a reinicios y viaja con la persona.
- Cliente (`ClientSession`): `condiciones` (último mensaje; conserva el último `capas`), `onCondiciones`, `pedirCondiciones()` y
  `aceptar(versiones, datos = [])`.


## Báculo del Director (v1) e interruptores de pieza

**El báculo** (`features/baculo`): una cosa del mundo (pedestal + báculo ámbar, modelo CC0 de la casa). Quien lo lleva dirige: el servidor decide quién lo coge (`E` a su lado, un báculo por persona, nunca una IA), a quién se pasa (`/baculo pasar <nombre>`, a 6 m o menos), cuándo vuelve (`/baculo soltar`; al desconectarse se guarda 30 s; si un moderador echa a quien lo lleva, vuelve al instante) y se lo dice a los roles del mundo con el evento `concesion` (solo lo oye el servidor) para que presten `dirigir` (manage-rituals) exactamente a quien lo lleva. No es un rol nuevo (los roles son de numinia.com, STD-052). Quien manda (`mandar` = administrator o dueño) fija cuántos hay (`/baculos 1–5`) y los recupera (`/baculo recuperar`). Se configura con `entorno/baculos.json` (`numinia-engine/baculos@1`: `{ activa?, cantidad?, sitios?: [{x,y?,z}] }`); sin fichero está apagado y cuesta 0.

**Interruptores** (Pablo, 2026-10-21: toda pieza es un on/off). Patrón de `apps/plaza/entorno.ts` + `features/naturaleza` + `features/espaciobase`:
1. `features/<pieza>/feature.ts` declara el intent `encender { activa }` y el evento `permiso { encender }` (solo a esa persona).
2. El servidor usa `features/interruptor.ts`: `puedeInterruptor` (`dirigir` **o** `mandar`: por rol, por `/dueño` o por llevar el báculo), `vigilarPermiso` (dice `permiso` al entrar, al identificarse y cuando cambian los roles) y `guardarEnMundo` (cambia solo esas claves del fichero del mundo; un fichero roto no se pisa; sin carpeta, lo guarda el `store` de la pieza).
3. `features/<pieza>/client.ts` exporta `interruptor { estado.puede, activa(), poner(bool) }`; `main.ts` lo pasa a `montarEntorno` en la lista `piezas`, que pinta una fila `.interruptor` solo a quien tiene `estado.puede`. La fila sigue el estado del servidor, nunca su propio clic.
4. Encendido por primera vez sin sitios: el servidor coloca la pieza junto a quien la enciende y los guarda (`baculos.json`, `dados.json`). Apagar guarda los sitios y quita la pieza; el báculo en una mano vuelve a su sitio antes.

**Dados**: apagados no hay torre y `/tirar` dice que están apagados; las torres guardadas no cambian. Un `dados.json` anterior con torres y sin `activa` sigue encendido.

Con interruptor: espacio base, naturaleza, báculo, dados, asientos. Sin él aún (siguen siendo «un fichero»): pesca, dardos, puertas, botones, cogibles, web, lucha, movedores, contadores, disparadores, suelo, elementos, teletransporte, objetos. Para cualquiera: los cuatro pasos de arriba (un intent, un evento, un `interruptor` en el cliente, una entrada en `piezas`).

## Asiento (v1): sentarse de verdad

`features/asiento`: `E` junto a un asiento libre y tu avatar se sienta (la animación `sentarse`, ya en el motor), mirando hacia donde mira el asiento, quieto. Un asiento, una persona; el ocupado muestra el nombre. Se levanta con `E` otra vez, `/levantar`, andando o saltando, o al desconectarse; quien dirige, puede echar o manda levanta a otra persona (`/levantar <nombre>`).
- **Mundo**: `entorno/asientos.json` = `{ "schema": "numinia-engine/asientos@1", "activa": true, "sitios": [{ "id": "j1", "x": 3, "y": 0, "z": 4, "mira": 90, "etiqueta": "Jugador 1", "dibujo": false }] }`. `mira` en grados (0 = hacia +z, 90 = hacia +x, el `ry` de un modelo); `y` = altura de los pies sentado; `dibujo: true` pone una banqueta (para sitios sin modelo propio, p. ej. el que coloca el interruptor). Hasta 24 sitios. Sin fichero = apagado, coste 0, huella de simulación intacta.
- **Cómo se sienta**: el servidor decide (`api.within` a 2 m, libre, no sentado, no leyendo normas) y da la orden grabada `api.ordenar(e, { sentar: { x, y, z, rumbo } })` (H2: `MODO_SENTADO` de la simulación, que ya existía). La simulación levanta sola ante un palo o un salto; el servidor lo ve con `api.sentado(e)` (nuevo) y libera el asiento. Al levantarse con `E` o `/levantar` se pone `api.ordenar(e, { poner })` 0,8 m detrás del asiento.
- **Página**: pose `sentarse` mantenida con `view.movimiento` y rumbo con `view.orientar` (expuesto de `render/avatares`, que ya lo tenía); «E: levantarte» es un local de `interactuar.ts` (`asiento.cerca()`).
- **Interruptor** «Asientos» en Entorno (mismo patrón que báculo y dados). Apagar levanta a quien esté sentado y quita los asientos; los sitios se guardan.

## Burbujas de voz (v1): voz solo entre los de la mesa

`features/burbujas`: una esfera del mundo (una mesa, una sala) donde solo se oyen entre sí los que están dentro. La decide el servidor al reenviar la voz (`relayVoice` en `packages/instance`), no una página: lo que el servidor no envía no suena. Es privacidad de oído, no cifrado: el servidor sigue reenviando las tramas que recibe y no las decodifica, graba ni guarda.
- **Mundo**: `entorno/burbujas.json` = `{ "schema": "numinia-engine/burbujas@1", "activa": true, "burbujas": [{ "id": "mesa", "x": 3, "y": 0, "z": 4, "radio": 3.5, "modo": "aislada", "etiqueta": "La mesa" }] }`. Hasta 16 burbujas, radio 0,5–50 m, altura de una esfera. Sin el fichero no hay burbujas y la voz es la de siempre (coste 0, misma huella).
- **Reglas** (modo `aislada`, el de por defecto): dentro ↔ misma burbuja se oyen (sin tope de 30 m dentro del radio); dentro ↔ fuera no se oye nadie, en ningún sentido; fuera ↔ fuera, por cercanía como siempre; dos burbujas distintas no se oyen. Modo `abierta`: los de fuera cercanos también oyen a los de dentro y viceversa (solo ensancha).
- **Quién está dentro**: cada persona está en una burbuja como mucho (la de centro más cercano si se solapan), calculado una vez por tick por posición (sentado en un asiento de la burbuja cuenta). El hueco con el relé es `api.vozBurbujas(tabla | null)` (nuevo): el relé consulta `de(entidad)` y `abierta(burbuja)` por trama en O(1).
- **Página**: aviso «En La mesa: solo te oyen los de la mesa» al entrar (evento `dentro`, solo a esa persona), cartel pequeño mientras estás dentro (`apps/plaza/burbuja.ts`) e icono de micrófono junto al nombre en «Gente».
- **Interruptor** «Burbujas de voz» en Entorno (mismo patrón): quien dirige o manda; encendido por primera vez sin sitios pone una de 3,5 m donde está quien lo enciende y la guarda en `burbujas.json`; apagarlas devuelve la voz de siempre.
- **Barra de acciones**: cada acción puede declarar `disponible()` (`Action` nuevo, opcional); la página pone `hidden` en el botón cuando no es posible («Soltar/Pasar el báculo» solo con báculo, «Levantarte» solo sentado). Sin `disponible`, siempre visible como antes.

## Avatares propios del mundo (E3): CC0 o CC BY con su crédito, solo en ese mundo

Un mundo (un evento, un patrocinador) puede traer **sus propios avatares** en su zip y que su gente los elija en el selector de ese mundo, sin tocar el catálogo de la casa (`activos/avatares/catalogo.json`, que viaja a todos los mundos y sigue siendo solo CC0). Es una pieza que cualquier mundo enciende con datos (R-1): sin el fichero, todo funciona como antes.

- **Dónde**: `entorno/avatares.json` + los ficheros en `datos/activos/<sha256>.vrm` (y `<sha256>.png|jpg|webp` para la miniatura), subidos como cualquier modelo (H9: `PUT /a/<sha256>.vrm`, o dentro del zip). Nada nuevo en el zip: `entorno/*.json` y `datos/activos/` ya viajan en `mundo@2`, con sus tipos y topes (`.vrm` ≤ 12 MB, imagen ≤ 4 MB).
- **Formato** (`numinia-engine/avatares-mundo@1`, hasta **8**): `{ "schema": "numinia-engine/avatares-mundo@1", "avatares": [{ "id": "trg26-cian", "nombre": "TRG cian", "sha256": "<64 hex del .vrm>", "licencia": "CC-BY-4.0", "credito": "Avatar basado en … (CC BY). Reducido y recoloreado para …", "miniatura": "<sha256>.png" }] }`. `id`: `a-z0-9-`, hasta 32; `nombre` hasta 40 bytes; `credito` hasta 240 bytes; `miniatura` opcional.
- **Licencias**: `CC0`, o `CC-BY` / `CC-BY-4.0` (la escritura es la 4.0). **CC BY exige `credito` no vacío** (autor, qué se ha cambiado): el selector lo muestra pegado al avatar, con el enlace a la licencia. Ninguna otra (NC, SA, ND, «Other») entra. La licencia **dentro del fichero** (`meta.licenseName` en VRM 0.x, `otherLicenseUrl` en VRM 1.0) se lee, **nunca se reescribe**, y tiene que decir lo mismo que la lista (un fichero CC BY no se puede declarar CC0: sería relicenciarlo); además debe permitir el uso comercial (y, en VRM 1.0, redistribuirlo). El motor **no mira** `allowedUserName` («solo la persona autorizada»): quien administra el mundo responde de que tiene ese permiso y lo guarda junto al mundo.
- **Comprobación** (`packages/server/src/avatares-mundo.ts`, al arrancar el servidor, con el mismo lector `vrm.ts` de las subidas): el fichero existe en este servidor, su contenido es el de su nombre (sha256), es un VRM con ≤ 10.000 triángulos, y la licencia es la declarada. **Una línea mala se queda fuera con su motivo en el log (`[avatares] avatares.json: avatares[1].credito: …`) y el resto del mundo sigue**; una miniatura mala solo quita la imagen. Cambiar el fichero o subir los .vrm después pide reiniciar (subir un zip de mundo ya reinicia).
- **Qué sale**: `GET /status` lleva `avatares` (id, nombre, sha256, licencia, credito, triángulos, miniatura) solo si hay alguno; los ficheros salen por `/a/<sha256>.vrm` de **este** servidor (otro mundo ni los lista ni los tiene).
- **Elegirlos**: el selector (`apps/plaza/avatar.ts`, «Cambiar avatar» en «Tú») añade «De este mundo» con miniatura, nombre y crédito. Elegir uno es la misma elección que subir un .vrm propio (`avatar.elegir` `{tipo: "subido", sha, ext: "vrm"}`): no hay mensaje ni estado nuevos, la simulación y su huella no cambian. La página no se fía: una línea de `/status` sin fichero válido, o CC BY sin crédito, no se muestra.
- **No hace** (todavía): avatar por defecto de todo el mundo con uno de estos (`ficha.avatar` y `ia.cuerpo` siguen siendo solo de la casa), panel de créditos del mundo, ni mostrar el crédito al ver a otra persona que lo lleva puesto.
- **Pruebas**: `test/avatares-mundo.test.ts` (lector, licencias, CC BY sin crédito, > 10.000 triángulos, 8 como tope, `/status` y `/a/`, el zip de ida y vuelta, la lista de la página, catálogo de la casa intacto).
