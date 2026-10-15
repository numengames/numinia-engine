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

- El estado compartido se manda **a todos**; en mundos grandes tendrá que ir solo a los cercanos (J9).
  `state.set(clave, valor, { at: { x, z } })` ya guarda la posición para entonces.
- Los objetos (puertas, semillas) viven en el estado de su función, con `x` y `z`, y la página los dibuja;
  no son entidades de la simulación (J9 decidirá si deben serlo).
- El estado **se pierde al reiniciar** el servidor (S4).
- Para dibujar hay `label` y `bounce`; se añaden primitivas en `render` cuando una función las pida.
- Las rutas HTTP viven en el puerto de la instancia; en un servidor instalado, Caddy solo pasa `/ws` y
  `/health`: la primera función con ruta pública (R1) añade la suya al instalador.
- Un agente usa el mismo camino que una persona: lee el catálogo y envía intentos (P4 hará el SDK).

## Comprobar

`npm test` · `npm run gates` · `tools/auto.sh e2e` (incluye los gestos: la pestaña B camina hasta A,
A pulsa G, las dos ven el texto).
