# Paridad con Hyperfy2: qué falta para llegar, como mínimo, a su nivel

Pablo (15-10): «¿qué falta para llegar como mínimo al nivel de Hyperfy2?». La respuesta es esta tabla: una fila
por capacidad, con lo que Hyperfy2 tiene, lo que tenemos hoy y la fila de `docs/BACKLOG.md` que lo construye.

- **Hyperfy2** = nuestro fork `../numinia-hyperfy2` (v0.13.0, commit `ff60462`), leído en el código el 15-10:
  `src/core/nodes/*.js` (propiedades de cada nodo), `src/core/systems/*.js`, `src/core/entities/PlayerLocal.js`,
  `src/core/systems/Apps.js` (API de los scripts), `src/core/extras/createPlayerProxy.js` (API del jugador),
  `src/core/systems/ServerNetwork.js` (órdenes, permisos, guardado) y `src/server/*.js` (subidas, base de datos).
- **Nosotros hoy** = main `fec2f5f` (83 pruebas, e2e en Chromium, Firefox, AR y VR emulados), y desde H1 (15-10) lo
  que dice cada fila marcada «H1».
- **Paridad** = lo que una persona puede *hacer* en Hyperfy2 (visitar, hablar, construir, programar, administrar)
  se puede hacer aquí. No es copiar cómo lo hace: lo que Hyperfy hace mal no se copia (§4).
- Estado: ✔ igual o mejor · ◐ a medias · ✘ falta. Filas nuevas: **H1–H13** (H de Hyperfy).

## 1. Resumen

- De **78 capacidades**: **14 ✔**, **19 ◐**, **45 ✘** (el 15-10 al empezar: 13, 15, 50; H1 movió seis filas).
  Lo que falta es casi todo **contenido**: modelos
  colocados, escenario con colisión, sonido, imagen, vídeo, paneles, partículas, construir dentro del mundo,
  scripts y ajustes. Lo que tenemos es lo que Hyperfy no puede tener sin rehacerse: 1.000 personas en una
  instancia, servidor que manda, accesibilidad, telemetría, móvil frío.
- El camino corto son **tres paradas** (§5): **PH1** «se visita como Hyperfy2», **PH2** «se construye como
  Hyperfy2», **PH3** «se programa como Hyperfy2». Con las tres, más la voz (M17, cuando Pablo diga cuántas voces
  a la vez), hay paridad.
- Seis filas pesadas, para la sesión con Opus, en este orden: **H1 → M6 → H3 → H2 → M19 → M20** (§6). El resto
  son de turno.

## 2. Decisiones que salen de esta comparación

1. **Se construye en vivo, como en Hyperfy2.** Quien tenga el rol de constructor coloca, mueve y borra cosas
   y todos lo ven al momento; se guarda como texto (la carpeta del mundo: foto + diario, como S4) y se puede
   deshacer. Los agentes de IA también, si su rol lo permite (Pablo, 15-10: «tendrán también sus permisos»);
   lo que hacen queda firmado como suyo. Cambia M22, que decía «produce un
   PR, nunca toca el servidor». Por qué: construir dentro del mundo es lo que define a Hyperfy2, y como la
   verdad sigue siendo texto, exportar la carpeta a un PR sigue siendo posible.
2. **Lo colocado es la lista de la zona, no la simulación ni la cercanía.** El escenario, el decorado y las
   apps se mandan enteros a quien entra en la zona (Hyperfy los manda en su foto de entrada), con un tope que
   H1 mide; los cambios van a toda la zona (son raros); los ficheros de los modelos se bajan por distancia,
   lo cercano primero. La cercanía de J9 queda para el estado que cambia mucho (puertas, semillas). Por qué:
   el escenario se ve desde lejos; con el radio de 64 m de J9 aparecería de golpe.
3. **Una app es una función J7 que se carga en marcha.** La misma declaración (verbos con nombre hablado,
   eventos con anuncio, estado con ficha), la mitad del servidor en un compartimento SES con tope de CPU
   (M20) y la mitad del cliente solo para lo que se ve y se oye (paneles, partículas, sonido, clic). Los nodos
   de Hyperfy (Mesh, Collider, Audio, Video, Image, UI, Particles, LOD, Anchor, Action, Snap) son componentes
   con esquema en `app.json` (M19), y el inspector del constructor sale de ese esquema (como `app.configure`).
