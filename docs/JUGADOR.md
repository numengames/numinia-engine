# Lo que espera un jugador (catálogo J0)

Qué da por hecho cualquiera que entre en un mundo social / MMO en 2026. Sirve para decidir qué
construye el motor, qué la ciudad y en qué fila de `docs/BACKLOG.md` vive cada pieza.
Fuente principal: `../mmo-browser-study/FUNCIONALIDADES.md` (matriz por navegador) más el
conocimiento general de VRChat, Roblox, WoW/FFXIV y Hyperfy (no se ha consultado ninguna URL nueva
en este turno; lo que dependa de una versión concreta de esos productos está sin verificar).

## Cómo leerlo

- **Capa:** `motor` = sirve a cualquier mundo (MIT, este repo). `ciudad` = es contenido o regla de
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
| Cámara en 3.ª persona | Seguir al avatar con ratón o dedo ◐ | motor | Base | ratón / dedo / cabeza | P ajustes de cámara | bajo | N1 |
| Entrada táctil | Joystick virtual + cámara con el dedo ✘ | motor | Base | — / sí / — | cliente | bajo | N1 |
| Gamepad | Xbox/PS/genérico ✘ | motor | Base | sí / sí / mandos | cliente | bajo | N1 |
| Salto y altura | Saltar y subir desniveles ✘ | motor | Base | tecla / botón / botón | C altura, S sim (cambia la huella) | bajo | J2 |
| Correr / agacharse / sentarse | Estados de postura | motor | Mejorado | sí / sí / sí | C estado, M | bajo | J4 |
| Teletransporte a un punto | Saltar a un sitio marcado | ciudad | Base | menú / menú / apuntar | M, S | bajo | J5 |
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

## 3. Comunicarse

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Chat de texto cercano | Hablar a quien está cerca ✔ (J3: 20 m, y un canal de la zona) | motor | Base | caja / teclado del móvil / teclado virtual | M, S filtro por cercanía, P | bajo | J3 |
| Bocadillos | El texto sale sobre el avatar ✔ (J3: 6 s) | motor | Base | sí | P en mundo | bajo | J3 |
| Susurro y bloqueo personal | Hablar a uno / silenciar a uno | motor | Base | sí | M, G | bajo | F1 |
| Moderación básica | Silenciar, expulsar, denunciar con contexto | motor | Base | sí | S, roles | bajo | F1 |
| Voz por cercanía | Hablar por micrófono (WebRTC) | motor | Base | sí | servicio externo, S | alto | Frontera, sin fila |
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

## 5. Progresar

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Libro de misiones | Qué tengo que hacer y por dónde voy | ciudad | Base | panel / panel / panel 3D | C, S, G, P | bajo | J5 |
| Inventario | Lo que llevo, que no se pierde | motor | Base | panel | C, G | bajo | S4, J4 |
| Sellos y logros | Recuerdo de lo hecho | ciudad | Base | panel | G, P | bajo | J5 |
| Persistencia | Volver y encontrar lo mío | motor | Base | — | G | bajo | S4 |
| Eventos programados | Algo pasa a una hora | ciudad | Mejorado | — | S, calendario | bajo | Frontera, sin fila |

## 6. Orientarse

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Minimapa | Vista pequeña de lo cercano con marcadores | motor | Base | esquina / esquina / muñeca | P, datos del servidor | medio (redibujar solo al cambiar) | J5 |
| Mapa grande | El mundo entero | motor | Base | panel | P | bajo | J5 |
| Brújula y marcadores | Dirección hacia un objetivo | motor | Base | sí | P | bajo | J5 |
| Amigos en el mapa | Ver dónde están los míos | motor | Mejorado | sí | M, G | bajo | F1 |

## 7. Interfaz y ajustes

| Cosa | Qué es | Capa | Nivel | Escritorio / móvil / VR | Primitivas | Coste móvil | Fila |
|---|---|---|---|---|---|---|---|
| Menú de ajustes | Gráficos, sonido, controles, red, privacidad ✘ | motor | Base | panel | P, G local | bajo | N2 |
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
| Tamaño de texto y alto contraste | Ajustes de interfaz | motor | Base | N2 |
| Movimiento reducido | Nada se mueve solo | motor | Base | N2 |
| Menús con teclado y lector de pantalla | Interfaz navegable sin ratón | motor | Base | N2 |
| Paletas para daltonismo | Colores alternativos | motor | Mejorado | N2 |
| Subtítulos de voz | Texto de lo que se oye | motor | Mejorado | Frontera, sin fila |

## 10. Social

| Cosa | Qué es | Capa | Nivel | Primitivas | Fila |
|---|---|---|---|---|---|
| Amigos | Lista, saber si están | motor | Base | M, G (necesita identidad) | F1 |
| Grupo / fiesta | Ir juntos a una instancia | motor | Mejorado | S | F2 |
| Bloquear / denunciar | Seguridad personal | motor | Base | M, S | F1 |
| Roles de la casa | Invitado, ciudadano, moderador, Oráculo; el agente nunca modera | motor | Base | S, G | F1 |

## Qué falta en la cola

Piezas Base sin fila hasta hoy, añadidas a `docs/BACKLOG.md` en este turno:

- **N1** Entrada táctil, gamepad, 3.ª persona y pantalla completa (cliente). Función de juego: `espera a J7`.
- **N2** Menú de ajustes y accesibilidad básica (cliente, guardado local). `espera a J7`.
- **F1** Amigos, bloqueo, moderación y roles. Toca red y guardado: `para Opus`.
- **F2** Portales entre instancias y grupo. Toca red e instancias: `para Opus`.

Lo que queda marcado «Frontera, sin fila» (voz, vídeo en el mundo, subtítulos, eventos, idioma)
no entra en la cola hasta que Pablo lo pida: cuesta mucho por aparato o depende de un servicio externo.
