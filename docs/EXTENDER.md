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

## Comprobar

`npm test` · `npm run gates` · `tools/auto.sh e2e` (incluye los gestos: la pestaña B camina hasta A,
A pulsa G, las dos ven el texto).

## Las demás piezas (una por fichero)

Cada pieza se documenta en su propio fichero `docs/extender/<pieza>.md` y añade UNA línea a esta lista (así dos
PR que añaden piezas no chocan).

- [Límites de esta primera versión (y qué fila de la cola los quita)](extender/limites-de-esta-primera-version.md)
- [Quién es quién (I1)](extender/quien-es-quien.md)
- [Guardar lo que tiene que sobrevivir a un reinicio (S4)](extender/guardar-lo-que-tiene-que-sobrevivir-a-un-reinicio.md)
- [Lo que toda función declara (accesibilidad, V1: si falta, la función no se carga)](extender/lo-que-toda-funcion-declara.md)
- [Cosas colocadas en el mundo y permisos (H1)](extender/cosas-colocadas-en-el-mundo-y-permisos.md)
- [Chat, nombres y oír a otra función (J3)](extender/chat-nombres-y-oir-a-otra-funcion.md)
- [Añadir un ajuste (N2)](extender/anadir-un-ajuste.md)
- [Añadir una capacidad (N2)](extender/anadir-una-capacidad.md)
- [Cosas que se usan de cerca (J4: hablar, coger, abrir)](extender/cosas-que-se-usan-de-cerca.md)
- [Misiones y personas (PNJ): cómo escribe una aventura las suyas (J5)](extender/misiones-y-personas-pnj.md)
- [Escenas y el Director de juego (N6)](extender/escenas-y-el-director-de-juego.md)
- [El Inventario (Y1): dar objetos a una persona desde tu función](extender/el-inventario.md)
- [Espacios (v1, Y50 + Y51): an own private space with guests and placement by rules](extender/espacios.md)
- [Pesca (v2): un minijuego que decide el servidor](extender/pesca.md)
- [Bienes digitales: un objeto que es tuyo (N10)](extender/bienes-digitales.md)
- [Dardos (v1, con duelo en v2): una diana en la plaza, en tu móvil y en tu pared (AR)](extender/dardos.md)
- [Dados (v1): los tira el servidor y todos ven lo mismo](extender/dados.md)
- [Puertas, botones y cosas que se cogen (J4, v1): tres piezas del motor que decide el servidor](extender/puertas-botones-y-cosas-que-se-cogen.md)
- [Contadores (v1, D-044): temporizador y contador que todos ven](extender/contadores.md)
- [El cable (D-041, v1): disparadores que un mundo escribe en datos, sin código](extender/el-cable.md)
- [Sonido (S6): el catálogo de la casa, con ficheros de verdad y su texto](extender/sonido.md)
- [LEEME-IA: la nota de un mundo para las IAs que entran (t_06071dee)](extender/leeme-ia.md)
- [Salón de los Ancestros y el tributo a Asimov (ancestros v1)](extender/salon-de-los-ancestros-y-el-tributo-a-asimov.md)
- [Agua (N2): estilizada, de color plano, un solo draw call](extender/agua.md)
- [Naturaleza (N4): relieve, árboles y hierba que enciende un fichero](extender/naturaleza.md)
- [Fauna (F1): quién hay en el mundo, sin red y sin reloj](extender/fauna.md)
- [Enrutador de capas (U2, H1: la pieza, aún sin enchufar)](extender/enrutador-de-capas.md)
- [Lucha (v1, L1): criaturas con coherencia y un golpe que decide el servidor](extender/lucha.md)
- [Condiciones de entrada (condiciones/c1-c2): las normas del mundo y la puerta del servidor](extender/condiciones-de-entrada.md)
- [Báculo del Director (v1) e interruptores de pieza](extender/baculo-del-director.md)
- [Asiento (v1): sentarse de verdad](extender/asiento.md)
- [Vuelo (v1): volar con permiso](extender/vuelo.md)
- [Burbujas de voz (v1): voz solo entre los de la mesa](extender/burbujas-de-voz.md)
- [Espejo (v1): cosas de fuera dentro del mundo](extender/espejo.md)
- [Caminos (v1): luz que recorre el suelo hasta cada zona, por mundo](extender/caminos.md)
- [Sucesos (v1, Y48): a world event that announces itself, advances alone and rewards everyone](extender/sucesos.md)
- [Avatares propios del mundo (E3): CC0 o CC BY con su crédito, solo en ese mundo](extender/avatares-propios-del-mundo.md)
- [Apps (M19 y H11 `.hyp`): una carpeta por app, que el motor lee y valida; su `main.ts` corre en una caja SES (M20)](extender/apps.md)
- [Franjas (v1, Y37): the band of the day, a hook for other features](extender/franjas.md)
- [Derribado (v1): falling is not dying](extender/derribado.md)
- [Idiomas del mundo (R-1, primer trozo): inglés por defecto, traducciones como ficheros](extender/idiomas-del-mundo.md)
- [Keymap v1 (teclas.ts): one key, one function; Default / Yours; the microphone on V](extender/teclas.md)
