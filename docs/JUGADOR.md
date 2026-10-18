# Lo que espera un jugador (catálogo J0)

Qué da por hecho cualquiera que entre en un mundo social / MMO en 2026. Sirve para decidir qué
construye el motor, qué la ciudad y en qué fila de `docs/BACKLOG.md` vive cada pieza.
Fuente principal: `../mmo-browser-study/FUNCIONALIDADES.md` (matriz por navegador) más el
conocimiento general de VRChat, Roblox, WoW/FFXIV y Hyperfy (no se ha consultado ninguna URL nueva
en este turno; lo que dependa de una versión concreta de esos productos está sin verificar).

## Cómo leerlo

- **Capa:** `motor` = sirve a cualquier mundo (AGPL-3.0, este repo). `ciudad` = es contenido o regla de
  Numinia (AGPL, otro repo); el motor solo da las primitivas.
- **Nivel:** `Base` (todo navegador con WebGL2), `Mejorado` (donde exista la API), `Frontera`
  (opcional, tras un interruptor). Cada función se detecta por capacidad, nunca por nombre de navegador.
- **Primitivas:** C = componente con esquema · M = mensaje de red · S = sistema del servidor ·
  P = panel de interfaz · R = ruta HTTP · G = guardado (S4).
- **Coste móvil:** bajo (nada por cuadro) · medio (algo por cuadro, con tope) · alto (solo si el
  nivel del aparato lo permite). Todo con el principio «no calentar el móvil».
- **Fila:** quién lo construye. `J7+` = módulo de juego, empieza cuando J7 esté `hecho`.
  Estado hoy: ✔ ya existe · ◐ parcial · ✘ falta.

## 1. Moverse

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Andar y correr con colisión | Moverse por el suelo sin atravesar nada ✔ | motor | Base | teclado / joystick táctil / mando | C posición, M entrada, S sim | bajo | hecho (sim) |
| Cámara en 3.ª persona | Seguir al avatar con ratón o dedo ✔ (órbita, rueda hasta 1.ª persona; ver § Cámara) | motor | Base | ratón / dedo / cabeza | P ajustes de cámara | bajo | N1 |
| Entrada táctil | Joystick virtual + cámara con el dedo ✔ (izquierda anda, derecha mira, pellizco) | motor | Base | — / sí / — | cliente | bajo | N1 |
| Gamepad | Xbox/PS/genérico ◐ (palancas y LB/RB; sin probar con un mando real) | motor | Base | sí / sí / mandos | cliente | bajo | N1 |
| Salto y altura | Saltar y subir desniveles ✘ | motor | Base | tecla / botón / botón | C altura, S sim (cambia la huella) | bajo | J2 |
| Correr / agacharse / sentarse | Estados de postura | motor | Mejorado | sí / sí / sí | C estado, M | bajo | J4 |
| Teletransporte a un punto | Saltar a un sitio marcado (el mapa ya marca destinos: J5) | ciudad | Base | menú / menú / apuntar | M, S | bajo | J5 |
| Confort en VR | Giro a saltos, teletransporte, viñeta | motor | Base (en XR) | — / — / sí | cliente | medio | J6 |

## 2. Verse

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Avatares de otros | Ver a los demás moverse suave ✔ (robots) | motor | Base | sí | C, interpolación | medio | hecho |
| Avatar de verdad (VRM) | Cuerpo humanoide con animación | motor | Mejorado | tope 60 / 12 / 25 | C avatar, carga de asset | alto | J1 |
| Nombre sobre la cabeza | Etiqueta con el nombre ✔ (J3: el de la identidad, a 24 m) | motor | Base | sí / sí / sí | P en mundo | bajo | J3 |
| Elegir / cambiar avatar | Escoger cuerpo y nombre | ciudad | Base | menú | M, G | bajo | I1 |
| Gestos y emotes | Saludar, bailar con una tecla | motor | Base | tecla / botón / gesto | M, C | bajo | J7 (ejemplo) |
| Multitud lejana | Cientos de cuerpos baratos ◐ | motor | Base | sí | render instanciado | medio | A1, A4 |
| Modo foto | Una foto bonita del mundo para compartir ✔ (N13: P o el botón de la cámara; la interfaz se esconde, cámara libre a 12 m de ti, filtros Ámbar / Verdemar / Tinta dentro de la paleta, marco con el nombre del MUNDO; PNG a 2×: Compartir (Web Share, con el archivo) / Guardar / Copiar imagen / Copiar enlace `#foto=x,y,z,rumbo,inclinación,distancia`: quien lo abre recibe ese sitio como destino y la cámara mirando hacia él, y al llegar mira como la foto) | motor | Base | sí / sí / no en VR | P, cámara | ninguno hasta pulsar P | N13 |