4. **Lo que el servidor le hace a un jugador entra en la simulación como una entrada más.** Teletransportar,
   congelar, frenar, empujar, sentar, dejar volar: órdenes del servidor con su tick, grabadas junto a las
   entradas, para que la repetición dé la misma huella y la predicción del cliente no dé tirones (H2). Hyperfy
   lo hace en el cliente y se fía.
5. **Cada panel del mundo tiene su gemelo HTML** (V4, N2). Los paneles de Hyperfy (UI) son dibujos que un
   lector de pantalla no ve.

## 3. La tabla

### 3.1 Moverse y verse

| Capacidad | Hyperfy2 | Nosotros hoy | Estado | Fila |
|---|---|---|---|---|
| Andar | física PhysX en el cliente; el servidor reenvía la posición sin mirarla | simulación del servidor, predicción exacta, 4 m/s | ✔ (sin trampas) | hecho |
| Correr | Mayús: 8 m/s (andar 4) | una sola velocidad | ✘ | J2 |
| Saltar y doble salto | salto + un salto en el aire | no | ✘ | J2 |
| Volar | quien construye (`toggleFlying`) | no | ✘ | H2 |
| Cámara en 1.ª y 3.ª persona con zoom | sí, con la rueda | 3.ª persona fija | ◐ | N1 |
| Avatares VRM | sí | figuras simples | ✘ | J1 |
| Elegir tu avatar o soltar tu VRM | panel de avatar; soltar un `.vrm`; se guarda con el usuario | no | ✘ | H10 |
| Gestos y bailes | ficheros `emote` (`.glb`) y efecto `emote` | gestos con texto (G/H), sin animación | ◐ | J1 |
| Nombre sobre la cabeza | `Nametag` (con barra de salud) | el nombre de invitado sale en el HUD | ◐ | J3 |
| Salud y daño | `damage`, `heal`, `health` | no | ✘ | H2 |

### 3.2 Hablar y estar juntos

| Capacidad | Hyperfy2 | Nosotros hoy | Estado | Fila |
|---|---|---|---|---|
| Chat de texto | un canal para todo el mundo; los 50 últimos al entrar | no | ✘ | J3 |
| Bocadillos sobre quien habla | sí | no | ✘ | J3 |
| Órdenes con barra | `/admin <código>`, `/name`, `/spawn set\|clear`, `/chat clear`, `/server stats`; las apps reciben `command` | no | ✘ | J3 + H3 |
| Voz por cercanía | LiveKit, espacial, silenciar | relé µ-law a 30 m (U10); silenciar por moderación y bloqueo personal también callan la voz (F1a) | ◐ | M17 (necesita aprobación) |
| Compartir pantalla | LiveKit → una pantalla `Video` del mundo (`screenId`) | no | ✘ | M17 + M18 |

### 3.3 El mundo que se ve y se oye

| Capacidad | Hyperfy2 | Nosotros hoy | Estado | Fila |
|---|---|---|---|---|
| Modelos 3D colocados | cada app trae su `.glb` (`Mesh`, `SkinnedMesh`) | los de la biblioteca de la casa (H1, 15-10); los tuyos con H9 | ◐ | H1 hecho; H9 |
| Animaciones de los modelos | `SkinnedMesh` + script | la primera en bucle, a menos de 40 m (H1) | ◐ | H1 hecho; M20 (control) |
| Cielo, sol, niebla y entorno HDR | nodo `Sky`: `bg`, `hdr`, `sunDirection`, `sunIntensity`, `sunColor`, `fogNear/Far/Color` | hemisferio + sol + niebla fijos en el código | ◐ | H4 |
| Escenario base del mundo | ajuste `model` | suelo plano con rejilla | ✘ | H1 + M6 + H7 |
| Viento | sistema `Wind` | no | ✘ | H4 |
| Sonido en el mundo | nodo `Audio`: fichero, volumen, bucle, grupo música/efectos, espacial (distancias, caída, conos) | sin audio | ✘ | V6 + H5 |
| Imagen en el mundo | nodo `Image` (ajuste, con o sin luz) | no | ✘ | H6 |
| Vídeo en el mundo | nodo `Video` (bucle, ajuste, audio espacial) | no | ✘ | M18 |
| Página web en el mundo | un `iframe` colocado en 3D con CSS (la técnica CSS3D) sobre el lienzo; en VR no se dibuja | pantallas web (N17, `features/web`): iframe CSS3D en ordenador y móvil, tarjeta + «Abrir fuera de VR» en VR, lista blanca de sitios por mundo, `sandbox`, sin cámara ni micrófono, solo dueños y DJ | ✔ | N17 |
| Paneles de interfaz | `UI`, `UIView`, `UIText`, `UIImage`: flexbox (Yoga), en el mundo o en pantalla, mirando a la cámara, clic | panel 3D de VR (J6) y etiquetas | ◐ | H6 |
| Partículas | nodo `Particles`: forma, ritmo, ráfagas, curvas de vida, hoja de sprites, en un worker | no | ✘ | H8 |
| Nivel de detalle | nodo `LOD` (`scaleAware`) | no (la multitud lejana horneada es A4) | ✘ | H13 |
| Sombras y posprocesado | ajustes: sombras, posprocesado, bloom, resolución | resolución dinámica (P2); sin sombras ni posprocesado | ◐ | H12 |
| Pantalla de carga con progreso | `ClientLoader` (precarga + progreso) | no | ✘ | M16 |
| Backend gráfico | `WebGLRenderer` (solo WebGL2) | WebGPU con WebGL2 de reserva | ✔ (más) | hecho |

