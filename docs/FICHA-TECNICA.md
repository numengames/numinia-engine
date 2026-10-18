# Ficha técnica del motor

Para quien tenga que decidir si monta algo sobre el motor. La versión para máquinas es
[`limits.json`](../limits.json) (esquema `numinia-engine/limits@1`); un test (`test/limits.test.ts`)
comprueba que cada número tiene estado y fuente. **Medido** = lo mide una prueba del repositorio
(se nombra). **Estimado** = viene de estudios y de lo que publican otros; se sustituye por una medida
cuando exista. Versión 1 · 15 de octubre de 2026.

## Qué sale hoy en cada nivel

| Nivel | Qué es | Hoy |
|---|---|---|
| **Base** | funciona en todo navegador con WebGL2 | instancia en servidor, simulación determinista, predicción en el cliente, dibujo WebGL2, enjambre de bots, módulos de juego (medido) |
| **Mejorado** | se enciende solo donde la API existe | XR (VR y AR): hecho y probado con emulador, **sin aparato real** (X1); WebGPU (lo elige three.js; sin prueba propia); voz: **aún no implementada** |
| **Frontera** | opcional, detrás de un interruptor | WebTransport: **aún no implementado** |

Se detecta por capacidad, nunca por nombre de navegador.

## Servidor

| Dato | Valor | Estado |
|---|---|---|
| Paso de simulación / reparto | 20 Hz / 10 Hz | medido (`tools/gates.mjs`) |
| Tráfico por persona (K=50 a 10 Hz) | tope 70 kbit/s; real **27,2 kbit/s** (J2: con altura; 25,6 antes) | medido (`tools/gates.mjs`, `tools/swarm.sh`) |
| Plaza de 1.000, un hilo | tick p99 ≤ 25 ms; real 16–23 ms | medido (`tools/gates.mjs`), en el PC de desarrollo |
| Memoria con 1.000 conectados | 169 MB | medido (`tools/swarm.sh`) |
| Conectar 500 bots | ~0,4 s | medido (`tools/swarm.sh`) |
| Personas por instancia, un hilo | PC de desarrollo 1.000 (medido); VPS-1 ~500, VPS-2 ~1.000 (estimado) | medido (`tools/swarm.sh`) y estimado |
| Voz por cercanía | 230 suscripciones por núcleo | estimado (LiveKit) |

Máquinas (OVH, sin IVA): VPS-1 3,81 €, VPS-2 7,21 €, SYS-3 (8 núcleos dedicados) 41,99 €. Hasta
1.000 en una instancia basta un hilo; más allá habría que repartir por regiones.

## Presupuesto de tamaño de mensajes (H3b)

Tope de una trama de la página al servidor: **2048 bytes** (`maxPayload` del WebSocket, `PASE_MAX` en `net`). Solo el mensaje
PASE usa más de 1024; `wsTransport` corta cualquier otro tipo que pase de 1024, como antes. Subir `maxPayload` hasta 2048 y no más:
hace falta para que quepa el pase (medido 630–1.813 bytes; un tope de 1.536 no cubriría el peor caso de hoy). Una trama de más de
2048 la cierra la librería (abuso); un mensaje mal formado, repetido o tardío se cuenta y no cierra nada.