## 3. Comunicarse

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Chat de texto cercano | Hablar a quien está cerca ✔ (J3: 20 m, y un canal de la zona) | motor | Base | caja / teclado del móvil / teclado virtual | M, S filtro por cercanía, P | bajo | J3 |
| Bocadillos | El texto sale sobre el avatar ✔ (J3: 6 s) | motor | Base | sí | P en mundo | bajo | J3 |
| Susurro y bloqueo personal | Hablar a uno / silenciar a uno | motor | Base | sí | M, G | bajo | F1 |
| Moderación básica | Silenciar, expulsar, denunciar con contexto | motor | Base | sí | S, roles | bajo | F1 |
| Voz por cercanía | Hablar por micrófono ✔ (U10: botón «Micrófono» o Q; te oye quien está a menos de 30 m; Opus o µ-law por el servidor, nunca a todos, no se graba) | motor | Base | sí / sí / falta en VR | S reenvía, P reproduce con panorama | medio | U10 |
| Subtítulos y traducción | Accesibilidad y otros idiomas | motor | Mejorado | sí | servidor | medio | Frontera, sin fila |

## 4. Interactuar

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Puertas y botones | Cosas que cambian de estado al usarlas | motor | Base | clic / toque / rayo | C estado, M «usar», S | bajo | J4 |
| Coger y soltar | Objeto que se lleva encima | motor | Base | sí / sí / mano | C, M, S | bajo | J4 |
| Zonas y disparadores | Entrar en un área hace algo | motor | Base | sí | S | bajo | J4 |
| Portales entre zonas | Pasar a otra instancia | motor | Base | sí | S, M | bajo | F2 |
| Paneles 3D | Texto, imagen, enlace en el mundo | motor | Base | sí / sí / sí | P | bajo | J6 |
| Enlaces fuera del mundo | Abrir una web avisando | motor | Base | sí | P | bajo | J4 |
| QR y sitio real | Algo real cambia el mundo | motor+ciudad | Mejorado | móvil | R, S | bajo | R1–R4 |
| Vídeo / pantalla en el mundo | Reproducir un medio compartido | motor | Mejorado | sí | C, reloj del servidor | alto | Frontera, sin fila |
| Hablar con personas (PNJ) | Conversación con respuestas; dan y avanzan misiones | motor (máquina) + aventura (textos) | Base | E o clic / botón «Hablar con…» / rayo ✘ | C, M, S | bajo (19 draw calls por robot) | J5 |
| Huecos (cuadros que esperan su obra) | Quien construye pincha el hueco (o E cerca): se abre «elegir fichero», la imagen sube y el servidor la encaja entera en el marco | motor | Base | E o clic / botón «Poner tu obra…» / rayo ✘ (no hay selector de ficheros dentro de VR) | M «rellenar», S | bajo (una textura; ≤ 2.048 px desde la página) | U12 |

