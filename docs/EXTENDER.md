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
  api.action({ id: "bailar", label: "Bailar", key: "KeyH", run: () => api.send("hacer", { gesto: "bailar" }) });
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
  ficha.json           formato "ficha@1"   (opcional: cómo se llama el mundo, de qué va y su portada)
  *.md                 notas para quien escribe (no se leen)
```

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

Recompensas: hoy solo insignias (recuerdos de lo hecho; sin economía). `requisitos.misiones`: las que hay que haber
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
`marcaDe(feature, clave)` → `"!"`, `"✓"` o `""` (`pnj` o `misiones`), `oficioDe(pnj)` y `dialogo().oficio`. U14 (5):
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

## Agentes de fuera: gestionarlos por HTTP (ADR-080, para el panel de numinia.com)

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
- **Peces**: `features/pesca/peces.json` (1–3 entradas; talla con `azar^1,8`, la fuerza crece con la talla). Azar con el
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
- **Pruebas**: `test/pesca.test.ts` (sin pantalla: la picada cae en el rango, fuera de ventana se escapa, la tensión sube y baja,
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

## Dardos (v1): una diana en la plaza, en tu móvil y en tu pared (AR)

`features/dardos` es un minijuego que decide el servidor: una diana es una cosa del mundo (igual que un sitio de
pesca), una tirada son tres dardos, y en cada dardo **el jugador elige adónde apunta y con qué fuerza lanza; el
servidor decide dónde se clava**. Los mismos verbos en el PC, en el móvil y en AR.

- **Verbos.** `jugar{sitio}` empieza la tirada (la diana queda `ocupado`); `lanzar{sitio, x, y, fuerza}` lanza un
  dardo: `x, y` = el punto de la cara adonde apuntas, en radios de la diana (0, 0 el centro, y hacia arriba, 1 = el
  borde exterior del doble); `fuerza` 0-1. Un `lanzar` sin tirada la empieza (un agente puede simplemente lanzar).
  `salir{}` la deja donde esté (lo lanzado cuenta). Alejarse del radio, desconectarse o 60 s sin lanzar
  (`TURNO_INACTIVO_S`) la cierran también.
- **Dónde cae** (`aterrizaje`, pura): con `FUERZA_IDEAL = 0,65` el dardo va recto; más flojo **cae**
  (`CAIDA = 1,6` radios por unidad de fuerza que falta) y se abre un poco; más fuerte **sube** algo (`SUBIDA = 0,6`)
  y se abre bastante más (`ABRE_FUERTE`). Encima, un **pulso** (`TEMBLOR = 0,15` radios en un tiro perfecto):
  un punto uniforme en un disco cuya dirección sale de un hash del tick en que llegó el tiro, quién tiró, qué
  dardo y qué diana (`azarDe`) — sin `Math.random`: los mismos tiros en los mismos ticks caen en el mismo sitio
  (la prueba lo fija). Apuntar al centro con la fuerza justa da bull casi siempre y diana (50) ~1 de cada 4.
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
  - **PC**: el ratón mueve la mira (con un pequeño vaivén de pulso); mantener pulsado llena y vacía la barra de
    fuerza (`potenciaDe`, un ciclo de `CICLO_S = 1,1` s; la marca dorada = recto); soltar lanza. Teclado: flechas
    apuntan, Espacio mantener/soltar, Esc deja la tirada.
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
    hacia donde corta la cara. Tamaño real (`RADIO_M = 0,17`). La sesión dura `AR_JUEGO_MS` en un móvil.
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
  a 301/501 y «alrededor del reloj», duelos por turnos entre dos jugadores, dardos lanzados con el gesto real del
  mando (velocidad de la mano en VR).

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
- **Lo que no hace (todavía):** paredes que paren a quien no abre la puerta (es dibujo, no colisión: J6), botones
  con otra acción que una puerta (la señal ya existe; que otra función la escuche es una línea), coger con la mano
  física en VR (hoy, rayo y gatillo como el resto; J10 lo hace para las cosas de misión), y llevar más de una cosa.
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
- **Lo que no hace (todavía, historia 3):** guardar el valor entre reinicios del servidor (`persist`), un contador por
  persona o por equipo con nombre libre, poner o quitar contadores desde dentro del mundo (hoy, solo el fichero), y el
  cable que conecte `llegada` con otra pieza (D-041, otro agente).
## El cable (D-041, v1): disparadores que un mundo escribe en datos, sin código

La pieza `disparadores@1` (`features/disparadores`) es el cable del mundo: un constructor (o un agente que escribe JSON)
conecta «cuando pase esto, haz aquello» en `MUNDO_DIR/disparadores.json` (`numinia-engine/disparadores@1`) y **nadie
decide nada en su página**: el servidor vigila quién entra en cada zona (`api.onTick`, una distancia por persona y
disparador), comprueba el alcance de cada pulsación (`api.within`), cuenta el cooldown en ticks y el «un solo uso»,
avisa a los cercanos (`disparado`, `CERCA_M = 30`) y emite **una acción por receptor** como evento con alcance
`"server"` (`accion`): la función dueña de esa acción la oye con `api.listen("disparadores", "accion", …)` y devuelve
`true`. Hoy `features/objetos` hace `muestra` / `oculta` (pone `oculto` al objeto por id o por nombre exacto; la página no
dibuja un modelo oculto al jugar y sí al construir); `teletransporta`, `da_paso`, `abre_enlace` y `suena` llegan en sus
historias: mientras tanto el registro dice `nadie hace «teletransporta» en este servidor` en vez de callar.

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
  intención `pulsar {disparador}` (2/s, ráfaga 4); eventos `disparado` (cercanos), `senal` y `accion` (solo servidor) y
  `rechazado` («Acércate…», «Todavía no: … espera N s», «… ya se usó»). Una zona nunca regaña: si está en espera o
  gastada, entrar no hace nada; se dispara al **entrar** (una vez por entrada, por persona) y salir y volver a entrar
  vuelve a contar si el cooldown pasó.
- **Ejemplo mínimo (botón que enciende una farola oculta):** `{ "disparadores": [{ "id": "rojo", "nombre": "Botón rojo",
  "tipo": "boton", "x": 12, "z": 0, "frase": "E: pulsar", "cooldown": 5, "receptores": [{ "accion": "muestra", "objeto":
  "Farola" }] }] }` con un objeto llamado «Farola» marcado como invisible al jugar en el constructor.
- **Lo que no hace (todavía):** los receptores de las historias 3-4 (`teletransporta`, `da_paso`, `abre_enlace`, `suena`),
  la etiqueta flotante de la zona y el botón móvil (historia 5), el catálogo para agentes y el ejemplo en la plaza
  (historia 6), y disparadores que no sean zona o botón (la cerradura de D-042, el temporizador de D-044 son emisores
  nuevos de este mismo cable).

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