| Mensaje (tipo) | Sentido | Tope | Por qué | Holgura | Mayor tamaño real | Estado |
|---|---|---|---|---|---|---|
| INPUT (1) | página → servidor | 6 | fijo: secuencia, dos ejes, botones | 0 (formato fijo) | 6 | medido (`test/mensajes-tope.test.ts`) |
| PING (3) | página → servidor | 5 | fijo | 0 | 5 | medido (ídem) |
| IDENTITY (10), petición | página → servidor | 201 | token de invitado (`g1.<id>.<día>.<firma>`) o billete `a2.` de un agente de fuera (ADR-080, hasta 200 caracteres) | 823 bytes bajo el corte de 1024 | 47 (invitado) | medido (`test/mensajes-tope.test.ts`; el tope, en `test/pase-cable.test.ts`) |
| PASE (12) | página → servidor | 2048 | el pase de numinia.com | 11 % sobre el peor caso emitible | 630 (un rol), **1.813** (5 roles CJK, 8 permisos, nombre de 40) | medido (`test/pase-cable.test.ts`) |
| PASE (12), IA de organización | puente → servidor | 2048 (el mismo) | el pase de una IA (suma `kind`, `state` y un `sub a_…`; nombre y roles como una persona) | 17 % sobre el peor caso emitible | 551 (un rol, nombre corto), **1.693** (5 roles CJK, nombre de 40, 2 permisos: una IA solo lleva entrar y construir) | medido (`test/pase-ia.test.ts`) |
| REPORT (9) | página → servidor | 1000 | un informe JSON; la página recorta `ua`/`gpu` si no cabe | 20 % sobre lo visto | 799 guardados (entrada) | medido en sesiones locales; **sin medir en aparatos reales** |
| VOICE (11) | página → servidor | 704 | 4 de cabecera + 700 de trama | 380 bytes (54 %) | 324 (20 ms µ-law) | medido (`test/mensajes-tope.test.ts`) |
| FEATURE (7), intención | página → servidor | sin tope propio (campos con `maxBytes`) | texto empaquetado por esquema | 820 bytes bajo el corte de 1024 | 204 (`chat.decir`) de 26 intenciones | medido (`test/mensajes-tope.test.ts`) |
| SNAPSHOT (2) | servidor → página | sin tope (K=50) | 30 de cabecera + 6–8 por visible | — | 330 con K=50 | medido (ídem) |
| WELCOME (5) | servidor → página | fijo | — | — | 30 | medido (ídem) |
| CATALOG (6) | servidor → página | sin tope | JSON de todo lo que corre el servidor | — | 32.863 (se manda una vez al entrar) | medido (ídem) |
| FEATURE (7), evento | servidor → página | sin tope | esquema | — | 902 (`pnj.dialogo`) | medido (ídem) |
| STATE (8) | servidor → página | sin tope | esquema | — | 393 (`misiones`, calculado) | medido (ídem) |

Los mensajes del servidor a la página no los limita el servidor (el navegador no pone tope); la columna «tope» de la bajada es
«sin tope». Los tamaños de bajada están aquí porque conviene saberlos, no porque haya un límite que defender.

Atención (no se ha cambiado ningún otro tope):
- **PASE**: el emisor (`numinia-web` `world-pass.ts`) corta los roles a 40 caracteres pero **no el nombre de la persona**: con
  200 caracteres el pase mide 2.423 y el motor lo rechaza sin que la persona lo sepa (cae a visitante, sin aviso porque la
  página no llega a enviarlo). Pedir a numinia.com que corte `name` a 40 (el motor ya lo hace) deja 11 % de holgura.
- **REPORT**: el informe de entrada guardado ya mide 799 de 1000. Si se añaden campos a `SHAPES` (`sesiones.ts`), mídelo antes;
  la página ya recorta `ua` y `gpu` a 60 si no cabe.
- **Intenciones FEATURE**: no tienen tope de trama propio; hoy la mayor es 204 bytes. Una función con un texto largo (p. ej. 1.000
  bytes) pasaría de 1024 y cerraría la conexión; `defineFeature` no lo avisa todavía.
- **Evento `pnj.dialogo`** (902 bytes, bajada): cerca de 1024 por convención; sin efecto hoy.

## Módulos de juego (funciones)

Cada función (gestos, y las que vengan) vive en `features/<id>/` y entra por el enchufe; receta en
[`EXTENDER.md`](EXTENDER.md). Todo medido por `test/feature.test.ts`.

| Dato | Valor |
|---|---|
| Ritmo por defecto de cada intento | 4 por segundo y jugador, ráfaga de 8 (cada intento puede declarar el suyo) |
| Intentos en espera por jugador | 32 por tick; el resto se tira y se cuenta |
| Alcance por defecto de un evento «cerca» | 32 m |
| Campo de texto | hasta 512 bytes |
| Petición a una ruta de función (POST) | hasta 4 KB |
| Estado compartido | sin sitio, a todos; con sitio (`at`), solo a quien está cerca (J9); se guarda si se declara (S4) |
| Coste si no hay funciones | ninguno: no viaja ningún mensaje nuevo y los de antes no cambian |

## Objetos del mundo (H1, paridad con Hyperfy2)

Lo que se coloca y se queda (`features/objetos`): un modelo de la biblioteca de la casa (`activos/`, CC0) con su
sitio, giro, escala y nombre. Medido por `test/objetos.test.ts`.