## 5. Progresar

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Libro de misiones | Qué tengo que hacer y por dónde voy | ciudad | Base | panel / panel / panel 3D | C, S, G, P | bajo | J5 |
| Inventario | Lo que llevo, que no se pierde | motor | Base | panel | C, G | bajo | S4, J4 |
| Sellos y logros | Recuerdo de lo hecho | ciudad | Base | panel | G, P | bajo | J5 |
| Ficha de jugador | Quién soy, mi aparato y calidad, tiempo conectado, misiones, insignias, ajustes ◐ (tecla I; avatar e inventario, próximamente) | motor | Base | panel / panel / — | P | bajo | J11 (propuesta) |
| Persistencia | Volver y encontrar lo mío | motor | Base | — | G | bajo | S4 |
| Eventos programados | Algo pasa a una hora | ciudad | Mejorado | — | S, calendario | bajo | Frontera, sin fila |

Libro de misiones (J5, rama `misiones`): la máquina, los formatos y los paneles son del motor; las misiones, de la
aventura (`AVENTURA_DIR`). Tecla J o botón «Misiones» (y «Cerrar» dentro): activas con sus pasos, cada uno en uno de los
tres estados de la especificación de la TRG26 (U14): hecho (check verde, texto atenuado), ahora (un punto del color de
énfasis del mundo sobre una franja suya, el texto entero y dónde está; en un grupo, todos los que faltan del bloque) y
bloqueado (candado, texto atenuado: va después del bloque en curso); el lector de pantalla oye «Hecho», «Ahora» o
«Bloqueado». Se abre solo al aceptar una misión, en cuanto se cierra la conversación que te la dio (escritorio y móvil;
en VR no: su panel lleva las mismas marcas ✓ → □), y sin quitarte el teclado: sigues andando. «Seguir» (columna de luz
sobre el objetivo y el mapa lo marca), «Abandonar», y las hechas con su check y su insignia. Arriba, una línea con el
paso que sigues y a cuántos metros está. Al conseguir algo (te lo dan o lo coges), el aviso del centro lleva el icono de
objeto; cada paso hecho suena con tres notas cortas (al volumen de «Efectos»). E (o un clic, o el botón en el móvil)
habla con las personas y coge las cosas. Quien construye, cerca de un hueco (U12),
pone ahí su obra con E o pinchándolo: se abre el selector de ficheros.

Marcas (U14 (4)): sobre cada persona flota su nombre y, debajo, más pequeño, su oficio («Cosimo» / «Carpintero»).
Encima, una **«!» ámbar** si tiene algo para ti ahora (te ofrece una misión o te toca un paso con ella) y un **«✓» verde**
si ya hiciste lo suyo y no te queda nada con ella; sin marca, nada que hacer ahí por ahora. Una cosa de misión lleva
nombre y «!» solo mientras toca cogerla o usarla. Las marcas son tuyas: las decide el servidor con tu progreso y otro
jugador ve las suyas. El minimapa y el mapa grande las pintan igual (disco ámbar con «!», disco verde con «✓», encima de
la estrella del objetivo), y la lista del mapa dice el oficio junto al nombre; la conversación, también.

Momentos y esperas (U14 (5)): al hacer ciertos pasos ves un momento que es **solo tuyo** — en la TRG26, al darle las
tres piezas, Leonardo se pone las alas, sube, da una vuelta y aterriza en su sitio (unos 9 s, con sus líneas en el aviso
del centro, que el lector de pantalla también lee, y un par de sonidos cortos). Los demás jugadores lo siguen viendo en su
sitio y pueden hacer su misión a la vez; si sales y vuelves no se repite. Algún paso **espera** unos segundos antes de
poder hacerse (el cofre, hasta que Leonardo aterriza): mientras, sale con candado y la cuenta atrás en el libro y en la
línea de arriba («· en 7 s»), sin «!» ni objetivo en el mapa; si lo intentas antes, el aviso dice cuánto falta. Cuando
se abre, sale su «!». En VR la cámara no se mueve: el momento pasa delante de ti.