### 3.4 Cosas que hacen cosas: interacción y física

| Capacidad | Hyperfy2 | Nosotros hoy | Estado | Fila |
|---|---|---|---|---|
| Aviso «E: usar» con mantener pulsado | nodo `Action`: `label`, `distance`, `duration`, `onStart/onTrigger/onCancel` | acciones de las funciones por tecla o botón táctil | ◐ | J4 |
| Clic sobre cosas del mundo | `onPointerEnter/Leave/Down/Up` | clic (escritorio y móvil) y rayo + gatillo (VR) sobre una cosa con enlace; la mano del cursor al pasar; sin eventos de entrar/salir para scripts | ◐ | J4 |
| Abrir un enlace | `world.open(url)` | `enlace` de la cosa (inspector): pregunta con la dirección entera y abre en pestaña nueva solo con un «sí»; solo https (http a esta máquina); en VR pregunta en un panel (`window.confirm` no sale en inmersivo) | ✔ | J4 |
| Chocar con el escenario | `Collider`: caja, esfera, malla, convexa | suelo plano | ✘ | M6 |
| Zonas que disparan algo | `Collider` con `trigger` + `onTriggerEnter/Leave` | no | ✘ | M6 |
| Objetos con física | `RigidBody` estático, cinemático, dinámico; contactos | no | ✘ | M6 |
| Articulaciones | `Joint`: fija, rótula, bisagra, distancia | no | ✘ | M6 |
| Rayos y solapes | `world.raycast`, `overlapSphere`, capas | no | ✘ | M6 |
| Asientos y anclajes | nodo `Anchor` + efecto `anchorId` | no | ✘ | H2 |
| Efectos sobre el jugador | `applyEffect` (congelar, frenar, gesto, anclar, duración, cancelable), `teleport`, `push` | no | ✘ | H2 |
| Personajes no jugadores | nodos `Avatar` + `Controller` movidos por un script | robots sin cerebro | ◐ | P4 + M20 |
| Marcador de objetivo | `ClientTarget` | baliza de `despertar` | ◐ | J5 |

### 3.5 Construir dentro del mundo

| Capacidad | Hyperfy2 | Nosotros hoy | Estado | Fila |
|---|---|---|---|---|
| Modo construir | sí, para quien construye | panel «Construir» (tecla C) con botones, sin gizmos (H1) | ◐ | M22 |
| Mover, girar y escalar con pasos | gizmos `translate`/`rotate`/`scale`, grados con paso | no | ✘ | M22 |
| Coger, duplicar, borrar, fijar, deshacer | sí | todo menos coger y llevar (H1) | ◐ | M22 |
| Soltar ficheros en el mundo | `.glb` → modelo, `.vrm` → avatar, `.hyp` → app, imagen, vídeo, sonido | no | ✘ | H9 + M22 |
| Subida de ficheros | `/api/upload`: nombre = hash, no repite (`upload-check`); **no mira quién sube** | no | ✘ | H9 |
| Puntos de encaje | nodo `Snap` | no | ✘ | M22 |
| Inspector de propiedades | campos de `app.configure`: texto, número, rango, interruptor, lista, fichero, color, curva | no | ✘ | M19 + M22 |
| Lista de apps con su coste | `AppsList` | `npm run describe` (texto) | ◐ | M22 |
| Jerarquía de nodos | `NodeHierarchy` | no | ✘ | M22 |
| Biblioteca de la casa | colecciones; la de serie trae Imagen, Modelo, Texto, Vídeo | `activos/` + `biblioteca.json`: Bloque y Robot, CC0 (H1) | ◐ | M22 |
| Lo construido se guarda | SQLite (`blueprints`, `entities`) cada 60 s | en texto, cada 1 s y al parar, con quién lo colocó (H1 + S4) | ✔ | hecho |

