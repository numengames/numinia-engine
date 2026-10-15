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
   `{ near, radius }` o `"all"` · `api.state.set / get / delete` · `api.route("GET", "/e/:token", req => …)`
   · `api.onJoin / onLeave / onTick` · `api.position(quien)`.
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
  y `MUNDO_DIR/elementos.json`.
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

- `api.puede(entidad, "construir")` — el servidor dice si esa persona (o agente) puede cambiar el mundo. Hoy lo
  decide `MOTOR_CONSTRUIR` (`todos` o, por defecto, nadie); con H3 serán roles por identidad. Pregúntalo en cada
  intento que cambie el mundo: la página nunca decide.
- `view.place?.(clave, { model, x, y, z, rx, ry, rz, sx, sy, sz, animate } | null)` — la página pone, mueve o quita
  una cosa con su modelo (sha256 de un `.glb`; el fichero sale de `/a/<sha256>.glb` del servidor). Giros en grados
  (primero `ry`, luego `rx`, luego `rz`). `view.here?.()` dice dónde está el jugador, para poner algo delante.
- Una ficha cuyo nombre queda vacío es **decorado** (como `alt=""`): no la lee el lector de pantalla ni la listan
  los agentes. Lo que se puede usar lleva nombre.
- El ejemplo completo es `features/objetos` (colocar, mover, girar, duplicar, fijar, nombrar, borrar, deshacer; la
  lista de la zona llega entera a quien entra, sin `at`, porque el escenario se ve desde lejos). Su constructor
  (`constructor` en `client.ts`) es lo que usa el panel de la plaza (`apps/plaza/constructor.ts`), y lo mismo puede
  usar un agente.

## Comprobar

`npm test` · `npm run gates` · `tools/auto.sh e2e` (incluye los gestos: la pestaña B camina hasta A,
A pulsa G, las dos ven el texto).