Al terminar una misión (U14 (6)), arriba en el centro aparece unos 4 segundos el cartel **«Misión completada»** con el
título de la misión y la insignia ganada, con los colores y la letra de títulos del mundo, y suena un acorde corto tras
las tres notas del paso (al volumen de «Efectos»; a 0, en silencio). No quita el teclado ni el ratón: sigues andando; el
lector de pantalla lo oye una vez (el aviso pequeño del centro se aparta mientras se ve). La insignia queda en tu libro y
en tu ficha (I); si tu navegador tiene identidad, queda además apuntada una vez en el mundo, para que la organización sepa
a quién se la dio. Una cosa de misión puede verse distinta para ti cuando ya la usaste (el cofre de la TRG26, abierto
solo para quien lo abrió): los demás la siguen viendo como antes y abren la suya.

## 6. Orientarse

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Minimapa | Vista pequeña de lo cercano con marcadores ◐ (esquina; norte arriba o gira con la cámara; en VR falta la muñeca; un mundo con `mapa.corte` ve de fondo la planta cortada, U14) | motor | Base | esquina / esquina / muñeca | P, datos del servidor | medio (redibujar solo al cambiar) | J5 |
| Mapa grande | El mundo entero ✔ (tecla M: vista cenital generada, destinos, lista HTML con direcciones; dentro de un edificio, su planta si el mundo dice `mapa.corte`, U14) | motor | Base | panel | P | bajo | J5 |
| Brújula y marcadores | Dirección hacia un objetivo ✔ (objetivos y destino pegados al borde del minimapa; columna de luz en el mundo) | motor | Base | sí | P | bajo | J5 |
| Amigos en el mapa | Ver dónde están los míos | motor | Mejorado | sí | M, G | bajo | F1 |

## 7. Interfaz y ajustes

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Menú de ajustes | Gráficos, sonido, controles, red, privacidad ✔ (N2: tecla O o el engranaje; el sonido se guarda y suena con H5) | motor | Base | panel | P, G local | bajo | N2 |
| Preajuste automático de calidad | El motor elige según el aparato y baja si se calienta | motor | Base | sí | cliente | **es** el ahorro | P2 |
| Ping, fps y pérdida visibles | Saber si el fallo es mío | motor | Base | sí | P | bajo | B3 |
| Entrar con un nombre | Invitado sin cuenta ✘ | motor | Base | sí | M | bajo | I1 |
| Idioma | Interfaz en varios idiomas | motor | Mejorado | sí | P | bajo | Frontera, sin fila |

## 8. VR, AR y móvil

| Cosa | Qué es | Capa | Nivel | Primitivas | Fila |
|---|---|---|---|---|---|
| Entrar en VR | Sesión inmersiva con mandos y manos | motor | Mejorado | cliente | J6 |
| AR en Android, Quest, Pico | Suelo, anclar un objeto | motor | Mejorado | cliente | J8 |
| iPhone | Solo «ver objeto» (Apple no da AR web) | motor | Mejorado | cliente | J8 |
| Móvil frío | Tope de cuadros, resolución contenida, nada si nada cambia | motor | Base | cliente | P2 |
| Vincular móvil con PC o visor | QR de sesión | motor | Base | M, G | I1 |
| Pantalla completa, orientación | Comodidad básica | motor | Base | cliente | N1 |

## 9. Accesibilidad

| Cosa | Qué es | Capa | Nivel | Fila |
|---|---|---|---|---|
| Tamaño de texto y alto contraste | Ajustes de interfaz ✔ (texto grande, alto contraste, tamaño de la interfaz) | motor | Base | N2 |
| Movimiento reducido | Nada se mueve solo ◐ (lo lee del sistema; sin saltitos ni animaciones de la interfaz; destellos y cámara con V7) | motor | Base | N2 |
| Menús con teclado y lector de pantalla | Interfaz navegable sin ratón ✔ en ajustes (HTML de verdad; cada panel nuevo, igual) | motor | Base | N2 |
| Paletas para daltonismo | Colores alternativos | motor | Mejorado | N2 |
| Subtítulos de voz | Texto de lo que se oye | motor | Mejorado | Frontera, sin fila |