### 3.6 Programar: apps y scripts

| Capacidad | Hyperfy2 | Nosotros hoy | Estado | Fila |
|---|---|---|---|---|
| Unidad de contenido | `.hyp` (cabecera + JSON + ficheros) | decidida (carpeta de texto → paquete glTF `NUM_app`), sin construir | ✘ | M19 |
| Cargar código sin reiniciar | el script de cada app se carga en marcha | las funciones J7 van compiladas con el motor | ✘ | M19 + M20 |
| Código en las dos partes | el mismo fichero en servidor y cliente, en compartimentos SES | función J7 con mitad servidor y mitad cliente | ✔ | hecho |
| API del mundo | `add remove attach on off emit getTime getTimestamp chat getPlayer getPlayers createLayerMask raycast overlapSphere get set open load` | intentos, eventos, estado, rutas, `store`, `who` | ◐ | M20 |
| API de la app | `on off send sendTo emit create control configure`, `state`, `props`, `keepActive` | por función, no por objeto | ◐ | M20 |
| API del jugador | `teleport getBoneTransform setSessionAvatar damage heal applyEffect cancelEffect push screenshare` | solo `who` | ✘ | H2 + M20 |
| Guardar datos de un script | `world.get/set` (JSON, cada 1 s) | `api.store` (S4) | ✔ | hecho |
| Mensajes cliente ↔ servidor | `app.send/sendTo/on` | intentos y eventos con esquema y límite de ritmo | ✔ (validados) | hecho |
| Tomar el control (vehículo, cámara) | `app.control` | no | ✘ | M20 |
| Editar el script en el navegador | `CodeEditor`, `ScriptEditor`, recarga en caliente | no | ✘ | M20 + M22 |
| Rutas HTTP propias | no | `api.route` (J7) | ✔ (más) | hecho |
| Secretos solo en el servidor | no: script y propiedades llegan a todos | `api.sign`, `MOTOR_SECRET` | ✔ (más) | hecho |
| Traer lo hecho en Hyperfy | — | no | ✘ | H11 |

### 3.7 Administrar el mundo

| Capacidad | Hyperfy2 | Nosotros hoy | Estado | Fila |
|---|---|---|---|---|
| Ajustes del mundo | título, descripción, imagen, modelo, avatar por defecto, público, límite de personas | `aventura/ficha.json`: nombre, descripción, portada, avatar de todos, aforo (fichero) + panel «Ajustes del mundo» (cajón Entorno; título, imagen, avatar, límite; lo ven todos al momento) | ◐ | H7 |
| Roles | admin (`/admin` + `ADMIN_CODE`) y constructor (= admin, o todos si el mundo es público) | no | ✘ | H3 |
| Punto de aparición | `/spawn set\|clear` | fijo | ✘ | H3 |
| Límite de personas | `playerLimit` | `aforo` en la ficha; el que sobra lee «lleno n/aforo» (cierre 4004) | ✔ | H7 |
| Borrar el chat | `/chat clear` | no | ✘ | H3 |
| Ver cómo va el servidor | `/server stats` (CPU, memoria) | `/metrics`, `/metrics.prom`, `/sesiones`, `npm run sesiones` | ✔ (más) | hecho (la orden, H3) |

### 3.8 Servidor y operación

| Capacidad | Hyperfy2 | Nosotros hoy | Estado | Fila |
|---|---|---|---|---|
| Identidad sin registro | usuario por navegador, `authToken` en `localStorage` | invitado con billete firmado (I1) | ✔ | hecho |
| Guardado | SQLite cada 60 s | texto cada 1 s y al parar (S4) | ✔ | hecho |
| Salud del servidor | `/health`, `/status` | `/health`, `/metrics`, `/sesiones` | ✔ | hecho |
| Clientes sin pantalla | `NodeClient` | robots por WebSocket; enjambre de 1.000+ que mide | ✔ | hecho (P4 añade verbos) |
| Personas por mundo | todo a todos (O(N²)), sin medir | 1.000 medidos: tick p99 17–23 ms, 25,5 kbit/s cada una | ✔ (mucho más) | hecho |