| Dato | Valor |
|---|---|
| Objetos por zona | hasta 2.000; la lista entera llega a quien entra |
| Entrar en una zona llena (2.000) | 186,8 kB en 2.001 mensajes; 0,3 ms del servidor por persona |
| Quién construye | por rol (H3, personas y agentes igual); @todos sí o no lo guarda el mundo (`MOTOR_CONSTRUIR` solo siembra uno nuevo; luego `/construir todos\|nadie`) |
| Deshacer | los 50 últimos cambios de cada constructor; un arrastre de menos de 1 s cuenta como uno |
| Ficheros | `GET /a/<sha256>.glb`, caché de un año; se bajan 4 a la vez, el más cercano primero |
| Animación | la primera del modelo, en bucle, solo a menos de 40 m (móvil frío) |

## Subir tus ficheros (H9, paridad con Hyperfy2)

Soltar un `.glb` en el mundo (o «Subir modelo…») lo sube por su sha256 y lo coloca donde se suelta. Solo quien puede
construir. Medido por `test/subidas.test.ts` y `tools/e2e-piernas/subir.mjs`.

| Dato | Valor |
|---|---|
| Quién sube | quien puede construir (billete de invitado I1 en `Authorization: Bearer`; sin él 401, sin permiso 403) |
| Tipos | glb, vrm, png, jpg, webp, ktx2, hdr, mp3, ogg, mp4, webm (otro: 415) |
| Tope por fichero | glb y vrm 12 MB (como Hyperfy2) · png, jpg, webp 4 MB · ktx2, hdr, mp3, ogg 8 MB · mp4, webm 32 MB (más: 413) |
| Tope entre todas | 1 GB por servidor (más: 507); 4 subidas a la vez (más: 503) |
| Comprobación | el servidor calcula el sha256 y lee el fichero: un .glb entero (cabecera, trozos, JSON), el resto por sus primeros bytes (mal: 422) |
| Repetidos | la página pregunta antes (`HEAD /a/<sha256>.glb`); lo que ya está no se sube ni se guarda dos veces |
| Huecos (U12) | una imagen de hasta 4.096 px por lado entra en un hueco (más: se rechaza con motivo); la página la reduce antes a 2.048 px y redibuja las JPEG sin su EXIF. Medido por `test/huecos.test.ts` y `tools/e2e-piernas/huecos.mjs` |

## Avatares VRM (J1)

Tú y los jugadores más cercanos, como humanoides VRM con animaciones; el resto, cápsulas. Medido por
`test/avatares.test.ts`, `test/avatares-biblioteca.test.ts` y la pierna `tools/e2e-piernas/avatares.mjs` (Chromium y Firefox).

| Dato | Valor |
|---|---|
| Avatares de la casa | 3 de 100Avatars (Polygonal Mind), CC0 dentro del fichero y en su fuente (`activos/avatares/LICENCIAS.md`) |
| Triángulos por avatar | como mucho 10.000 (más = rechazado); los de la casa, 2.130–2.880 |
| Peso por avatar | 974–1.142 kB, una vez (caché de un año por sha256), solo los de quien está cerca |
| Animaciones | quieto, andar, trotar, correr, en el aire: 491 kB las cinco, se piden según hacen falta (UAL1 de Quaternius, CC0) |
| A la vez | 60 en escritorio, 25 en XR, 12 en móvil (el resto, cápsulas); se reparte dos veces por segundo, los más cercanos primero |
| Animación | solo a menos de 40 m; de pie (respirando) no obliga a dibujar más deprisa; cambio de clip fundido en 0,2 s, sin pose en T |
| Código | three-vrm llega después del primer cuadro (64 kB gz aparte); el arranque crece 5 kB gz |
| Material | Lambert con la textura del avatar (sin MToon: costaría ~30 kB gz más en el arranque) |

## Misiones y personas (J5) y cosas que se usan de cerca (J4)

Las misiones, las personas que las dan y las cosas que se cogen las escribe la aventura como texto (`mision@1`,
`pnj@1`, `cosa@1`; `docs/EXTENDER.md`). Medido por `test/misiones.test.ts` y `tools/e2e-piernas/misiones.mjs`.