## 10. Social

| Cosa | Qué es | Capa | Nivel | Primitivas | Fila |
|---|---|---|---|---|---|
| Amigos | Lista, saber si están | motor | Base | M, G (necesita identidad) | F1 |
| Grupo / fiesta | Ir juntos a una instancia | motor | Mejorado | S | F2 |
| Bloquear / denunciar | Seguridad personal | motor | Base | M, S | F1 |
| Roles de la casa | Invitado, ciudadano, moderador, Oráculo; el agente nunca modera | motor | Base | S, G | F1 |

## 11. Construir en el mundo (M22, como Hyperfy2 y Blender)

Quien tiene permiso (su rol; si el mundo deja construir a todos, cualquiera: un dueño lo cambia con `/construir
todos` o `/construir nadie`) abre el modo construir; quien no, no lo ve.
Todo cambio pasa por el servidor (`features/objetos`) y llega a todos al momento. Con ratón y teclado:

| Tecla o ratón | Qué hace |
|---|---|
| C, o Tab | Abrir y cerrar construir (Tab solo si has usado el ratón hace poco: con teclado, Tab sigue moviendo el foco) |
| Clic izquierdo | Seleccionar lo que hay bajo el puntero; en el suelo, o con Esc, nada seleccionado |
| 1 | Coger: lo seleccionado sigue al puntero sobre el suelo y sobre otros objetos (con paso); rueda = girar, Mayús + rueda = escalar; clic = soltar; Esc = devolverlo |
| 2 o G · 3 o R · 4 | Mover · girar · escalar con el gizmo: asas X roja, Y verde, Z azul |
| X, Y, Z | Solo ese eje (otra vez: todos), con mover, girar o escalar |
| T | Ejes del objeto (local) o del mundo |
| Ctrl mantenido | Sin paso (por defecto 0,5 m, 15°, escala 0,1; el panel deja elegir libre, 0,1, 0,5, 1 m y 5, 15, 45°) |
| Mayús + D o Ctrl + D | Duplicar: la copia queda seleccionada y cogida |
| Supr o Retroceso | Borrar |
| Ctrl + Z · Ctrl + Mayús + Z o Ctrl + Y | Deshacer · rehacer (cada arrastre es un paso) |
| P | Fijar o soltar (fijado: nadie lo mueve ni lo borra) |
| F | Encuadrar lo seleccionado (con la cámara nueva, N1) |
| N | Mostrar u ocultar el inspector (nombre, posición, giro en grados, escala, fijado, sólido, visible, volumen: Intro aplica) |
| Doble clic jugando | Abre construir con ese objeto seleccionado (U10) |
| Inspector de un sonido o un vídeo | «Se oye en»: solo dentro de la burbuja, toda la zona o todo el mundo; «Radio de la burbuja (m)» (U11) |
| Barra sobre el objeto | Coger, Mover, Girar, Escalar, Duplicar y 🗑 Borrar, encima de lo seleccionado (U10) |
| Botones derecho y central, rueda | La cámara (rama de la cámara, N1) |

U10: además de modelos .glb se suben (botón o soltando el fichero) **imágenes** .png .jpg .webp (un cuadro de pie),
**pantallas de vídeo** .mp4 .webm (se repiten, todos ven el mismo momento, su sonido se oye al acercarse) y **zonas de
sonido** .mp3 .ogg (una esfera translúcida: dentro se oye; Escalar cambia su radio; «se ve al jugar» la hace visible o
invisible; volumen). «Sólido» hace que las personas choquen con un objeto (servidor y página calculan la misma pared).

Sin ratón: el panel tiene botones de verdad para todo (colocar delante de ti, girar, desplazar, subir, escalar,
duplicar, fijar, borrar, deshacer, rehacer) y el inspector con campos con nombre. Un agente hace lo mismo con
`window.__numinia.constructor` (`seleccionar`, `transformar`, `colocarEn`, `modo`, `rehacer`…).

## Qué falta en la cola