### 3.9 VR y AR

| Capacidad | Hyperfy2 | Nosotros hoy | Estado | Fila |
|---|---|---|---|---|
| VR | `immersive-vr` con mandos | stick, giro a saltos, viñeta, panel; solo emulado | ◐ | J6 hecho; X1 |
| AR | `immersive-ar` si el aparato puede | suelo, anclaje, colocar; solo emulado | ◐ | J8 hecho; X1 |

Manos y teletransporte con arco (J10) no son de paridad: Hyperfy2 no los tiene.

## 4. Donde ya estamos por encima (y lo que no copiamos)

**Por encima:** 1.000 personas en una instancia con área de interés (Hyperfy manda todo a todos); el servidor
manda y valida (Hyperfy se fía de la posición del cliente); repetición determinista con la misma huella en V8 y
SpiderMonkey; WebGPU; cliente de 210 kB comprimido frente a 2,74 MB; fichas accesibles y regiones `aria-live`
(V1); cómo entra cada jugador (T1); móvil frío (P2); límites publicados (P1); catálogo de verbos para agentes
(J7, P3); rutas firmadas para la realidad cruzada (R1); secretos que no salen del servidor.

**No copiamos** (`docs/SABER.md` §4): mandar todo a todos; fiarse del cliente; `.hyp` como única verdad;
scripts y propiedades visibles para todos; guardar cada 60 s; 8 animaciones internas. Y dos más vistos hoy:
**subidas sin permiso** (`/api/upload` no mira quién sube: aquí solo quien construye, con tope y licencia) y
**un solo chat para todo el mundo** (aquí, el cercano por defecto y el de la zona con su propio límite).

## 5. Las paradas de paridad (qué ve Pablo)

- **PH1 «Se visita como Hyperfy2»** — J2, J1, J3, N1, H1, M6, H4, V6, H5, H6, M18. Entras con el móvil, el PC
  o las gafas con un avatar VRM; andas, corres y saltas por un escenario GLB sin atravesarlo; cielo y niebla
  del mundo; chat con nombres y bocadillos; suena música en un punto; una imagen y un vídeo en una pared.
- **PH2 «Se construye como Hyperfy2»** — H3, H9, M22, H7, H10, H2 (volar). Te haces admin; pulsas construir;
  sueltas un GLB desde el escritorio; lo mueves, giras, escalas, duplicas, borras y deshaces; cambias el
  cielo y el título; vuelas; sueltas tu VRM y ese eres tú. Otra persona lo ve al momento, y sigue ahí tras
  reiniciar el servidor.
- **PH3 «Se programa como Hyperfy2»** — M19, M20, J4, H2, H8, H11, H12, H13. Una app con script: una puerta con
  «E: abrir» (mantener pulsado), un asiento, partículas, un panel con un botón; y un mundo de Hyperfy de hoy
  importado con sus modelos y posiciones (los scripts quedan marcados para portar).
- **Paridad completa** = PH1 + PH2 + PH3 + voz (M17).

## 6. Orden

**Sesión con Opus:** H1 → M6 → H3 → H2 → M19 → M20.
- H1 primero: todo lo que se coloca cuelga de ahí (constructor, subidas, sonido, imagen, vídeo, importar).
- M6 después: sin colisión, un escenario GLB se atraviesa.
- H3 es corta, pero decide quién construye, quién vuela y quién sube ficheros.
- H2 necesita la velocidad vertical de J2.
- M19 y M20, al final: un script solo tiene sentido cuando hay objetos y física que mover.

**Turnos, orden propuesto para la paridad:** J2 → J1 → J3 → N1 → H4 → H6 → H12 → H8 → V6 → H5 → M18. Las que
esperan a otra fila (H5, H7, H9, H10, H11, H13 y M22) pasan a `pendiente` cuando esa fila queda `hecho`.

**Decidido por Pablo (15-10): sí.** J2, J1 y J3 van en la cola justo detrás de lo que queda de R1, delante de
las mecánicas de AR (R2–R4) y de la accesibilidad (V3–V7). Las filas H de turno siguen detrás de V7.