| Dato | Valor |
|---|---|
| Coste por tick | 1.000 jugadores esperando llegar a un sitio: p99 0,18 ms (p50 0,09); solo se mira a quien tiene un paso «llega a», cada 0,2 s |
| Alcance para hablar o coger | el radio de cada persona o cosa (1-8 m; el ejemplo, 3 y 2 m); el servidor acepta 1,5 m más |
| Límites | 16 misiones activas, 16 pasos por misión, 4 respuestas por nodo, 64 nodos por persona; textos en bytes UTF-8 |
| Progreso | por invitado (I1), en el almacén del servidor (S4); solo le llega a su dueño |
| Dibujo | el robot de la casa, quieto: 19 draw calls por persona (el tope del nivel D es 80): falta LOD |
| Puertas, botones y cosas que se cogen (J4, v1) | el servidor decide y avisa a 30 m; alcance 1-16 m por pieza (puerta 2,5, botón y cosa 2 m por defecto) y 1,5 m de margen; una puerta se cierra sola a los 0-120 s; un botón abre la puerta que nombra por una señal solo del servidor; una cosa en la mano por persona, se suelta donde estás o al salir; mismo gesto en PC, móvil y VR; medido por `test/interacciones.test.ts` (sin aparato real) |

## Aparato

Todo **estimado** (fuente: estudio de límites, 13-10). La ciudad se diseña al nivel B: lo que entra
en Quest entra en todo.

| | A · escritorio WebGPU | B · Quest 3 / Pico 4 | C · móvil medio | D · móvil viejo |
|---|---|---|---|---|
| Triángulos en pantalla | 2–3 M | 300–500 k por ojo | 300–500 k | 150–250 k |
| Draw calls | ≤ 1.500 | ≤ 150 por ojo | ≤ 150 | ≤ 80 |
| Texturas (KTX2) | ≤ 1 GB | ≤ 256 MB | ≤ 256 MB | ≤ 128 MB |
| Luces | varias + sombras | sol + 2 sin sombra | sol + 1 | sol |
| Avatares completos | 60–100 | 12–25 | 12 | 6 |
| Avatares VRM a la vez (tope del motor, medido) | 60 | 25 | 12 | 12 |
| Figuras horneadas | miles | 300–500 | 200 | 100 |
| Fuentes de audio | 32 | 16 | 8 | 4 |
| Descarga por zona | ≤ 60 MB | ≤ 40 MB | ≤ 30 MB | ≤ 15 MB |
| Hasta poder jugar | ≤ 15 MB | ≤ 12 MB | ≤ 10 MB | ≤ 6 MB |
| fps objetivo | 60 | 72 | 30 | 30 |

## Ajustes (N2)

El menú de ajustes (tecla O o el engranaje) es HTML de verdad; lo leen los lectores de pantalla y los agentes
(`window.__numinia.ajustes`). Cómo crece: [`EXTENDER.md`](EXTENDER.md) («Añadir un ajuste», «Añadir una capacidad»).

| Dato | Valor |
|---|---|
| Ajustes del motor | 24 en 6 grupos: gráficos, sonido, controles, accesibilidad, interfaz, privacidad |
| Ajustes que añade una función o un mundo | hasta 16 cada uno (medido, `test/ajustes.test.ts`) |
| Guardado | en el navegador: hasta 64 valores y 8 KB por clave (medido); el motor por aparato, funciones y mundos por mundo |
| Calidad | automática (según el aparato) · baja (ratio 1, 30 fps) · media (1,5 y 60) · alta (2 y 60); el modo batería manda (1 y 24) |
| Nivel del aparato | A escritorio · B visor (clase móvil que puede VR) · C móvil · D móvil de ≤ 2 GB: estimado hasta medir aparatos reales (T1) |
| Lo que pesa en la página | +12,0 kB gz al arrancar (260,7 kB de 300; medido con `npm run build`) |

## Navegador, gráfica y red

| Eje | Estado |
|---|---|
| Chromium | e2e pasa (medido, `tools/e2e.mjs`) |
| Gecko (Firefox) | e2e pasa (medido, `tools/e2e.mjs`) |
| WebKit (Safari) | **sin probar**: Playwright WebKit no corre en la máquina de desarrollo; prueba manual |
| WebGL2 | nivel Base, todos los navegadores objetivo |
| WebGPU | Chromium sí; Firefox en Windows/Mac; Safari 26+ (estimado) |
| WebSocket | transporte actual (medido, `test/server.test.ts`) |
| WebTransport | no implementado |

## Cómo se mantiene

Cambia un número en `limits.json`, no en esta página; cuando una prueba lo mida, pasa a `measured`
con `test` y `date`. El test falla si un valor medido apunta a un archivo que no existe.