Piezas Base sin fila hasta hoy, añadidas a `docs/BACKLOG.md` en este turno:

- **N1** Entrada táctil, gamepad, 3.ª persona y pantalla completa (cliente). Función de juego: `espera a J7`.
- **N2** Menú de ajustes y accesibilidad básica (cliente, guardado local). `espera a J7`.
- **F1** Amigos, bloqueo, moderación y roles. Toca red y guardado: `para Opus`.
- **F2** Portales entre instancias y grupo. Toca red e instancias: `para Opus`.

Lo que queda marcado «Frontera, sin fila» (voz, vídeo en el mundo, subtítulos, eventos, idioma)
no entra en la cola hasta que Pablo lo pida: cuesta mucho por aparato o depende de un servicio externo.

## Cámara y controles (N1)

La cámara vive en `packages/render/src/camara.ts` (la cuenta, en `camara-orbita.ts`, probada en
`test/camara.test.ts`; en el navegador, `tools/e2e-piernas/camara.mjs`). Moverse va **hacia donde mira la
cámara**: W = adelante en pantalla. La cámara solo gira cuando tú la giras (nunca se coloca sola detrás).

**Jugar (escritorio)**

| Hacer | Ratón | Teclado | Mando |
|---|---|---|---|
| Andar | — | WASD o flechas | palanca izquierda |
| Mirar alrededor | arrastra con el botón derecho, o con el izquierdo sobre el mundo (un clic sin mover sigue siendo un clic) | `,` y `.` giran; RePág y AvPág inclinan | palanca derecha |
| Acercar / alejar | rueda (de 1,5 a 20 m; una muesca más hacia dentro = 1.ª persona) | `+` y `−` (también los del teclado numérico) | RB acerca, LB aleja |
| 1.ª ↔ 3.ª persona | rueda | V | — |
| Cámara detrás de ti otra vez | — | Inicio | — |

**Móvil y tableta:** un dedo que empieza en la mitad izquierda es el joystick; en la mitad derecha, mira
alrededor; dos dedos pellizcan para acercar o alejar. Los botones de acciones y los de AR/VR no mueven nada.

**Construir** (la cámara se suelta del avatar cuando el constructor la pone en modo `construir`):
botón derecho = orbitar alrededor de un punto; botón central o Mayús + derecho = desplazar ese punto; Alt +
izquierdo = orbitar (panel táctil); rueda = acercar hacia lo que hay bajo el puntero (hasta 80 m); el botón
izquierdo solo es del constructor (elegir, mover con el gizmo). F (del constructor) mira a lo elegido; Inicio
vuelve sobre tu avatar; al cerrar construir, la cámara vuelve sola detrás de ti. Si andas mientras construyes,
la vista viaja contigo. En el móvil, dos dedos también desplazan.

Teclas reservadas por otras ramas (no usarlas para la cámara): W A S D y flechas, Espacio, Mayús, C, Tab, B, G,
H, E, Intro, 1–4, R, T, F, P, X, Y, Z, N, Supr/Retroceso, Ctrl+Z/Ctrl+Y, Esc. Con Ctrl, Alt o Meta, o escribiendo
en una caja de texto, las teclas de cámara no hacen nada.

**Altura y paredes (N1b):** la cámara sube y baja con tus pies (saltos, escaleras, el piso de una torre), un poco
por detrás para que el salto no sacuda la vista; una caída o un salto de más de 6 m los sigue al momento. Jugando,
una esfera de 0,2 m va de tu cabeza hacia la cámara: si toca algo **sólido**, la cámara se pone delante al instante
y vuelve hacia atrás despacio cuando el camino queda libre (como el `simpleCamLerp` de Hyperfy2 y el «spring arm»
de Unreal). Construyendo, la cámara atraviesa todo, como en un editor.

**Todavía no:** la cámara no choca con lo que no es sólido (modelos sin la casilla «sólido»; con la física, M6);
el avatar no se gira hacia donde anda (rama avatares).
