# Backlog del motor — lo que hacen los turnos (y nosotros)

**Regla:** cada turno desatendido coge la **primera** fila con estado `pendiente` y desatendible `sí`,
la hace entera (o la parte en trozos y lo dice), la deja con las puertas en verde y escribe una
entrada en `docs/RUNLOG.md`. El orden de la tabla ES la prioridad. Solo Pablo (o una sesión con él)
reordena. Estados: `pendiente` · `en curso` · `hecho` · `bloqueada` (con motivo) · `necesita aprobación` ·
`para Opus` (mucho razonamiento: la hace la sesión de Pablo con Opus, nunca un turno; Pablo, 15-10) ·
`espera a <ID>` (no empieza hasta que esa fila esté `hecho`).

## Principios que mandan sobre cualquier tarea (Pablo, 14-10 noche)

1. **Nativo para IA:** el motor tiene que ser el más fácil de entender y de navegar para un LLM —
   en el código (mapa de una página, contratos cortos por paquete, esquemas, errores que dicen cómo
   arreglarse, repeticiones deterministas) y dentro del mundo (los agentes entran como jugadores, ven
   el mundo como texto estructurado y actúan con verbos simples).
2. **Que no caliente los móviles (súper importante):** en móvil se dibuja lo justo — tope de cuadros,
   resolución contenida, nada de trabajo cuando no cambia nada, bajar calidad antes de que el aparato
   se caliente.
3. **Límites publicados:** quien quiera montar algo en el motor tiene que poder leer sus límites
   según servidor, aparato, navegador y gráfica, con cada número marcado como medido o estimado.

## Cola

| ID | Tarea | Estado | Desatendible |
|---|---|---|---|
| S1 | Kit de despliegue para un servidor pequeño (para mañana) | hecho | sí |
| S2 | Métricas del servidor (`/health`, `/metrics`) y enjambre contra una URL remota (para mañana) | hecho | sí |
| S5 | Batería de pruebas de capacidad para X3: banco de CPU, escalera/remojo/tormenta, robots que miden, steal, informe, `/metrics.prom` (`docs/MEDIDAS.md`) | hecho | sí |
| P1 | Ficha técnica: características y límites del motor (humana + `limits.json`) | hecho | sí |
| J0 | Catálogo de todo lo que espera un jugador (la receta para añadir funciones es de J7) | hecho | sí |
| J7 | Módulos de juego: añadir una función sin tocar el núcleo, con un ejemplo real (gestos) | hecho | no |
| T1 | Cómo entra cada jugador: el aparato, el navegador, la gráfica, la XR, los cuadros, el ping y la batería de cada sesión, guardados en el servidor (Pablo, 15-10) | hecho | sí |
| I1 | Identidad de invitado (sin vincular aparatos: Pablo, 15-10, «de momento no») | hecho | no |
| S4 | Persistencia mínima del mundo (puntos de enlace, inventario, cosas plantadas) | hecho | no |
| V1 | Ficha `accesible` en el esquema (nombre, función, estado, descripción, importancia, sonido, acciones) + reglas en J7: nombre hablado, sonido↔texto, verbo sin gesto; puerta en los tests | hecho | no |
| J9 | Estado y objetos de las funciones por cercanía (mundos grandes): a cada uno, solo lo que tiene cerca | hecho | no |
| B1 | HTTPS en la red de casa para móviles y visores (certificado propio, `/ws` en el mismo origen) | hecho | sí |
| J8 | AR de verdad: entrar en AR en Android, Quest 3 y Pico 4, suelo, anclar un objeto; iPhone en plano | hecho (emulado; falta probar en aparato real) | sí |
| J6 | VR de verdad: entrar en VR, moverse, mandos, giro a saltos, viñeta, panel 3D (emulador IWER) | hecho (emulado) | sí |
| R1 | Realidad cruzada 1 «Despertar»: un QR real hace que la plaza reaccione para todos (trozo 1 hecho; falta lo de «Falta de R1» en su detalle) | pendiente | sí |
| J2 | Salto, doble salto y correr en la simulación (cambia la huella fijada; permiso de Pablo, 14-10; delante de R2–R4 y V3–V7 por la paridad con Hyperfy2, Pablo 15-10) | hecho | sí |
| J2b | Aviso en pantalla cuando el servidor habla otro formato («recarga la página») | pendiente | sí |
| J1 | Avatares VRM de verdad (CC0) con animaciones CC0 en la plaza | hecho (trozo 1: avatares de la casa; elegir el tuyo → H10) | sí |
| J1b | Nombres, bocadillos y etiquetas a la altura de la cabeza de cada avatar VRM | pendiente | sí |
| J3 | Chat (cercano y de la zona) y bocadillos sobre los avatares, con nombres; lo que empieza por `/` va a las órdenes (H3) | hecho | sí |
| J3b | Chat en multitudes: tope por oyente y primero los nombres más cercanos | pendiente | sí |
| J3c | Escribir en VR (teclado del sistema o dictado) para el chat | pendiente | sí |
| R2 | Realidad cruzada 2 «Semilla del Conocimiento»: pregunta en un sitio real → semilla que se planta en el mundo | pendiente | sí |
| R3 | Realidad cruzada 3 «Célula del Prisma» + herramienta del DJ para marcar puntos reales | pendiente | sí |
| R4 | Realidad cruzada 4 «Caza de invisibles»: la cámara, el color y la hora deciden qué aparece | pendiente | sí |
| J10 | VR: teletransporte con arco, manos (hand-tracking) y viñeta ajustable desde un menú; resto de J6 (antes «J6b»: `auto.sh` solo reconoce letra + cifras) | en curso (manos, mandos, coger con la mano, diálogo en 3D y misión «Manos a la obra» hechos, emulados; faltan arco y viñeta en menú) | sí |
| J8b | AR: la plaza en miniatura y en vivo sobre tu mesa (gente, personas, cosas), manos y mandos, palancas para girar, escalar y andar | hecho (emulado; falta probar en Quest 3, Pico 4 y Android) | sí |
| P2 | Móvil frío: política de energía del cliente + puerta de coste por cuadro | hecho (sin medir en móvil real → X1) | sí |
| P3 | Nativo para IA v1: `llms.txt`, mapa, README-contrato por paquete, `npm run describe` | hecho | sí |
| J4 | Interacciones: puerta, botón y objeto que se coge, igual en escritorio, móvil y VR | hecho (v0.8.0: `features/puertas`, `features/botones`, `features/cogibles`; `MUNDO_DIR/interacciones.json`; sin aparato VR real) | sí |
| L1 | Lucha, trozo 1: función `lucha` (criatura = estado con coherencia y caja sólida; `golpear` con enfriamiento 12 ticks y daño 3-5 de `rngNext`; `golpe`/`aire`/`disuelta`/`vuelve`; reaparición 20 s), ficha `bestiario.ts` con el Guardián de Crisálida, bloque de la casa escalado a la caja con flash/tinte/«−N», `MUNDO_DIR/lucha.json`; diseño: `mmo-browser-study/SISTEMA-DE-LUCHA-Y-BESTIARIO.md` | hecho (18-10, rama `lucha/trozo-1`) | sí |
| L2 | Lucha, trozo 2: estados del jugador (Desestabilizado → Colapsado → Aletargado, como el canon: sin puntos de vida) como efectos del servidor sobre la persona (velocidad, HUD, vuelta a `aparicion`), en el `store` por invitado | espera a L1 | sí |
| L3 | Lucha, trozo 3: la criatura se mueve y golpea — modos quieta/alerta/herida, aggro y vuelta a casa, tope de 8 en alerta por zona, caja sólida que sigue al cuerpo; límites a `limits.json`; `combate: true` por zona en `entorno.json` | espera a L2 | sí |
| L4 | Lucha, trozo 4: anclajes — acción `lucha.anclaje` para la lógica de objetos (ADR-078), multiplicador de daño y capacidad que se pierde; los tres del Guardián y los del Dragón | espera a L3 | sí |
| L5 | Lucha, trozo 5: clips `golpear` y `recibir` (CC0/QAL) en la biblioteca VRM de la casa, giro de brazo por código cuando el VRM no los trae, sacudida de cámara al recibir (viñeta en visor) | espera a L1 | sí |
| L6 | Lucha, trozo 6: golpe a distancia con retardo `1+floor(dist/6)` ticks y trazo dibujado (Ostramir, Thámakar); sin puntería ni balística (ADR-073) | espera a L3 | sí |
| L7 | Bestiario: las otras 11 fichas de `bestiario.ts` con sus modelos placeholder (caja, cadena de segmentos, instanciado para el enjambre) y pruebas de cada anclaje | espera a L4 | sí |
| L8 | Lucha: PVP (`objetivo: p:<entidad>`, norma `pvp` del mundo y de la zona, consentimiento) | necesita aprobación (Pablo: ¿hay PVP y dónde?) | no |
| L9 | Lucha: cerebro de criatura por agente (`cerebro: "agente"`: un pase `kind:"agent"` manda `mover`/`golpear` con las mismas tasas) | espera a L3 y P5b | sí |
| L10 | Bestiario: encargar o buscar modelos CC0 low-poly con las fichas de aspecto del diseño (12 criaturas, ≤ 3 k triángulos, 1 material, sin esqueleto) | necesita aprobación (Pablo: ¿se encargan o se buscan?) | no |
| J5 | Libro de misiones, mapa y minimapa con marcadores | hecho (panel en la muñeca en VR → J13) | sí |
| J11 | Personas que dan misiones (`pnj@1`: árbol de diálogo, quién da y recibe qué) | hecho | sí |
| J12 | Ficha de jugador: nombre, aparato y calidad, tiempo, misiones e insignias, ajustes | hecho (falta retrato → H10 e inventario) | sí |
| J13 | Panel de muñeca en VR: minimapa, lo cercano y la ficha en 3D | pendiente | sí |
| J19 | VR: ajuste de «altura de pie» en el motor, por si el suelo que dan las gafas está mal (en el Quest 3S de Pablo, 16-10, los ojos de pie salían a 1,11 m: suelo del visor medio metro alto) | pendiente (deseable, no urgente) | sí |
| J20 | Ajuste (N2): en VR, andar hacia donde miras (hoy) o hacia donde apunta el mando izquierdo (Pablo, 16-10: preferencia de cada uno) | pendiente | sí |
| J18 | VR: menú que sale al girar la muñeca (mano o mando), y pintar y crear objetos con las manos en el mundo, al estilo de las apps de pintura en VR (Pablo, 16-10: «me parece la bomba»; planificar antes de construir) | pendiente (planificar) | no |
| J14 | Dibujo barato de personas (LOD o una pieza; hoy el robot son 19 llamadas) | en curso (lo que no anima se hornea: el robot, 3 llamadas; falta LOD) | sí |
| J15 | Marcas «!» y «?» sobre quien tiene algo para ti (por jugador) | pendiente | sí |
| J16 | Escribir aventuras con un LLM: receta y `node tools/aventura.ts` como comprobación | pendiente | sí |
| J21 | Mundos verticales (Torre de los Alquimistas): `pnj@1` gana `posicion.y` opcional (0–30 m), `cosa@1` sube su tope de 3 a 30; el estado lo lleva (pnj v2, misiones v2) y la página dibuja a esa altura, con el nombre encima | hecho (16-10, rama `torre/aparicion-y-altura`; `test/altura.test.ts`) | sí |
| J22 | El alcance mira la altura: `api.position` da `y`; `api.within` y el aviso «E:» de la página (`reachable(x, z, y)`) exigen una diferencia de altura ≤ 2,5 m (`ALCANCE_ALTURA_M`) cuando la cosa tiene `y`; `llega_a` admite `y` opcional (0–30) con la misma regla | hecho (16-10, rama `torre/aparicion-y-altura`; sin `y`, todo como antes) | sí |
| J23 | Grabar vídeo desde dentro del mundo para compartirlo (la vista del juego y su sonido, sin la interfaz si se quiere), y que una IA conectada también pueda grabar lo que ve para analizar partidas (Pablo, 16-10: «no es ahora») | pendiente (planificar) | sí |
| E1 | Simulador de economías de juego (herramienta de diseño, `tools/economia/`): diagrama como datos + N ticks deterministas; modelos de la Tabla de Prestigio y del ritmo de Reliquias; método en `../mmo-browser-study/MAQUINACIONES-APRENDIZAJE.md` (Pablo, 18-10) | hecho (sin conectar al motor; falta el modelo de daño y, si hace falta, un editor visual propio) | sí |
| N1 | Entrada táctil, gamepad, cámara en 3.ª persona y pantalla completa (de `docs/JUGADOR.md`) | hecho (sin probar en aparato real) | sí |
| N1b | Cámara que sigue tu altura (saltos, pisos) y no atraviesa lo sólido (esfera barrida contra las cajas sólidas; lo no sólido, con M6); bajar escalones sin «caer» (pegarse al suelo, 0,45 m) y el avatar no «salta» sobre un tejado o una escalera | hecho | sí |
| N2 | Menú de ajustes y accesibilidad básica, guardado local (de `docs/JUGADOR.md`) | hecho | sí |
| N3 | Ajustes dentro de VR: panel 3D legible, con su gemelo HTML | pendiente | sí |
| N4 | Cambiar teclas (el tipo `tecla` deja de ser solo para ver; choques con las reservadas) | pendiente | sí |
| U1 | Pantalla de carga de verdad (armazón ≤ 14 kB en la página + controlador; fases reales; atasco con «Reintentar») y reconexión cuando se cae el socket | pendiente | sí |
| U2 | Un solo dueño de las teclas (capas) + menú del juego con diálogos nativos (Continuar, Ajustes, Controles y ayuda, Zona de usuario, Gente, Salir); ⚙ siempre en móvil | pendiente | sí |
| U3 | Marcos: formato `marco@1` (id estable, ancla, desplazamiento relativo, visibilidad `requiere`, árbol con nombre hablado y verbo) + pintor de página; el HUD de hoy pasa a marcos | para Opus | no |
| U10 | Pedido de Pablo (16-10): misiones que se ven (el libro ya no queda tras el chat), barra sobre el objeto con Borrar, asas más grandes, doble clic para editar; imágenes, pantallas de vídeo y zonas de sonido (esfera visible o invisible, volumen); «sólido» (colisión en la simulación); micrófono por cercanía | hecho (escritorio; VR y móvil sin probar) | sí |
| U11 | Pedido de Pablo (16-10, tras probar U10): misiones a la derecha y mapa arriba a la derecha; botones de icono (casa de numinia.org, Phosphor) y paneles con el Numinia Design System (STD-023: Nocturno, Geist, dos radios); el vídeo lleva burbuja de sonido; quién oye un sonido o un vídeo: solo la burbuja, toda la zona o todo el mundo; radio a mano | hecho (escritorio) | sí |
| U12 | Pedido de Pablo (16-10, plantillas de mundo): huecos — un cuadro que espera su obra; se pincha (o E cerca), se elige la imagen en el ordenador y el servidor la encaja entera en el marco; vaciarlo devuelve el cartel | hecho (escritorio; VR y móvil sin probar) | sí |
| U13 | Pedido de Pablo (17-10): icono de Numinia en la biblioteca/tienda del Quest que lleve siempre al mundo — `manifest.webmanifest` (nombre Numinia, `display: fullscreen`, iconos 192/512 con el escarabeo Khepri) + enlace en `index.html`; «Guardar en la biblioteca» del navegador crea el icono y abre a pantalla completa, sin barra de direcciones | hecho (comprobado en un Quest real por USB: `Page.getAppManifest`/`getInstallabilityErrors` sin errores) | sí |
| U14 | Pedido de Pablo (16-10, plantillas: el salón de eventos, la primera vez con la TRG26 «El vuelo del Maestro»): el aire de cada mundo en su página (`tema` en ficha@1), pasos en cualquier orden, libro con estados, marcas sobre las personas, una secuencia que solo ve quien la provoca, un cofre de dos aspectos y un premio que se da una sola vez | en curso (trozos 1, el tema; 2, pasos en cualquier orden; el mapa cortado; 3, el libro con estados; 4, las marcas sobre las personas, 5, la secuencia que solo ve quien la provoca y la espera antes de un paso, y 6, el cofre de dos aspectos y el premio apuntado una vez, hechos; falta la plantilla) | no |
| N6 | Pedido de Pablo (17-10): el Director de juego (DJ) — quien dirige una aventura o un evento en un mundo. No es un rol nuevo: la acción `dirigir` = STD-052 `manage-rituals` (Moderación la tiene). Corte 1: escenas de la aventura (`escena@1`, `aventura/escenas/<id>.json`: preset y/o entorno parcial sobre el del mundo, más una línea), narrar a todos y convocar (una invitación «Ir / Ahora no»; nadie se mueve sin su sí), panel «Dirigir» (K) en escritorio y móvil y órdenes `/escenas`, `/escena`, `/narrar`, `/convocar` (sirven en VR con teclado); escenas en galería, eventos y auditorio. Siguen: dar cosas, mostrar/ocultar y diario (corte 2), agarre por objeto y Semillas (3, tras decidirlo con Pablo), menú de muñeca del DJ en VR (4), IA ayudante y DJ IA (5), asiento del DJ en la mesa de rol (6) | corte 1 hecho | no |
| N16 | Pedido de Pablo (17-10, camino A: «ir con quien está conectado ahora», sin cuenta; la lista de amigos guardada espera a la decisión de identidad): teletransporte — panel «Gente» (L, botón de personas) y `/ir <nombre>` te llevan junto a alguien conectado en este mundo; el servidor decide (mismo mundo, sitio libre a 1,2–3 m sin sólidos y en su suelo — `sitioLibre` de la sim —, un viaje cada 10 s), cada cual puede no dejarse encontrar (`/encontrable no`) y lo apagan dueños, administración y quien dirige (`/teletransporte no`, se guarda). `entorno.json` `aparicionFoto: true` (apagado por defecto) deja aparecer en el sitio del enlace de una foto (N13), una vez, al entrar. Efecto «rayo»: 3 variantes al azar elegidas por el servidor (colapsa al centro, haz hacia arriba, bloques digitales), 2–3 draw calls 1,4 s, como mucho 3 a la vez en Quest (nivel B), ninguno en el nivel D; el cuerpo se esconde mientras la luz lo sostiene | hecho (18-10, rama `noche/teletransporte`; `test/teletransporte.test.ts`, `tools/e2e-piernas/teletransporte.mjs`) | no |
| N17 | Pedido de Pablo (17-10, «una página web dentro del mundo, como Hyperfy»; motor-vr t_e089ae2b): pantallas web (`features/web`). En ordenador y móvil, la página de verdad en un `iframe` colocado sobre un panel del mundo con transformaciones CSS 3D (CSS3DRenderer de three.js, cargado con la primera pantalla); se lee, se desplaza y se pulsa; solo cerca (16 m), de frente y sin una pared sólida (U10) en medio; un clic en el mundo devuelve el teclado a andar. En VR el DOM no entra en la imagen del visor: el panel es la vista previa y su botón «Abrir fuera de VR» (rayo + gatillo) sale de VR y ofrece el enlace. Un sitio que no se deja enmarcar (X-Frame-Options / CSP `frame-ancestors`, lo pregunta el servidor una vez) es una tarjeta con «Abrir» en todos los dispositivos: hoy numinia.org y /missions/ (DENY + `frame-ancestors 'none'`); para verlas dentro, numinia.org tendría que añadir `frame-ancestors` con los dominios del motor. Seguridad: lista blanca por mundo (`entorno/web.json`, viaja en el zip), solo https (http solo 127.0.0.1/localhost, pruebas), nunca el origen del motor, `sandbox` sin navegación de la página de arriba, Permissions Policy sin cámara/micrófono/geolocalización, sin referrer; poner y quitar: dueños y DJ (`dirigir`). Chat: /web, /web <url> [título], /web quitar <id>. Límite conocido: el DOM se pinta encima del lienzo, así que un avatar entre la cámara y la pantalla queda detrás de la página (siguiente corte: «agujero» en el lienzo con alfa, la técnica de Hyperfy, que pide lienzo transparente) | corte 1 hecho | no |
| U14 | Pedido de Pablo (17-10, en directo): mandos del vídeo — pausar, parar y mi propio volumen; panel al E/clic (igual en VR con el mando, J4/xr.ts). DOS preguntas de fondo escritas, no decididas: (a) ¿el mando es MÍO o del MUNDO? (b) si es del mundo, qué permiso de la organización (STD-052) lo exige. Lo mío (pausa/parar/volumen, nunca al servidor) es lo que hay; lo del mundo (cine compartido) no se construye hasta decidir (a) y (b) | hecho (escritorio; mando de VR sin probar en visor real, panel visual solo en pantalla plana — ver J13/panel de muñeca) | sí |
| U15 | Después de U14, en tarjetas aparte (pedido de Pablo 17-10): vídeo 360/180 (esfera en vez de plano) y pantalla curva, y el resto de «chuladas» de reproductor | pendiente | no |
| U4 | Zona de usuario: quién eres, avatar, misiones e insignias, lo que he construido (lista, cuota, borrar, descargar), privacidad y datos, seguridad; el informe de sesión (T1) pasa a pedir consentimiento | espera a U2 | sí |
| I3 | «Guardar mi progreso» con una llave de acceso (passkey) del propio motor, sin correo (Pablo, 15-10: camino B); la llave queda unida al invitado | pendiente | sí |
| U5 | «Editar interfaz»: mover sin arrastrar (cuadrícula 3×3, números, flechas, lista), 5 disposiciones por clase de aparato, copiar y pegar `nl1.` sin código | espera a U3 | sí |
| U6 | Pintor de VR para los marcos (lienzo en un plano; capa nítida si la concede), menú invocado y quieto en el espacio (cambia J13) | espera a U3 | sí |
| U7 | Addons de datos (sin código) + vistas de solo lectura + gestor de addons + rangos medidos + modo seguro + lista de bloqueo | espera a U5 | sí |
| U8 | Paquetes de recursos y temas (`paquete.json`, huella y tamaño declarados, licencia obligatoria); el aspecto de Numinia como tema; el mundo declara sus paquetes y se pide permiso una vez | espera a U3, M16 | sí |
| U9 | Addons con código encerrado: QuickJS en un Worker de otro origen, plazo 4 ms, 8 MB, se apaga tras 3 fallos en 10 s; medir antes en un móvil | para Opus | no |
| V3 | Voz propia del motor: cola con prioridades, se puede cortar, baja lo demás (la región `aria-live` ya existe, V1) | pendiente | sí |
| V4 | Lista HTML de lo cercano (escritorio y móvil) que leen NVDA, VoiceOver y TalkBack, navegable con teclado | pendiente | sí |
| V5 | «¿Dónde estoy / qué hay cerca / dónde está X / quién hay?» contestado desde los datos, sin modelo | espera a V3 | sí |
| V6 | Audio espacial que sigue a la cabeza + volumen aparte para avisos + modo mono + baliza simple (un sonido fijo en el destino) | pendiente | sí |
| V7 | Comodidad y seguridad: limitador de destellos (≤ 3/s), modo sentado, «menos movimiento» del sistema; giro a saltos y viñeta ya en J6 | pendiente | sí |
| H1 | Paridad Hyperfy2: objetos del mundo — colocar un GLB, moverlo, borrarlo, deshacer, en vivo, guardado como texto (sus `blueprints` + `entities`) | hecho | no |
| H3 | Roles del mundo = los de numinia.com (STD-051/052; Pablo 15-10: «cada organización tiene sus roles; de momento los de Numinia»), no los de Hyperfy. Primer corte (H3a): plantilla «Comunidad» (Administración, Moderación, @todos), dueños con `/dueño <código>`, órdenes `/roles` `/dar` `/quitar` `/silenciar` `/echar` `/vetar` `/perdonar` `/solo-miembros` con la regla de altura; diseño `../mmo-browser-study/ROLES-MOTOR-Y-NUMINIA.md` | hecho (H3a) | sí |
| H3b | El pase de numinia.com: el motor acepta un pase Ed25519 firmado por numinia.com (persona, organización, mundo, permisos, altura, 10 min, en `#`), clave pública en el instalador; sin pase = visitante. Hecho de punta a punta (verificador, `MOTOR_PASE_*`, roles por pase, mensaje PASE, página) | hecho | sí |
| H3c | Órdenes de Hyperfy que faltan: `/nombre` (nunca acabado en « · IA»), `/aparecer`, `/chat borrar` (con `manage-organization`) | pendiente | sí |
| H2 | Paridad Hyperfy2: lo que el servidor le hace a un jugador (teletransportar, congelar, frenar, empujar, sentarse, volar, salud) como entradas grabadas de la simulación | para Opus | no |
| H4 | Paridad Hyperfy2: entorno — cielo, sol, niebla, mapa HDR y viento desde un JSON con esquema (su nodo `Sky`) | hecho | sí |
| H4b | Entorno fino en el panel: colores de cielo, niebla y sol; fondo y HDR de la biblioteca o subidos (H9) | pendiente | sí |
| H4c | Agua mejor: espuma de orilla, refracción en A, ríos; olas que mueven cosas (con M6) | pendiente | sí |
| H6 | Paridad Hyperfy2: imagen y paneles de interfaz en el mundo (sus nodos `Image` y `UI`), cada panel con gemelo HTML | pendiente | sí |
| H12 | Paridad Hyperfy2: sombras y posprocesado por nivel de aparato, elegibles en ajustes | en curso (sombras por nivel hechas; posprocesado → H12b) | sí |
| H12b | Sombras en cascada o suaves y posprocesado (bloom, AO), solo en A | pendiente | sí |
| H12c | Compilar el entorno antes de dibujarlo (`compileAsync`): sin tirón al cambiarlo | pendiente | sí |
| H8 | Paridad Hyperfy2: partículas en GPU (su nodo `Particles`) con tope por aparato y limitador de destellos | hecho (primera parte; emisores como fichero → H8b) | sí |
| H8b | Emisores de partículas como fichero (`particulas@1`) para que una aventura traiga los suyos | pendiente | sí |
| H5 | Paridad Hyperfy2: sonido del mundo — fuentes en objetos y puntos, grupos música/efectos (su nodo `Audio`) | espera a V6 | sí |
| H9 | Paridad Hyperfy2: subir ficheros arrastrando — por hash, con tope, solo quien construye | hecho | sí |
| H9b | Subidas: borrar lo que nadie usa y cupo por identidad | espera a H3 | sí |
| H7 | Paridad Hyperfy2: ajustes del mundo — título, descripción, imagen, escenario, avatar por defecto, abierto a construir, límite de personas | hecho (primer corte: fichero `ficha.json` con avatar y aforo, aviso al lleno; falta el panel) | sí |
| H10 | Paridad Hyperfy2: tu avatar — elegir uno de la casa o soltar tu VRM, guardado con tu identidad | pendiente | sí |
| H13 | Paridad Hyperfy2: nivel de detalle (LOD) de los modelos, generado en la ingesta | espera a M21 | sí |
| H11 | Paridad Hyperfy2: importar de Hyperfy — `.hyp` → carpeta de app; un mundo entero → carpeta del mundo | espera a M19 | sí |
| H14 | El mundo en un zip: bajarlo y subirlo en `/mundo` con el código de administración (`mundo-zip.ts`, `zip.ts`); falta: la aventura dentro del zip, la sala de numinia.com | hecho (primer corte) | sí |
| H15 | Dónde aparece la gente: `aparicion { x, z, radio }` opcional en `entorno.json` (radio 1–40 m, x y z ±460; viaja en la carpeta y el zip del mundo, nunca por el cable) → `InstanceOptions.aparicion` → `spawnAvatar`; sin él, el cuadrado de 40 m de siempre con las mismas tiradas (huella de referencia `93b192c8` intacta) | hecho (16-10, rama `torre/aparicion-y-altura`) | sí |
| F1 | Amigos, bloqueo y moderación (los roles son H3; toca red y guardado; de `docs/JUGADOR.md`). Primer corte (F1a, 18-10): `/silenciar` calla chat Y voz, se guarda con el mundo y sobrevive reinicios; `/hablar <persona>` lo levanta; bloqueo personal `/bloquear` `/desbloquear <persona>` (solo para quien bloquea: ni chat ni voz; guardado por identidad) y botón «Silenciar/Oír» en Gente; aviso accesible al silenciado. Sin tocar el tope de voces (D-024). Queda: amigos, denunciar | hecho (F1a) | sí |
| F2 | Portales entre instancias y grupo (toca red e instancias; de `docs/JUGADOR.md`) | para Opus | no |
| A1 | Página de multitud (50/200/1.000/2.000 robots, completos vs horneados) | pendiente | sí |
| D1 | Puerta de tipos: TypeScript 7 estricto, 0 errores | pendiente | sí |
| S3 | Dilatación de tiempo cuando el tick no cabe (4.000 bots) | para Opus | no |
| P4a | Habitante IA sin cerebro (E0): entra como jugador con billete de agente, «· IA» puesto por el servidor, servicio aparte `numinia-habitantes` (Lía en la plaza) | hecho | sí |
| P4b | Sentidos y verbos completos del habitante: su ficha (V1), verbos del catálogo por escalón, permiso por rol (H3), guía determinista con el árbol de Alma | pendiente | sí |
| A2 | Banco de multitud con la GPU real (si Chromium la usa sin pantalla) | pendiente | sí |
| A3 | Normales horneadas en la animación de textura (luz correcta al girar) | pendiente | sí |
| A4 | Robots en la plaza: cercanos completos, lejanos horneados | pendiente | sí |
| B3 | Telemetría en el visor: p99 de cuadro y cuadros perdidos | hecho (dentro de T1; sin probar en un visor real → X1) | sí |
| D2 | Puerta de tamaño del cliente (meta ≤ 300 kB comprimido) | puerta hecha (18-10: `npm run tamano` y en `gates`, tope 480 kB); recorte pendiente (hoy 434,9 kB) | sí |
| D3 | Fuzz de todos los decodificadores de red | pendiente | sí |
| D4 | Los mensajes del núcleo (entrada, snapshot, bienvenida) salen del esquema, como ya los de las funciones (J7) | para Opus | no |
| M16 | Carga de zonas: manifiesto por zona (arranque / fondo / perezoso), sha256 por fichero, caché del navegador por hash | pendiente | sí |
| O2 | Origen de reserva fuera de Cloudflare: el cliente prueba una lista de orígenes (LaLiga bloquea rangos de Cloudflare en España) | espera a M16 | sí |
| M21 | Ingesta de contenido: glTF → validar presupuestos y licencia → comprimir (colisionadores sin cuantizar) → publicar por hash | espera a M16 | sí |
| M23 | CLI completa: `check`, `shot`, `diff-shot`, `replay` (ya hay `run` y `describe`) | pendiente | sí |
| M25 | Imágenes de referencia en los dos backends (WebGPU y WebGL2), fuera de las puertas por defecto | pendiente | sí |
| V10 | Avisos de personas: quién se acerca, quién habla, quién me mira, con tope en multitudes | espera a V3 | sí |
| V11 | Baja visión: contraste por función, contornos en lo importante, lupa, texto a 200 % (coste medido) | pendiente | sí |
| V14 | Página compañera accesible: el móvil o el PC muestra lo que pasa en las gafas (chat, avisos, lista) | espera a V4 | sí |
| M18 | Medios: vídeo en pantallas del mundo sincronizado con el reloj del servidor (función J7) | pendiente | sí |
| V8 | Perfil de accesibilidad en la identidad, aplicado antes del primer fotograma en cualquier aparato | pendiente | sí |
| P5a | El puente nuevo y el primer cerebro (E2 contesta, E4 construye si el mundo deja): clave sin eco (`--clave-ia`), topes, `<material>`, herramientas comprobadas en código | hecho (primer corte; falta: E1, probarlo con Claude en el VPS, D7 revisión del contrato) | no |
| P5b | Iniciativa por evento (E3), gestos con clips, persona en `.md`, medidor de consumo por habitante y por mundo | espera a P5a | sí |
| V12 | Guía IA: un agente que acompaña, describe y lleva (primero desde datos) | espera a P4b | sí |
| M6 | Colisión con el escenario y física básica: malla GLB (trimesh + BVH propio en enteros, sin cambiar la huella), zonas que disparan, rayos; Rapier solo si hacen falta dinámicos | en curso (h1-h7 hechas 18-10) | no |
| M6b | Terreno con altura (relieve y suelos pintados por capas) | espera a M6 | no |
| M10 | Servidor de instancia completo: regiones en hilos (horizonte de 5.000) y copias cuando se llena | para Opus | no |
| V9 | Mapa de caminos (navmesh) en el servidor + guía paso a paso + «mírame al objetivo» + escáner direccional | para Opus | no |
| M19 | Formato de app: carpeta de texto (`app.json` + `main.ts` + activos por hash) → paquete glTF con `NUM_app` | para Opus | no |
| M20 | Scripts de mundo en el servidor, en sandbox (SES) y con límite de CPU | para Opus | no |
| M9 | WebTransport como escalón de arriba detrás de la misma interfaz que WebSocket | para Opus | no |
| M22 | Constructor en el mundo, en vivo (paridad Hyperfy2): gizmos, duplicar, borrar, deshacer, soltar ficheros, inspector, biblioteca; para personas y agentes de IA, según su rol (el panel mínimo ya existe: H1) | hecho (escritorio; VR y móvil → M22b) | sí |
| M22b | Constructor en VR y en el móvil (gizmo con el mando y con el dedo) | pendiente | sí |
| M22c | Constructor: puntos de encaje, selección múltiple y jerarquía | en progreso (encaje + selección múltiple + mover/borrar en grupo, deshacer atómico; faltan caja de arrastre y jerarquía) | sí |
| M26 | Servidor MCP del motor: leer zona (con el cuerpo de P4), proponer cambio, abrir PR (nunca publica solo). Trozo 1 hecho (ADR-080, rama `agentes/puerta`): la puerta de los agentes de fuera y un puente MCP por stdio junto al agente; falta el MCP servido por el propio mundo (HTTPS) | espera a M19, P4b | sí |
| IA-ORG | IAs de organización (motor): una IA que pertenece a una organización de numinia.com entra con un pase `kind:"agent"` (`activa`/`dormida`) que pide cada ~8 min a `POST {NUMINIA_URL}/api/agents/pass`; el motor la cierra con 4003 si su pase caduca sin renovar, acepta un PASE a mitad de sesión (dormida = sin construir), la lista en `GET /agentes` (`organizacion: true`) y el puente `tools/mcp-mundo.ts` tiene modo organización. Hecho del lado del motor (rama `agentes/de-organizacion`); la mitad de numinia.com (till, ruta, panel «Agentes») va aparte | hecho (motor). Corte 2 (rama `agentes/token`): el puente acepta `AGENTE_TOKEN` (`ntk_…`, `Authorization: Bearer`, cuerpo `{org, agent, aud}`) en vez de la clave; 401 = final; el token nunca se imprime | sí |
| O4 | Seguridad: billete firmado para entrar a una instancia, tope de conexiones por IP, exportar y borrar lo tuyo | pendiente | sí |
| O3 | Observabilidad: panel y alertas sobre `/metrics` del servidor real | espera a X3 | sí |
| M17 | Voz por cercanía (LiveKit) con tope de voces audibles, DTX y modo escenario | necesita aprobación (Pablo: cuántas voces a la vez, `docs/SABER.md` §5) | no |
| V13 | Subtítulos del chat de voz (con quién habla y desde dónde) + texto que habla | espera a M17 | sí |
| X1 | Probar en Quest 3 y Pico 4 | pendiente | no |
| X2 | Probar Safari de verdad (iPhone o Mac) | pendiente | no |
| X3 | Montarlo en un servidor pequeño real y medir sus límites (con Pablo, 15-10) | pendiente | no |
| X4 | Nombre del motor (Pablo y Christian, 15-10) | pendiente | no |
| X5 | Medir temperatura y batería en un Android real (`adb`) | pendiente | no |
| X6 | GitHub publica el instalador (`motor-<build>` + SHA256SUMS, `tools/publicar-version.sh`) y el servidor se actualiza solo (`--auto-actualizar`) | hecho (falta: el workflow que lo corre en cada fusión; lo sube Pablo: la App no puede escribir `.github/workflows/`) | sí |
| X7 | Motor en la flota (P1 de `../motor-flota/SPEC.md`; Pablo 16-10: «que el mundo lo lleve todo, bajarlo y arrancarlo en local como con Hyperfy»): carpeta de mundo con su aventura, la página la sirve el motor, `/status`, claves de la flota, dueños atados al código, zip `mundo@2` con `compose.yml` + `arrancar.sh`, imagen (`Dockerfile` desde el instalador) con `copia`/`comprobar`/`importar`, `--desinstalar` | hecho (rama `flota/motor-en-la-flota`, sin subir; falta: el workflow que publica imagen y versión, lo pega Pablo; la flota, P2, en numinia-assets) | no |
| I2 | Vincular el móvil con el ordenador o el visor (el ordenador enseña un QR, el móvil lo escanea) | necesita aprobación (Pablo, 15-10: de momento no) | no |
| V2 | Con Pablo, 15 min con las gafas: ¿funcionan `speechSynthesis`, el reconocimiento de voz, «menos movimiento» y la vibración dentro de una sesión inmersiva (Quest 3, Pico 4) y en iPhone? | pendiente | no |
| W1 | La plaza de entrada: primer mundo, al presupuesto de la Quest, con un portal a un mundo Hyperfy | necesita aprobación (Pablo: qué mundo lo estrena) | no |
| O5 | ADR y SYS del motor en la Summa (numinia.org) | necesita aprobación (Pablo) | no |

**Punto de parada «accesible» (como los PP de `CONSTRUIR.md`):** con V1, V3, V4, V5, V6 y V7 hechas, una
persona ciega entra en la plaza desde el ordenador con su lector de pantalla, pregunta qué hay cerca, sigue
una baliza hasta otra persona y la saluda; con baja visión, lo mismo en las gafas. Ahí se invita a las dos
ponentes de la Commit Conf a probarlo (`../mmo-browser-study/ACCESIBILIDAD-3D.md` §6).

**Puntos de parada «Hyperfy2» (PH1 se visita, PH2 se construye, PH3 se programa):** qué falta para llegar como
mínimo al nivel de Hyperfy2, fila por fila, en `docs/HYPERFY2-PARIDAD.md` (§5 las paradas, §6 el orden). Filas
para Opus, en este orden: H1 → M6 → H3 → H2 → M19 → M20.

**Lo que sabemos y por qué:** `docs/SABER.md` (decisiones, medidas, reglas, preguntas abiertas). Léelo antes
de diseñar una fila.

## Detalle

### S1 — Kit de despliegue
**Por qué:** el 15-10 Pablo lo monta en un servidor pequeño para ver los límites.
**Hecho cuando:** `deploy/instalar-motor.sh` (un solo fichero, generado por `tools/build-deploy.mjs`,
que incrusta servidor + página construida) instala en Ubuntu 24.04 / Debian 12: Node LTS oficial con
sha256 comprobado, usuario de sistema, servicio systemd con límites (`LimitNOFILE`, `MemoryMax`),
Caddy sirviendo la página y pasando `/ws` al servidor (HTTPS automático si se le da un dominio; sin
dominio, HTTP por IP para pruebas), ufw 22/80/443. El cliente usa `wss://<mismo origen>/ws` cuando no
está en localhost. `bash -n` limpio. Prueba en un contenedor `podman` ubuntu:24.04 hasta donde se
pueda sin systemd: arrancar el servidor a mano dentro y conectar un bot que recibe snapshots. Si
podman no está o no va, decirlo y dejar la prueba local equivalente.
**Hecho (14-10 noche):** `npm run deploy` → `deploy/instalar-motor.sh` (534 kB, fuera de git) desde
`deploy/instalar-motor.plantilla.sh`; Node 24.22.0 LTS con sha256 fijado (x64 y arm64) en
`tools/build-deploy.mjs`; opciones `--dominio`, `--memoria`, `--sin-cortafuegos`, `--solo-extraer`,
`--version`. Cliente: `serverUrl()` en `packages/client` (localhost → `:8790`, fuera → `/ws` del mismo
origen). Instrucciones en `deploy/README.md`. **Sin podman ni docker en esta máquina:** la prueba
equivalente es `node tools/deploy-check.mjs [node]` (desempaqueta, comprueba la página, arranca el
servidor desempaquetado en :8793 y un cliente recibe 10 snapshots en ~955 ms; huella `fa94375e`) —
pasada con Node 24.22.0 y con 26.7.0. **Sin probar:** apt, systemd, Caddy y ufw de verdad (eso es X3).

### X7 — Motor en la flota (P1 de `../motor-flota/SPEC.md`)
**Por qué:** Pablo (16-10): el motor tiene que ser el mismo y funcionar bien en todas partes (la flota de
numinia.com, un servidor, en local); un mundo lo lleva todo, se baja y se arranca en local como con Hyperfy.
**Hecho cuando (C1–C7):** una carpeta es el mundo entero (`MOTOR_MUNDO`: `datos/`, `aventura/` sembrada una vez,
`entorno/`, `sesiones/`, `mundo.json`); el motor sirve su página en su único puerto (`WWW_DIR`); `/status`; claves de
la flota (`JWT_SECRET`, `ADMIN_CODE`) o propias, o hechas una vez en `claves.env`; un dueño lo es con el código de
ahora; el zip `mundo@2` lleva aventura y entorno, y `compose.yml` + `arrancar.sh` + `LEEME.txt`; imagen desde el
instalador (`Dockerfile`, 10001, `0.0.0.0:8790`) con `copia`, `comprobar`, `importar`; `--desinstalar`; el workflow
de publicar (imagen, procedencia, versión con `imagen.json`) preparado fuera del repo.
**Hecho (16-10):** rama `flota/motor-en-la-flota` (sin subir). Números en `docs/RUNLOG.md`. **Sin probar:** la
instalación real (X3), `docker compose` de verdad (aquí solo hay podman sin proveedor de compose: probado con el
`podman run` equivalente), el workflow en GitHub, arm64. **Falta (otras piezas):** la flota (P2, numinia-assets),
la sala de Mundos (P3).

### P1 — Ficha técnica
**Por qué:** si alguien técnico decide montar algo en el motor, necesita saber sus límites; dependen
del servidor, del aparato, del navegador y de la gráfica.
**Hecho cuando:** `docs/FICHA-TECNICA.md` (español, para personas) y `limits.json` (para máquinas, con
`schema` y versión). Ejes: servidor (VPS-1, VPS-2, SYS-3…), aparato (A escritorio WebGPU, B Quest 3 /
Pico 4, C móvil medio, D móvil viejo), motor del navegador (Chromium, Gecko, WebKit), backend
gráfico (WebGPU, WebGL2), red (WebTransport, WebSocket). Contenido: características por nivel
(Base / Mejorado / Frontera) y límites (personas por instancia, kbit/s por persona, triángulos, draw
calls, texturas, avatares completos y horneados, luces, fuentes de audio, MB por zona, tiempo hasta
jugar, fps objetivo). Cada número lleva `estado: medido | estimado`, y si es medido la prueba que lo
mide (`tools/...` o test) y la fecha. Fuentes: `../mmo-browser-study/LIMITES.md`,
`FUNCIONALIDADES.md`, `EL-MOTOR.md` y las medidas del RUNLOG. Un test valida `limits.json` y comprueba
que cada valor medido apunta a una prueba que existe.

### S2 — Métricas y enjambre remoto
**Hecho cuando:** el servidor sirve por HTTP en su puerto `/health` (ok + versión) y `/metrics`
(JSON: conectados, tick p50/p99, kbit/s por persona, memoria, factor de dilatación). `tools/swarm.sh`
acepta una URL (`wss://…/ws`) y un modo "en el propio servidor". Test de `/metrics` en local.
**Hecho (15-10 madrugada):** `packages/server/src/server.ts` (`startServer`, HTTP + WebSocket en el
mismo puerto) y `metrics.ts` (ventanas: últimos 200 ticks = 10 s; bytes por segundo, 10 s). `/health`
→ `{ok, version, huella, conectados}`; `/metrics` → JSON `numinia-engine/metrics@1` (conectados,
capacidad, tick p50/p99/peor, presupuesto 25 ms, retraso del bucle, kbit/s por persona, memoria RSS y
heap, `dilatacion` = 1 fija hasta S3). Versión: `ENGINE_BUILD` o `../VERSION` del instalador. Caddy
publica `/health`; `/metrics` solo en 127.0.0.1 (túnel `ssh -L 18790:…`). Enjambre:
`packages/server/src/swarm.ts` (va dentro del instalador) con `--url`, `--en-servidor`, `--metrics`,
`--procs`, tope 120 s; `tools/swarm.sh --url …` lo llama. Los bots conectan en tandas de 25 en paralelo
y cuentan fallos. Medido aquí: swarm local 1.000 → `/metrics` tick p50 13,8 / p99 16,2 ms, 25,5 kbit/s,
RSS 169 MB, conexión de 500 bots en ~0,4 s. **Sin probar:** `wss://` de verdad (aquí no hay TLS) → X3.

### P2 — Móvil frío
**Hecho 15-10:** `packages/render/src/power.ts` + bucle de `apps/plaza/main.ts` + `docs/MOVIL-FRIO.md`. Falta medir temperatura/batería en un Android real (protocolo en el doc).
**Hecho cuando:** política de energía en el cliente, decidida por capacidad (nunca por nombre de
navegador): en móvil tope de 30 fps por defecto (60 a petición), pixel ratio ≤ 1,25,
`powerPreference: 'low-power'`, 10–15 fps cuando no se mueve nada ni hay entrada, nada cuando la
pestaña está oculta, resolución dinámica si el tiempo de cuadro sube de forma sostenida (señal de
calentamiento), y un "modo batería". Puerta de coste por cuadro para el nivel D (CPU ms, draw calls,
triángulos) medida sin pantalla. `docs/MOVIL-FRIO.md` con el protocolo para medir temperatura y
batería en un Android real durante 10 min (`adb shell dumpsys battery`).

### A1 — Página de multitud
El módulo ya existe sin probar: `packages/render/src/crowd.ts` (animación horneada en textura VAT,
mil figuras en una llamada; y figuras completas con esqueleto). Falta `apps/plaza/crowd.html` + su
`.ts`: modos `full` / `vat` / `mix` (los 20 primeros completos), N = 50/200/1.000/2.000 (completos
como mucho 200), HUD en español (fps, cuadro p50/p99, CPU ms, draw calls, triángulos, backend),
medida automática (2 s de calentamiento + 5 s) en `globalThis.__crowd.result`. **Hecho cuando:** un
e2e sin pantalla carga la página en chromium y firefox sin errores y comprueba que `vat` con 1.000
figuras usa ≤ 10 draw calls.

### P3 — Nativo para IA v1
**Hecho cuando:** `llms.txt` en la raíz (una página: qué es cada paquete, contratos, comandos,
límites), `docs/MAPA.md`, un `README.md` corto por paquete (qué hace, qué no, de qué depende, cómo se
prueba), `npm run describe` que imprime el estado de una instancia sin pantalla como JSON legible
(entidades, posiciones, quién ve a quién). Test de "documentación verdadera": cada paquete tiene
README y aparece en `llms.txt`.

### B1 — HTTPS en la red de casa
**Hecho cuando:** `npm run dev:lan` genera (si no existe) un certificado propio con openssl en
`.cert/` (fuera de git), sirve la página por https en la IP de la red de casa y pasa `/ws` al servidor
por el mismo origen; el cliente usa `wss://` en https. e2e por https ignorando el certificado.

### D1 — Puerta de tipos
TypeScript 7 (`tsc --noEmit`, estricto) con las dependencias de tipos que hagan falta (licencias
libres, versión exacta). 0 errores. Entra en `npm run gates` con su coste medido.

### S3 — Dilatación de tiempo
Si el tick no cabe en su presupuesto, la simulación va más despacio (como EVE) en vez de acumular
retraso; el factor sale en métricas. Probado en local con 4.000 bots, `nice`, ≤ 30 s.

### P4 — Agentes como jugadores (diseño: `../mmo-browser-study/DISENO-IAS-MOTOR.md`, 15-10, Opus)
**P4a, hecho (15-10).** `packages/agent`: `Cuerpo` (un jugador sin pantalla: `ClientSession` + verbos `irA`, `seguir`,
`parar`, `decir`, `gesto`, `hacer(función, verbo)`; sentidos `cercanos`, `cosas`, `sentidos()` con los nombres y
palabras de la gente solo dentro de un `<material>`), `Guion` (escalón E0: ruta, saludo a quien llega una vez cada
`cada` s, contesta solo si le llaman por su nombre, órdenes cortas en código — «sígueme», «quieta», «pasea», «saluda»,
«baila»; nunca «para» —, nunca contesta a otra IA, como mucho una frase cada 2 s), formato `habitante@1`
(`aventuras/<x>/habitantes/<id>.json`, lo comprueba `node tools/aventura.ts`) y el servicio `main.ts`
(`numinia-habitantes`: otro proceso, vuelve solo si el motor reinicia). Identidad: billete de agente
`a1.<id>.<día>.<firma>` con `MOTOR_AGENTES_SECRET` (secreto aparte del de invitados); el servidor solo acepta ids que la
aventura declara y les da `ia-<id>` y el nombre + « · IA». Instalador: segundo servicio con usuario propio, solo
localhost, `MemoryMax=256M`, `--sin-habitantes`; `deploy-check` lo arranca desde el paquete. **Medido:** 7 pruebas
(`test/agente.test.ts`); a mano en el PC (25 s): 200 habitantes = tick p99 4,2 ms (200 robots: 10,2), 14,1 % de un
núcleo y 329 MB el servicio. **Falta:** P4b; probarlo en el VPS (X3).

**P4b.** Su ficha V1 (que un lector y otra IA lo lean como lo que es), verbos del catálogo filtrados por escalón, permiso
por rol cuando exista H3 (requisito para H3: `/nombre` no puede acabar en « · IA»), y una guía determinista: Alma
explica el camino y acompaña con su árbol de diálogo, sin LLM. **Hecho cuando:** test sin pantalla: la ficha del
habitante aparece en `cards()` de otro jugador; Alma lleva a una persona hasta el pilar dorado.

### J0 — Lo que espera un jugador (Pablo, 14-10: "todas esas cosas las tenemos que tener previstas")
`docs/JUGADOR.md`: catálogo de lo que cualquier jugador da por hecho en un mundo social / MMO en 2026,
por grupos (moverse, verse, comunicarse, interactuar, progresar —libro de misiones, logros, sellos—,
orientarse —mapa, minimapa, brújula, marcadores—, interfaz y ajustes, VR, móvil, accesibilidad,
social —amigos, grupo—, eventos). Para cada cosa: qué es en una línea, capa (motor o ciudad), nivel
(Base / Mejorado / Frontera), cómo es en escritorio, móvil y VR, qué primitivas del motor necesita
(componente con esquema, mensaje, sistema del servidor, panel), coste para el móvil, y qué fila de
esta cola lo construye (o una fila nueva). `docs/EXTENDER.md` (la receta para añadir una función) ya
no es de J0: la escribe J7 junto con el código. Fuentes:
`../mmo-browser-study/FUNCIONALIDADES.md` y lo que hacen VRChat, Roblox, WoW/FFXIV, Hyperfy (citar
la URL si se consulta). **Hecho cuando:** existe el catálogo y la cola tiene una fila por cada
pieza de nivel Base que falte; las filas nuevas que cambien el núcleo (red, simulación, formato) entran
como `para Opus`, y las que sean una función de juego, como `espera a J7`.

### J7 — Módulos de juego (flexible: "que sea muy fácil implementar algo nuevo")
Una API `defineFeature({ id, components, messages, server, client, panels })`: una función nueva se
añade en su propia carpeta sin tocar el núcleo. Ejemplo real hecho con ella: gestos (saludar / bailar
con una tecla) que viajan por la red y se ven en la otra pestaña. **Hecho cuando:** test sin pantalla
del ejemplo; quitar el módulo no rompe nada; `docs/EXTENDER.md` usa el ejemplo. J3, J4 y J5 se
construyen después como módulos.
**Para Opus (15-10):** incluye `docs/EXTENDER.md`; se diseña junto con D4 (los mensajes de cada función
se declaran con esquema) y pensando en P4 (cada función declara sus verbos y un agente los recibe sin
código extra). Al cerrarla, J3, J4 y J5 pasan a `pendiente`.
**Lo que añade la realidad cruzada (15-10):** una función puede registrar rutas HTTP propias (la URL
que abre un QR) y tener estado guardado (con S4). El primer módulo real después de los gestos es R1.
**Hecho (15-10, sesión con Opus).** Paquete `packages/feature` (capa entre `net` y `client`/`instance`):
`defineFeature` (declaración solo de datos: intentos = verbos, eventos, estado por clave; campos por
esquema, con dos tipos nuevos en `schema`: `enum` y `text`), catálogo JSON que cada cliente recibe al
entrar (lo que un agente lee como verbos; `npm run describe -- --catalogo`), códec que sale del esquema
(`writeFields`/`readFields` en `net`), `ServerRuntime` dentro de la instancia (validación, límite de ritmo
por jugador e intento, cola hasta el tick, alcance `to`/`near`/`all`, estado replicado a todos y al que
llega tarde, rutas HTTP en el puerto de la instancia, fallos aislados) y `ClientRuntime` dentro de la
sesión (acciones = tecla o botón táctil, `view.label`/`bounce`, registro de eventos). Formato aditivo:
mensajes 6 CATALOG, 7 FEATURE, 8 STATE, solo si el servidor corre funciones; sin funciones la red es
idéntica. Las funciones viven en `features/<id>/` (solo pueden importar `core`, `schema`, `feature`; lo
comprueba `tools/layers.mjs`), y entran por dos listas (`features/servidor.ts`, `features/cliente.ts`).
Ejemplo: `features/gestos` (G saluda, H baila; alcance 30 m). Receta: `docs/EXTENDER.md`. Medido: 12
pruebas nuevas (42 en total; antes 30); puertas en verde (tick p99 8,5 y 8,7 ms en dos pasadas en la
plaza de 1.000, que corre sin funciones; antes 7,7–8,5; 25,0 kbit/s); e2e chromium, firefox y https: la
pestaña B camina hasta ~25 m de A, A pulsa G, las dos ven el texto. La simulación no cambia: la huella
fijada pasa y la prueba de gestos da la misma huella con y sin funciones. Límites nuevos en `limits.json`
y `docs/FICHA-TECNICA.md`. Sin hacer (otras filas): estado por cercanía y objetos (J9), guardar (S4),
identidad (I1), rutas públicas `/e/` en el proxy de casa y en Caddy (R1).

### J1 — Avatares VRM de verdad
`@pixiv/three-vrm` 3.5.5 (MIT, versión exacta). 2–3 VRM CC0 con la licencia comprobada dentro del
propio fichero (metadatos VRM) y en su fuente (candidato: 100Avatars de Polygonal Mind), cada uno con
su nota de licencia; animaciones CC0 (candidato: Universal Animation Library de Quaternius —
comprobar) reasignadas al esqueleto humanoide: quieto, andar, correr. En la plaza: tu avatar y los
cercanos en VRM (como mucho 12 en móvil, 25 en visor, 60 en escritorio, `LIMITES` §3), el resto
como hoy; rechazar avatares de más de 10.000 triángulos. **Hecho cuando:** e2e chromium + firefox
cuenta avatares VRM cargados sin errores; peso de descarga por avatar medido y apuntado.
**Lo que ya sabemos (15-10, `docs/SABER.md` §3.4):** las animaciones salen de la colección «Movimientos»
(`../movimientos/`: todo CC0; un original → `.vrma` para este motor y `.glb` para Hyperfy; Mixamo y bases de
VRoid prohibidos). UAL1 de Quaternius (CC0, 45 clips, nombres de huesos estilo Unreal) ya se convirtió y
funciona (`../movimientos/conversion/`): rotación de mundo respecto a su propia pose T, caderas normalizadas.
Al cambiar de animación, **mantener la vieja hasta que cargue la nueva y entonces fundir** (si no, salta la
pose de reposo un cuadro). Cargar `.vrma` con `VRMAnimationLoaderPlugin` de three-vrm. Los cinco gestos que
pide el agente: saludar, asentir, negar, pensar, señalar — los gestos de `features/gestos` pasan a usar clips
cuando existan.

**Hecho, trozo 1 (15-10, rama `wt/avatares`).** Tú y los más cercanos como humanoides VRM (60 en escritorio, 25 en XR, 12 en móvil; el resto, cápsulas), mirando hacia donde andan, con animaciones por velocidad: quieto, andar o trotar (según la zancada natural de cada avatar), correr y en el aire; cambio fundido en 0,2 s sin pose en T; congelados a más de 40 m. Tres avatares de la casa de 100Avatars (Polygonal Mind, CC0 dentro del fichero y en la fuente; 2.130–2.880 triángulos; `activos/avatares/LICENCIAS.md`), cada jugador uno según su id hasta H10. Animaciones `.vrma` convertidas de UAL1 de Quaternius (CC0) con `tools/vrma/` (pies en el suelo ±3 cm en 8 avatares). `@pixiv/three-vrm` y `three-vrm-animation` 3.5.5 (MIT, exactas) llegan después del primer cuadro (64 kB gz aparte). Sin MToon (Lambert con su textura): MToon metía ~30 kB gz en el arranque. `packages/server/src/vrm.ts` lee un VRM sin three (licencia, triángulos): listo para H10. **Medido:** 9 pruebas; pierna `tools/e2e-piernas/avatares.mjs` (2 VRM por pestaña, 0 fallos, B ve a A pasar de quieto a andar y trotar); 974–1.142 kB por avatar, 491 kB las cinco animaciones; arranque +5 kB gz. **Falta:** elegir el tuyo (H10), etiquetas a la altura de cada cabeza (J1b), gestos con clips, ficheros más ligeros, probar 60 a la vez y en aparatos reales.

### J2 — Salto y altura
La simulación gana altura, velocidad vertical, gravedad y suelo, y la entrada un bit de salto; la
predicción sigue exacta (0 correcciones). Cambia la huella fijada y el formato de entrada y de
snapshot. **Permiso de Pablo (14-10, "que no pare el desarrollo"): se hace en `auto`**, con versión de
formato nueva, la huella nueva fijada en el test y el cambio explicado en el diario.
**Paridad Hyperfy2 (15-10):** también correr (Mayús: 8 m/s frente a 4 andando, como Hyperfy) y un salto en el
aire (doble salto). Volar es de H2 (necesita permiso).

**Hecho (15-10, rama `wt/salto`; formato 2).** Simulación: altura, velocidad vertical, gravedad 20 m/s², salto de 1,5 m (v = √(2gh) con `fxSqrt`), uno más en el aire, búfer de 150 ms, caída máxima 50 m/s; correr 8 m/s (Mayús), andar 4; `groundHeight(x, z)` = 0 es el punto de enganche de M6. Entrada con un sexto byte de botones (aditivo: la de 5 bytes vale sin botones); el snapshot lleva tu estado vertical exacto y la altura de los demás solo cuando están en el aire (de pie cuestan lo de antes); `WIRE_FORMAT = 2` al final de la bienvenida. Un avatar solo avanza con sus propias entradas (como los «usercmd» de Quake): la predicción sigue exacta con entradas tardías o agrupadas. Página: Espacio salta (fuera de los campos de texto), Mayús corre; en el móvil, botón «Saltar» y correr con el joystick al borde; en VR, A o X saltan y el borde de la palanca corre. Bots que corren y saltan de vez en cuando. **Medido:** 10 pruebas (`test/salto.test.ts`); huella de referencia `fa94375e` → `93b192c8` (fijada en `test/engine.test.ts` y `test/server.test.ts`); enjambre de 1.000 por WebSocket: tick p99 19,3 ms (antes 19,95 el mismo día), 27,2 kbit/s por persona (antes 25,6); pierna `tools/e2e-piernas/salto.mjs`: cima 1,48 m, doble 2,79 m, Mayús+W 11,6 m frente a 6,0 m. **Falta:** aviso de formato distinto (J2b), mantener Espacio para encadenar saltos, volar (H2), pendientes y tiempo de coyote (M6).

### J3 — Chat y bocadillos
Mensaje nuevo CHAT (aditivo: tipo nuevo, texto UTF-8 ≤ 200 bytes, límite de ritmo en el servidor,
alcance por cercanía de 20 m); bocadillo sobre quien habla durante ~6 s, legible en VR; nombre sobre
la cabeza; caja de chat en la página (Enter para escribir; en móvil, un botón). **Hecho cuando:** e2e:
la pestaña A escribe "hola" y la B ve el bocadillo; el servidor descarta textos largos o seguidos.
**Paridad Hyperfy2 (15-10):** además del cercano, un canal de la zona con su propio límite de ritmo (Hyperfy
solo tiene uno para todo el mundo) y los 50 últimos mensajes de la zona al entrar. Lo que empieza por `/` no se
publica: llega a las funciones como evento `orden` (las órdenes son H3). Las funciones reciben el chat cercano
como evento (lo usará el habitante IA, P5). El nombre de la cabeza es el de la identidad (I1) hasta que H3 deje
cambiarlo con `/nombre`.

**Hecho (15-10, rama `wt/chat`).** Función `features/chat` por el enchufe (no mensaje del núcleo): cercano 20 m con bocadillo, canal de la zona (la instancia hasta M16) con tope por persona y por zona, los 50 últimos al entrar; texto en una línea, sin caracteres de control, ≤ 200 bytes; lo que empieza por `/` nunca se publica: va a las funciones como `orden` (`/ayuda` contesta). Nombres sobre la cabeza: solo de quien tu página dibuja (área de interés) a menos de 24 m, como mucho 64, olvidados a 30 m; los bots, «Robot N». El enchufe gana `api.listen` (oír eventos de otras funciones: H3, P5), el alcance `"server"` y `api.visible`. Página: Intro abre, Intro manda, Esc cierra; lista con `role=log` y `aria-live`; botón «Chat» en el móvil; `apps/plaza/escribiendo.ts`: escribir nunca mueve (toda escucha de teclas lo pregunta). Proxy LAN de vite: `/e/` y `/a/` con barra. **Medido:** 13 pruebas; ancho de banda K=50 +1,9 kbit/s con nombres y una línea cada 10 s; 1.000 entrando a la vez: 866 B de nombres por persona, tick del chat p99 3,7 ms; pierna `tools/e2e-piernas/chat.mjs` (17 comprobaciones). **Falta:** multitudes (J3b), escribir en VR (J3c), lectores de pantalla reales.

### J6 — VR de verdad
Botón "Entrar en VR" solo si `navigator.xr.isSessionSupported('immersive-vr')` (la AR es J8);
`renderer.xr` (WebGL2 en Quest); moverse con el stick (intenciones), teletransporte con arco, giro a
saltos de 30°, viñeta de confort ajustable, mandos y manos, un panel 3D legible. Probado con el
emulador IWER (Meta, MIT, versión exacta) inyectado en Playwright: entra en sesión, dibuja cuadros,
el stick mueve el avatar. Después X1 con Pablo (necesita B1).

### J4 — Interacciones ("cómo interactúan unas cosas con otras")
Componente Interactuable (usar / agarrar, texto del aviso, radio) y un sistema del servidor que decide;
aviso "E: abrir" en escritorio, botón en móvil, rayo y gatillo en VR. Tres ejemplos: puerta que se
abre, botón que enciende una luz, objeto que se coge y se suelta; todo se ve igual en la otra
pestaña. **Hecho cuando:** e2e de los tres.
**Paridad Hyperfy2 (15-10):** aviso con «mantener pulsado» y anillo de progreso (su nodo `Action`: texto,
distancia, duración; empezar, disparar, cancelar); clic sobre cosas del mundo (sus eventos de puntero: entrar,
salir, pulsar, soltar); abrir un enlace avisando antes (`world.open`).

**En curso (15-10, núcleo en `wt/misiones`).** La ficha de una cosa declara cómo se usa (`interact`: verbo, aviso, radio); el servidor decide (`api.within`, radio + 1,5 m); la página y los agentes usan `reachable`/`use`; aviso con E, un clic sin arrastrar o el botón (el que se toca en el móvil). **Falta:** los tres ejemplos (puerta, botón con luz, coger y soltar), mantener pulsado y el rayo de VR.

### N1 — Entrada táctil, gamepad, cámara y pantalla completa
De `docs/JUGADOR.md`. **Paridad Hyperfy2 (15-10):** cámara en primera y tercera persona, con zoom de la rueda
(y de pellizco en móvil).

**Hecho (15-10, sesión Opus en paralelo, rama `wt/camara`).** `packages/render/src/camara.ts` (entrada) + `camara-orbita.ts` (cuentas puras) → `view.cam`. Jugar: arrastre derecho (o izquierdo sobre el mundo; un clic sin mover sigue siendo clic) gira alrededor de los ojos (1,6 m), cabeceo ±80°; rueda 1,5–20 m y un paso más = 1.ª persona (tu cuerpo se oculta); `,` `.` giran, RePág/AvPág inclinan, `+`/`−` acercan, V 1.ª/3.ª persona, Inicio detrás de ti. Andar va hacia donde mira la cámara (`haciaMundo`, sin tocar la simulación). Construir: cámara libre (arrastre derecho gira, central o Mayús+derecho desplaza, Alt+izquierdo gira en touchpads, rueda hacia el punto bajo el cursor, hasta 80 m; `frame()` con F). Táctil: mitad izquierda anda, mitad derecha mira, pellizco acerca. Mando: palanca izquierda anda, derecha mira, RB/LB zoom. Botón de pantalla completa. La cámara nunca para un evento. **Medido:** 11 pruebas (`test/camara.test.ts`), pierna `tools/e2e-piernas/camara.mjs` (11 comprobaciones: rueda, 1.ª persona, giro 90° y W anda por donde mira con 0,1° de error y 0 correcciones, construir, mando falso, pantalla completa, táctil por CDP); arranque +3,8 kB gz. **Falta:** chocar con el escenario (N1b, espera a M6), orientación de pantalla, sensibilidad e invertir eje en ajustes (N2), probar en aparato real.

### J5 — Libro de misiones y mapa
Formato de misión en JSON con esquema (pasos; condiciones "llega a", "usa", "habla con";
recompensas), estado por jugador en el servidor, panel del libro (lista, detalle, seguimiento en el
HUD), mapa de la zona (vista cenital generada) y minimapa con marcadores (tú, gente, objetivo,
portales); en VR, panel en la muñeca. El formato y los paneles son del motor; las misiones concretas,
de la ciudad. **Hecho cuando:** una misión de ejemplo de tres pasos se completa en un e2e y el mapa
marca su objetivo.

**Hecho (15-10, ramas `wt/misiones` y `wt/mapa`).** Misiones, personas y cosas de misión son texto de la aventura (`aventuras/<nombre>/`, `AVENTURA_DIR`; `mision@1`, `pnj@1`, `cosa@1`, con errores que dicen dónde; `node tools/aventura.ts` comprueba una carpeta sin arrancar nada): pasos «llega a», «habla con», «coge», «entrega»; recompensas e insignias; el progreso de cada invitado vive en el servidor (S4), que decide cada paso. Página: aviso «E: hablar con Alma» (E, clic o el botón: J4), conversación con respuestas 1–4, libro (J) con seguimiento, la línea del paso seguido y una columna de luz al objetivo. Mapa: minimapa en la esquina (tú, gente, fichas con `at`, objetivos y destino; norte arriba o girando con la cámara), mapa grande (M; imagen cenital por GPU o huellas; destino con columna de luz; leyenda con forma y color) con su gemelo HTML «Lo que hay cerca», y la ficha (I, J12). Contratos: `__numinia.misiones.objetivos()/resumen()`, `__numinia.mapa`. **Medido:** 7 + 13 pruebas; pierna de misiones: una misión de tres pasos de principio a fin (Alma → pilar → Bruno → caja) y el mapa marca su objetivo (`mapa.contar().objetivo`); pierna del mapa en chromium y firefox; 1.000 jugadores esperando llegar a un sitio: tick de funciones p99 0,18 ms; minimapa quieto = 0 dibujos, andando ≤ 5 por segundo. **Falta:** panel en la muñeca en VR (J13), dibujo barato de personas (J14), marcas «!» y «?» (J15), libro incremental, aventuras escritas con un LLM (J16).

### X5 — Móvil real en modo depuración
Pablo conectará en algún momento un móvil viejo por USB en modo depuración: entonces `adb` (temperatura y
batería, `docs/MOVIL-FRIO.md`) y la depuración remota de Chrome (`adb forward` + CDP) para medir de verdad.
Hasta entonces se aprende de las sesiones reales (T1).

### A2, A3, A4, B3, D2, D3, D4
Ver su línea en la cola. B2: el emulador IWER (Meta, MIT) se inyecta en Playwright para simular una
Quest 3; comprobar licencia y versión antes de instalar.

**P1 hecho (15-10):** `limits.json` (`numinia-engine/limits@1`; lista plana de `limits` con eje/ámbito/clave/valor/unidad/estado + `features`), `docs/FICHA-TECNICA.md` y `test/limits.test.ts` (esquema, sin duplicados, mismas claves en A–D, cada `measured` apunta a un archivo que existe, cada `estimated` lleva fuente). Medido: tick, kbit/s, memoria, conexión, e2e Chromium/Firefox; estimado: tabla A–D, VPS-1/2, voz. WebKit sin probar.

## Realidad cruzada: la calle (AR) y el mundo digital (VR) juntos (Pablo, 15-10)

Diseño completo, fuentes y reglas: `../mmo-browser-study/REALIDAD-CRUZADA.md`. Las mecánicas concretas
(Semilla, Célula) son de la ciudad; el motor pone las piezas: puntos de enlace, reclamaciones que decide
el servidor, efectos, inventario, persistencia, sesión AR. Reglas que valen para todas: GPS solo para
zonas (≥ 30 m), nunca para colocar; la posición se manda solo al reclamar un punto y no se guarda; la
cámara no sale del aparato; AR y cámara a ráfagas (≤ 90 s); todo lo que usa cámara, GPS o WebXR exige
HTTPS (B1); cada mecánica tiene versión plana para iPhone y ordenador.

### T1 — Cómo entra cada jugador (hecho, 15-10)
**Por qué (Pablo, 15-10):** «cuando monte la máquina y me meta con el móvil, captura la información de la
sesión: ahí es donde aprenderás más; igual con las gafas; distingue cómo entra cada jugador en el mundo».
**Hecho:** la página manda al servidor un mensaje nuevo REPORT (tipo 9, JSON ≤ 1.000 bytes, aditivo):
`entrada` una vez tras el primer cuadro (clase visor/móvil/tableta/escritorio, modelo si el navegador lo dice,
sistema, navegador, UA, backend y GPU, núcleos, memoria, pantalla, XR posible, red, batería, preferencias del
sistema, tiempos hasta la bienvenida y el primer cuadro, huella igual), `pulso` cada 10 s (modo plano/VR/AR,
cuadro p50/p99/peor, cuadros perdidos frente al objetivo del momento, Hz de la XR, coste por cuadro, escala de
resolución, modo batería, ping, correcciones, visibles, pestaña oculta, batería, errores, memoria), `xr` al
entrar, salir o fallar (con el motivo) y `error` (los 5 primeros). `packages/server/src/sesiones.ts` solo
guarda las claves que conoce, en `SESIONES_DIR/sesiones-<día UTC>.jsonl` (una línea por informe, 14 días, sin
IP ni identidad; una conexión que nunca informa —robots— no escribe nada), y al cerrar escribe `sale` con la
duración. `GET /sesiones` (como `/metrics`, nunca publicado por Caddy) da quién está dentro y su último pulso;
`npm run sesiones` lo cuenta para personas (un bloque por sesión + resumen por aparato y navegador). El
instalador crea `/var/lib/numinia-motor/sesiones` (`StateDirectory`). Nombrar el aparato por el UA vale aquí
porque es solo un informe: el comportamiento sigue decidiéndose por capacidad.
**Medido:** 8 pruebas nuevas; e2e chromium, firefox y https comprueban que las dos pestañas mandan `entrada` y
`pulso` con su backend; el emulador IWER aparece como «visor · Quest Browser 33.0».
**Falta:** datos de aparatos reales (lo dará el X3: Pablo entra con su móvil y las gafas). Más adelante, Pablo
conectará un móvil viejo en modo depuración (X5) para pruebas serias con `adb`.

### I1 — Identidad de invitado (para Opus)
**Pablo (15-10): vincular el móvil con el ordenador «de momento no»** → esa parte pasa a I2 (aparcada); I1 es
solo la identidad de invitado guardada en el aparato.
**Hecho (15-10, sesión con Opus).** Sin cuenta ni datos personales: el servidor da un billete firmado
`g1.<id>.<día>.<firma>` (id de 12 letras al azar, HMAC con `MOTOR_SECRET`; sin secreto, uno de usar y tirar y el
registro avisa de que los invitados no se reconocerán tras reiniciar); la página lo guarda en `localStorage` y lo
enseña al volver (mensaje nuevo IDENTITY, tipo 10, aditivo); el mismo navegador es el mismo invitado («Invitado
ASC6»), dos pestañas también; un billete falso o de más de 180 días da un invitado nuevo; a los 30 días se
renueva con el mismo id. Las funciones tienen `api.onIdentify(entidad, quien)` y `api.who(entidad)`, y guardan lo
de cada persona por `quien.id`, nunca por entidad. Los robots no tienen identidad. Código:
`packages/instance/src/identidad.ts` (puro), `Instance.who`, `ClientSession.who` + `GuestKeeper`. Las sesiones
de T1 siguen sin identidad (promesa: «sin IP ni identidad»). Desbloquea R2, R3, V8 y O4.
Hoy el motor no sabe quién es nadie. La Semilla y la Célula necesitan una identidad de invitado (sin
cuenta) guardada en el aparato y **vincular** el móvil con el ordenador o el visor (el ordenador enseña un
QR, el móvil lo escanea) para que lo que haga el móvil cuente para la misma persona. Tokens firmados con
caducidad; ningún dato personal.

### S4 — Persistencia mínima del mundo (para Opus)
Hoy todo vive en memoria y se pierde al reiniciar. Guardar: puntos de enlace, inventarios, cosas plantadas
o dejadas, y quién reclamó qué y cuándo (sin coordenadas). Decidir formato (SQLite de Node, JSON o
registro de eventos), cómo convive con la simulación determinista y cómo se prueba (reinicio sin pérdida).
**Hecho (15-10, sesión con Opus). Decisiones:** (1) **la simulación nunca se guarda**: los avatares son de
paso; se guarda lo de las funciones, que vive fuera de la huella, así que el determinismo no se toca.
(2) **Ficheros de texto, no SQLite**: por función, `DATOS_DIR/<id>.json` (foto) + `<id>.jsonl` (cambios desde
la foto, uno por línea); un agente o una persona los lee con `cat`; sin dependencias (`node:sqlite` aún es
experimental en Node 24). Al cargar: foto + diario; una línea cortada por un apagón se salta; pasado
`COMPACT_AT` (1.000) líneas, el diario se pliega en una foto nueva (`.tmp` + renombrar). Se escribe cada
segundo y al cerrar (SIGTERM): un apagón pierde ≤ 1 s; un reinicio normal, nada. (3) **Declarado**:
`state.persist: true` guarda el estado compartido (y vuelve antes de que entre nadie, comprobado contra el
esquema de hoy: lo que ya no cabe se descarta y se dice); `store: { describe }` da `api.store` (solo servidor,
nunca a las páginas; JSON ≤ 4.096 bytes por clave, ≤ 10.000 claves). El almacenamiento lo da el servidor
(`packages/server/src/datos.ts`, `FileStorage`) por la interfaz `FeatureStorage`; sin carpeta, todo en memoria
y la función lo avisa. `despertar` guarda cuándo se despertó cada punto y cuántas veces. Falta: «quién»
(necesita I1), copias de seguridad (las hace quien administra la máquina, carpeta `/var/lib/numinia-motor/datos`)
y migraciones con código (hoy: lo que no cabe en el esquema nuevo se descarta).

### J8 — AR de verdad (Pablo, 15-10: «la AR me interesa muchísimo»)
Botón «Entrar en AR» solo si `navigator.xr.isSessionSupported('immersive-ar')` (Android Chrome con
ARCore, Quest 3, Pico 4); en iPhone no hay WebXR: no sale y se juega en plano. Sesión `immersive-ar` con
fondo transparente, `hit-test` para el suelo, retícula, tocar o gatillo para colocar un objeto, `anchors`
para que se quede quieto, `dom-overlay` en Android para el HUD. Los ejemplos de AR de three r186 son solo
para `WebGLRenderer`: leer `src/renderers/common/XRManager.js` (el nuestro es `WebGPURenderer`, backend
WebGL2 en XR) antes de escribir. La sesión se cierra sola a los 90 s (móvil frío). **Hecho cuando:** e2e
con el emulador IWER (MIT) si emula AR — comprobarlo; si no, decirlo y dejar escrita la prueba a mano para
Pablo (necesita B1); la página no da errores cuando no existe `navigator.xr`.

**J8 hecho (15-10):** `packages/render/src/ar.ts` (`arSupported`, `createAR`: sesión `immersive-ar` con `hit-test`, `anchors`/`dom-overlay` opcionales, retícula, tocar/gatillo coloca un cubo, se cierra a los 90 s) y botón «Entrar en AR» que solo aparece si el aparato lo soporta. `tools/e2e-ar.mjs` (dentro de `tools/auto.sh e2e`): sin WebXR no hay botón ni errores; con IWER 2.6.0 (MIT, devDependency exacta) haciendo de Quest 3 con un suelo falso: entra → «ready» → gatillo → «placed» → cierre automático (con `?armax=6000`) → «off», 0 errores. Límites del emulador: su capa base tiene framebuffer nulo (el test lo parchea) y el hit-test es un suelo inventado, así que **no prueba** que el vídeo de la cámara se vea detrás ni que los anclajes aguanten. Prueba a mano (necesita `npm run dev:lan` por https): Android Chrome con ARCore y Quest 3: abrir la página, «Entrar en AR», mover el aparato hasta ver el aro, tocar, comprobar que el cubo se queda quieto. Pendiente para otra fila: sincronizar el objeto colocado con los demás, pintar avatares en AR.

**J8b + J10, trozo 1 hecho (16-10, rama `xr/manos-y-mandos`; Pablo: «que funcione mejor la AR y la VR, una misión nueva de coger dos objetos, que se vean las manos y que los mandos funcionen»).**
AR: en vez de un cubo, la plaza en miniatura y en vivo sobre tu mesa (1:50; pilares, tú en naranja, la gente, las personas del mundo y las cosas); toque/gatillo la pone y la mueve; en visor, palanca izquierda anda con tu avatar sobre la mesa, la derecha gira (lado) y escala (arriba/abajo), A/X salta; `hit-test` ya es opcional (sin él, a la altura de una mesa delante); el móvil se cierra a los 90 s, el visor a los 20 min. VR: `packages/render/src/manos.ts` (se descarga solo donde hay XR, 3,4 kB gz): una mano dibujada en cada mando cuyos dedos siguen gatillo y agarre, o tus manos con seguimiento (25 articulaciones); rayo que se para donde toca; cerca de una cosa que toca coger, un halo y una vibración, y agarre/gatillo/pellizco la coge; gatillo sobre una persona = hablar; el diálogo sale en un panel 3D delante (rayo + gatillo, o palanca + A; B sale); notas cortas delante; Y trae el panel de la misión. Lo cogido se dibuja en la mano que lo cogió (al lado de tu avatar en pantalla) hasta que acaba la misión. Misión de ejemplo «Manos a la obra» (Teo, regadera azul y saco dorado a la altura de la mano: `cosa@1` gana `posicion.y` y `apariencia.color`). Lo que no anima (personas, cosas) se hornea una vez por modelo en una malla por material: el robot pasa de 19 llamadas de dibujo a 3.
**Medido:** 232 pruebas (2 nuevas); pierna `tools/e2e-piernas/manos.mjs` (IWER: la misión entera con mandos y con manos); `tools/e2e-ar.mjs` comprueba la maqueta, las manos, girar, escalar y andar en la mesa; arranque 336,7 → 341,8 kB gz. **Falta:** probar en Quest 3, Pico 4 y Android (el emulador no pinta: el aspecto solo se vio en una escena aparte); coger en cualquier orden (hoy van por pasos); soltar/lanzar; arco de teletransporte y viñeta en el menú (resto de J10); la maqueta perezosa (−≈2 kB).

### R1 — Despertar (primera prueba de realidad cruzada)
Módulo hecho con J7: `enlaces.json` con esquema (id, nombre, zona y posición en la plaza, efecto, reglas);
cada punto tiene una URL firmada `GET /e/<token>` que contesta con una página corta («Has despertado la
fuente: mírala en la plaza») y suelta un evento en la instancia; la plaza muestra el efecto (columna de
luz y texto) unos 10 s para todos. `npm run enlaces -- qr` imprime los QR (SVG) con la URL de la red de
casa; opción para que el servidor escuche en la red de casa (hoy solo en 127.0.0.1). **Hecho cuando:**
e2e: una petición a un código válido hace aparecer el efecto en una pestaña sin pantalla; un código falso
o repetido no hace nada; medido el tiempo del escaneo al efecto.
**Ojo (J7, 15-10):** el código va en `features/despertar/` con `api.route("GET", "/e/:token", …)` y
`api.emit(…, "all")` (receta: `docs/EXTENDER.md`). Hoy, desde fuera, a la instancia solo llega `/ws` (y
`/health` en un servidor instalado): en casa lo pasa el proxy de `apps/plaza/vite.config.mjs` (modo LAN) y
en un servidor instalado, Caddy (`deploy/instalar-motor.plantilla.sh`). R1 añade `/e/` en los dos sitios,
nunca `/metrics` (se queda en 127.0.0.1). El secreto que firma los tokens va en una variable de entorno,
nunca en el repositorio.

**R1, trozo 1 hecho (15-10, turno):** `features/despertar/` (declaración, tokens, servidor, cliente, `enlaces.json` con 2 puntos). `GET /e/<id>.<firma>`: firma = HMAC-SHA256 con el secreto del servidor (`MOTOR_SECRET`, 16+ caracteres; el motor lo da a las funciones como `api.sign(texto)`, porque una función no puede importar `node:crypto`). Token falso o sin secreto → 404 sin efecto; token válido → un evento `despertado` a todos y página «Has despertado…»; mientras dura el efecto (`ms`), un segundo escaneo no repite. Página: `view.beacon` (opcional en `ViewHooks`) pinta columna de luz + texto. `npm run enlaces -- <base>` imprime las URLs firmadas. Proxy `/e` en modo LAN (`vite.config.mjs`) y en Caddy; el instalador crea `$PREFIX/secreto.env` una vez (root, 600) y lo carga el servicio. Medido: escaneo → efecto en la página 4 ms (WebSocket local); 51 pruebas en verde (4 nuevas); e2e verde.
**Falta de R1:** imprimir los QR como SVG (hace falta un codificador QR: escribirlo o dependencia MIT exacta); opción para que el servidor escuche en la red de casa; comprobar en un navegador real que la columna se dibuja (hoy solo se prueba el evento sin pantalla; `beaconCount()` en render permite hacerlo en e2e); medir el tiempo con un móvil real.

### R2 — Semilla del Conocimiento
**Ya hay (15-10):** identidad de invitado (I1: `api.onIdentify`, `api.who`) y guardado (S4: `state.persist`,
`api.store` por `quien.id`). Lo que se planta es algo en el mundo: lleva `state.card` (V1).
El punto hace una pregunta que solo se responde estando allí; la respuesta la fija el DJ (un agente puede
redactar la pregunta desde la ficha `.md` del sitio, nunca decidir si se acierta). Acierto → Semilla en
el inventario de la persona (I1); en el mundo digital se planta, crece con el tiempo real y los demás la
ven (S4). Base: Semillas del Conocimiento del manual (`lore/game/manual/es/06-inventario-y-bestiario.md`).
**Hecho cuando:** e2e: responder bien en una pestaña-móvil hace aparecer la semilla en la pestaña-ordenador
vinculada (sin I2, que está aparcada: en la misma pestaña o desde otra con la misma identidad); después de
reiniciar el servidor sigue plantada.

### R3 — Célula del Prisma + herramienta del DJ
Página para directores de juego: soltar un punto en el mapa (zona de 30–50 m), elegir la prueba final (QR
escondido o pregunta), imprimir el QR y esconder una Célula en su hueco digital. En el móvil, el mapa
avisa «algo late en esta zona»; al llegar se hace la prueba; quien la encuentra se la lleva y en el mundo
se ve quién fue. **Hecho cuando:** e2e con geolocalización simulada (Playwright) dentro y fuera de la zona.

### R4 — Caza de invisibles (homenaje a Invizimals)
Momento de cámara de ≤ 60 s: el color dominante, la luz, la hora y el tiempo real deciden qué aparece;
pitido de frío/caliente; se captura con el cuerpo (soplar al micrófono, agitar, tapar la cámara). En
Android y Quest se posa en el suelo (J8); en iPhone, dibujada sobre el vídeo. Lo capturado aparece en el
mundo digital. Todo se analiza en el aparato. **Hecho cuando:** e2e con la cámara falsa de Chromium
(`--use-fake-device-for-media-stream` + vídeo de un color) hace aparecer la criatura que toca.
**Intento guardado (15-10):** el turno de las 11:30 empezó R4 (`features/invisibles/` con `regla.ts`, cliente,
servidor y `test/invisibles.test.ts`) y se cortó a las 11:47 por un reinicio del gateway, sin pasar las
puertas. Está en `git stash list` de la copia `auto` («turno 11:30: R4 sin terminar»): el próximo turno que
coja R4 lo mira con `git stash show -p stash@{0}`, lo recupera con `git stash pop` si le sirve, y lo
termina o lo descarta diciéndolo en el diario.

## Accesibilidad (V) — de `../mmo-browser-study/ACCESIBILIDAD-3D.md` (15-10)

Reglas que valen para todas las filas V (y para cualquier función nueva): `docs/SABER.md` §3.6. La idea
central: **una sola ficha `accesible` por cosa del mundo** alimenta el lector de pantalla, la voz propia del
motor y a los agentes de IA. Lo que no se ha medido en un aparato real se dice (V2).

### J9 — Estado y objetos por cercanía (hecho, 15-10, sesión con Opus)
**Decisión:** los objetos de las funciones (puertas, semillas, células) **no** son entidades de la simulación:
son entradas del estado de su función puestas con `at` (y con ficha, V1). Así no tocan la huella ni el tick
de la simulación; lo que necesite física irá con M6. **Hecho:** una entrada con `at` llega solo a quien está a
menos de `state.radius` (64 m por defecto; la función puede declarar el suyo, 8–2.000 m); al moverse, cada
jugador recibe lo que se le acerca y olvida lo que pasa de radio × 1,25 (margen para que nada parpadee en el
borde); quien llega tarde recibe solo lo cercano; una cosa que se mueve lejos de alguien se le borra; al
borrarla, solo se entera quien la tenía. Lo que no tiene `at` sigue llegando a todos. Índice en rejilla de
celdas del ancho del radio (`NearIndex`: mira 9 celdas, no todas las cosas); el repaso se reparte: cada tick,
una décima parte de los jugadores (cada uno cada 0,5 s). El mensaje es el mismo STATE de siempre. Medido:
1.000 jugadores × 2.000 cosas en 1 km²: repaso completo 4,5 ms, una décima 0,24 ms por tick.

### V1 — Ficha accesible y reglas de las funciones (para Opus)
Componente con esquema `accesible`: `nombre` (texto corto que se dice), `funcion` (enum: puerta, botón,
persona, cartel, objeto, lugar, salida…), `estado` (texto o enum), `descripcion` (≤ 140 caracteres),
`importancia` (0–3), `sonido` (id), `acciones` (ids de verbos del catálogo). Casi todo es **dato fijo**: viaja
con el contenido y el catálogo, no en cada tick (coste de red ≈ 0); lo que cambia va por el estado de las
funciones (J7). En `defineFeature`: cada intento lleva nombre hablado y al menos una forma sin gesto; cada
evento que se ve lleva sonido y cada sonido, texto. Si falta, la función **no se registra** y el error dice
qué falta. `npm run describe -- --catalogo` enseña las fichas (un agente las lee igual). **Hecho cuando:**
`features/gestos` y `features/despertar` cumplen; una función sin nombre hablado falla en un test con un
mensaje que dice cómo arreglarlo; huella sin cambios.
**Hecho (15-10, sesión con Opus).** En `packages/feature`: `ROLES`, `SOUNDS`, `Importance`; intentos con
`spoken` (obligatorio), eventos con `announce` (`{ text con {campo}, sound, importance, at | who }`) o `"silent"`
(obligatorio), `state.card` (`role`, `name`, `description`, `importance`, `sound`, `actions`, `at`); los huecos
`{campo}` se comprueban contra los campos; `state.set` con `at` sin ficha se niega. El catálogo lleva todo eso
(un agente lee lo mismo que un lector de pantalla). En el cliente: `features.announcements`, `view.announce`,
`features.cards()`, `fillTemplate`. La plaza tiene dos regiones `aria-live` (educada y urgente) donde cae cada
anuncio. `gestos` («Gesto: saludar», suave, sobre quien lo hace) y `despertar` (su texto, magia, importancia 2,
en su punto) cumplen. Diferencia con el plan: la ficha no es un componente de la simulación sino parte de la
declaración de cada función (dato fijo en el catálogo + estado con ficha): coste de red por tick 0 y la huella
no cambia. Las personas (avatares) tendrán su ficha cuando haya nombres (J3) y la usarán V4/V5.

### V3 — Voz propia del motor
Cola con prioridades (aviso de seguridad > respuesta a una pregunta > descripción > ambiente), se puede
cortar con una tecla o botón, baja el resto del audio mientras habla. En plano, además, una región
`aria-live` para que el lector del sistema lo diga. Motor de voz: `speechSynthesis` del navegador donde
exista (V2 dice si existe dentro de las gafas); si no, texto en el panel. **Hecho cuando:** test sin pantalla
de la cola (prioridad, cortar) y e2e: un evento con ficha llega a la región `aria-live`.

### V4 — Lista HTML de lo cercano (el «gemelo HTML»)
Una lista invisible a la vista y visible para el lector, con lo que el área de interés ya eligió, recortada
a 30–50 cosas por importancia y distancia; cada entrada: nombre, distancia, lado («a tu izquierda»), y sus
acciones como botones de verdad. Navegable con teclado (Tab, flechas) y sin trampas de foco. Referencia:
el «HTML twin» de Babylon.js. **Hecho cuando:** e2e chromium + firefox: el árbol de accesibilidad
(`locator.ariaSnapshot()` de Playwright) lista a la otra pestaña por su nombre y el botón «Saludar» funciona con
teclado.

### V5 — Preguntas desde los datos
Cuatro órdenes (tecla, botón y, donde exista, voz): ¿dónde estoy? (zona y lo más importante), ¿qué hay
cerca? (las 5 cosas más importantes con distancia y lado), ¿dónde está X? (dirección y distancia, en
relativo: «a 12 m, delante a la derecha»), ¿quién hay? (personas cerca). Sin LLM: todo sale de las fichas y
de las posiciones. **Hecho cuando:** test sin pantalla con un mundo fijo da las respuestas exactas.

### V6 — Audio espacial y baliza simple
Fuentes posicionales (Web Audio `PannerNode` HRTF) que siguen a la cabeza en VR; tope de 16–32 fuentes,
las de accesibilidad primero; volumen aparte para avisos; modo mono (para quien oye por un solo oído). La
baliza simple: un sonido que se repite en el destino elegido (una persona, una salida); el guiado paso a paso
es V9. Móvil frío: sin audio cuando la pestaña está oculta. **Hecho cuando:** test de la mezcla (tope,
prioridad, mono) y e2e sin errores con la baliza activa.

### V7 — Comodidad y seguridad
Limitador de destellos (≤ 3 por segundo, WCAG 2.3.1) en efectos como la columna de `despertar`; modo
sentado (altura ajustable en VR); leer `prefers-reduced-motion` y `prefers-contrast` del sistema y aplicarlos
**antes del primer cuadro**; nada se mueve solo con «menos movimiento». Giro a saltos y viñeta ya existen (J6).
**Hecho cuando:** test del limitador; e2e con `reducedMotion: 'reduce'` emulado sin animaciones automáticas.

### V8 — Perfil de accesibilidad en la identidad (espera a I1)
Los ajustes de V3–V11 van con la persona (identidad de I1), no con el aparato; se aplican antes del primer
cuadro en el móvil, el PC o las gafas; la primera vez se rellenan con lo que dice el sistema.

### V9 — Caminos, guía, «mírame al objetivo» y escáner (para Opus)
Mapa de caminos (navmesh) generado en el servidor para cada zona; guía paso a paso que suena en la próxima
esquina; una tecla que gira la vista hacia el objetivo (The Last of Us II, God of War); escáner direccional
(mueves el stick o la cabeza y oyes qué hay en esa dirección: NavStick). Andar solo hasta un punto genera
entradas normales: la predicción no cambia. Decidir dónde vive el navmesh (¿sim o funciones?) y si toca la
huella.

### V10 — Avisos de personas (espera a V3)
Quién se acerca (entra en 2–3 m), quién habla, quién me mira (VRBubble, señales no verbales); con tope en
multitudes (agrupar: «cinco personas a tu izquierda»). Burbuja de espacio personal de ~1,2 m opcional.

### V11 — Baja visión
Contraste por función (aliados, objetos, salidas pintados con colores fijos y el escenario apagado, como
TLOU2), contornos en lo importante, lupa (×2–×10), texto de los paneles escalable a 200 %, subtítulos de
32 caracteres × 2 líneas. Cuesta GPU en gafas: **medir** en el banco de cuadro antes de prometerlo en Quest.

### V12 — Guía IA (espera a P4b)
Un agente que acompaña, describe y lleva: primero desde los datos (V5), luego un LLM que razona sobre esos
datos (sin píxeles, no inventa objetos), y solo al final un modelo que mira la imagen, marcado como IA.

### V13 — Subtítulos de voz (espera a M17)
Transcripción una vez por quien habla, en el servidor, solo si cerca hay alguien con subtítulos; nombre de
quien habla y flecha si está fuera de la vista; quien habla ve que hay subtítulos activos. Texto que habla
para quien no puede hablar. Coste: ~0,7–1,7 céntimos por minuto de quien habla.

### V14 — Página compañera (espera a V4)
El móvil o el PC, vinculados (I1), muestran en HTML accesible lo que pasa en las gafas: chat, avisos, lista
de lo cercano, tienda. Así una persona usa su lector o su línea braille mientras otra lleva las gafas. Solo
es posible porque somos web.

### V2 — Prueba en aparatos (con Pablo)
Quince minutos: en Quest 3 y Pico 4, dentro de una sesión inmersiva (`npm run dev:lan`), ¿habla
`speechSynthesis`? ¿escucha el reconocimiento de voz? ¿llega «menos movimiento»? ¿vibran los mandos? En
iPhone: Safari no vibra desde la web. El resultado va a `docs/SABER.md` §2 y decide V3.

### N2 — Menú de ajustes (lo que añade la accesibilidad)
Los menús, la tienda, la cuenta y el chat son **HTML de verdad**, no dibujos en el lienzo (los lee el lector
y lo exige la ley para servicios al público: RD 193/2023). Lee las preferencias del sistema antes del primer
cuadro (V7). Guarda en local hasta que exista I1 (V8).
**Paridad Hyperfy2 (15-10):** lo que tienen sus ajustes: resolución, sombras y posprocesado (H12), volumen de
música, efectos y voz, tamaño de la interfaz, mostrar los avisos de acciones, estadísticas en pantalla.

**Hecho (15-10, rama `wt/ajustes`).** Un ajuste es un dato: el motor (`packages/client/src/ajustes-motor.ts`), cada función (`ajustes: [...]` en `defineFeature`) y cada mundo (`mundo.ajustes.json`, `ajustes-mundo@1`) declaran los suyos y el menú los pinta solo (tecla O o el engranaje; diálogo modal con el foco dentro; cada control con etiqueta y descripción). Registro en `packages/client/src/ajustes.ts`; capacidades del aparato en `capacidades.ts` (se decide por capacidad, nunca por el nombre del navegador). Los del motor: calidad (preajuste), resolución, cuadros por segundo, modo batería, estadísticas, sombras, agua, partículas, HDR, sensibilidad e invertir eje de la cámara, menos movimiento, texto grande, alto contraste, anunciar, tamaño de la interfaz, ayuda, volúmenes (suenan con H5) y el informe T1. Se guarda solo lo elegido (con versión y migraciones); lo demás sigue al aparato y se aplica antes del primer cuadro; los agentes usan lo mismo (`window.__numinia.ajustes`). Al juntar: la cámara ganó `view.cam.ajustar` (sensibilidad 25–300 %, invertir eje) y al entorno solo se le pide lo elegido (el resto sigue el nivel que ve el entorno, que pasa a B al entrar en VR). **Medido:** 15 pruebas (`test/ajustes.test.ts`); pierna `tools/e2e-piernas/ajustes.mjs` en chromium y firefox (23 controles con etiqueta; O abre; ← deja la resolución en 95 % y se aplica; recargar la conserva; un agente que pide 3 % recibe el error con el rango; quien pide menos movimiento arranca con él); arranque +12 kB gz. **Falta:** ajustes en VR (N3), cambiar teclas (N4), posprocesado y antialias (H12b), daltonismo y modo sentado (V7), lupa (V11), mezclador (H5, V6), ajustes con la persona (V8), indicador «personalizada».

### F2 — Grupos (lo que decidió `PREGUNTAS.md` #19)
La pieza ahora, la pantalla después: un grupo es un id compartido que el servidor conoce; a los de tu grupo
los ves siempre aunque la plaza esté llena (prioridad en el área de interés), cruzan un portal juntos
(reserva de plaza conjunta) y tienen su canal de chat y voz.

## Lo que faltaba de `CONSTRUIR.md` (piezas M, O, W, 15-10)

Mismos números que en `../mmo-browser-study/CONSTRUIR.md` para poder seguirlos. Las piezas de la ciudad
(C1–C8: cuentas, Postgres, roles de la casa, la interfaz de Numinia) no son del motor y no entran aquí.

### M16 — Carga de zonas
Manifiesto JSON con esquema por zona: cada fichero con su sha256, tamaño, clase (`arranque` para jugar,
`fondo` justo después, `perezoso` al acercarse) y orígenes. El cliente descarga por clases, comprueba el
hash, guarda en la caché del navegador (Cache API u OPFS) por hash y no vuelve a bajar lo que ya tiene.
Trozos con Brotli desde una CDN, nunca desde el VPS del juego. **Hecho cuando:** e2e: segunda carga de la
zona sin descargas (todo de caché); un fichero con hash falso se rechaza; tiempo hasta jugar medido.
**Paridad Hyperfy2 (15-10):** pantalla de carga con progreso (su `ClientLoader` precarga y lo enseña).

### O2 — Origen de reserva (espera a M16)
El manifiesto lista varios orígenes; si el primero no contesta en ~3 s (o da error), el cliente usa el
siguiente y lo recuerda un rato. El segundo origen real (fuera de Cloudflare) lo monta Pablo. **Hecho
cuando:** e2e con el primer origen caído carga la zona desde el segundo.

### M21 — Ingesta de contenido (espera a M16)
Herramienta de línea de órdenes: glTF/GLB → validar (triángulos, draw calls, texturas, tamaño por zona del
nivel B: `limits.json`), exigir licencia por fichero (CC0/CC-BY/propia) y por VRM (sus campos de licencia),
aceptar los sufijos de colisión de Hyperfy y convertirlos en datos de física, **colisionadores sin
cuantizar**, comprimir (gltfpack/meshopt, KTX2), escribir el manifiesto de M16. Rechaza lo que se pasa, con
un error que dice cuánto sobra. **Hecho cuando:** tests con tres ficheros de prueba (uno bueno, uno que se
pasa, uno sin licencia).

### M23 — CLI completa
`check` (valida esquemas, manifiestos y licencias de una carpeta), `shot` (captura sin pantalla desde una
cámara con nombre), `diff-shot` (compara con una imagen de referencia y da el porcentaje distinto),
`replay` (reproduce una grabación de entradas y comprueba la huella). Ya existen `run` y `describe`.

### M25 — Imágenes de referencia
La plaza con semilla fija, capturada en WebGPU y en WebGL2 (GL por software) desde 3 cámaras; `diff-shot`
contra las guardadas con un umbral. Fuera de las puertas por defecto (cuesta segundos y CPU): entra en
`tools/auto.sh e2e`.

### M18 — Medios (función J7)
Pantalla de vídeo en el mundo; la reproducción sigue el reloj del servidor (todos ven el mismo segundo);
solo se reproduce si está cerca y a la vista (móvil frío).
**Paridad Hyperfy2 (15-10):** como su nodo `Video`: fichero o URL, bucle, ajuste a la pantalla, con o sin luz,
audio espacial por el mezclador de V6; y la pantalla compartida de alguien (con M17).

### P5 — El cerebro (diseño: `../mmo-browser-study/DISENO-IAS-MOTOR.md` §4–§5)
**P5a (para Opus).** Lo que enseñó el agente de Hyperfy (`docs/SABER.md` §3.5) llevado al servicio de habitantes: un
módulo «puente» dentro de `numinia-habitantes` que guarda la clave (pedida sin eco por `instalar-motor.sh`, fichero 640,
nunca en git ni en el mundo), aplica topes de gasto por habitante y por mundo, elige cerebro (Claude primero; Hermes como
opción) y registra el consumo. E1 (redacta la frase escrita) y E2 (contesta libre cuando le llaman), con `sentidos()`
como `<material>`, verbos como herramientas limitadas al catálogo y validación en código; si cae el modelo, baja a E0.
Antes de la primera llamada real: leer la documentación actual de herramientas y salidas estructuradas (D4), revisar
contrato y retención del proveedor (D7, skill `vendor-gdpr-due-diligence`) y recalcular el coste con precios vivos (D8).
Sin LLM en las pruebas: cerebro de eco. **Hecho cuando:** test sin pantalla: le hablan por su nombre, contesta con un
gesto de la lista y descarta uno inventado; un texto con «SISTEMA:» dentro del material no cambia sus instrucciones;
sin clave o sobre el tope, contesta con E0.

**P5b.** E3 (habla o actúa por evento con espera mínima entre llamadas), gestos con clips (los cinco de §3.4), persona
en `habitantes/<id>.md`, medidor de consumo visible para quien administra.

### M6 — Física (para Opus)
Rapier determinista (`rapier3d-deterministic-compat` de dimforge, 0.21.0 comprobada el 14-10, Apache-2.0;
versión exacta) en el
servidor y en el cliente dentro de la simulación compartida; controlador de personaje (suelo, pendientes,
escalones); colisionadores desde M21. Cambia la huella: versión de formato nueva. Medir el coste por tick con
1.000 personas antes de decidir (¿física para todos o solo cápsulas?).
**Paridad Hyperfy2 (15-10):** lo que tiene su PhysX: colisionadores caja, esfera, malla y convexa, también como
disparador (entrar y salir de una zona); cuerpos estáticos, cinemáticos y dinámicos con contactos (decidir si los
dinámicos viven solo en el servidor y llegan como estado, o en la simulación); rayo y solape de esfera con capas
(los usarán los scripts, M20); controlador cinemático para personajes no jugadores; articulaciones al final. Lo
primero: pisar el escenario base, un objeto de H1.
**De J2 (15-10):** `groundHeight(x, z)` en `packages/sim` es el enganche; falta pegar al suelo en pendientes, tiempo de coyote y juzgar la lista de alturas del snapshot respecto al suelo bajo cada avatar. La cámara que no atraviesa lo construido es N1b.
**Decidido (18-10, diseño medido, opción A):** nada de Rapier por ahora: +1,2 MB gz en cada teléfono y 41 ms p50 por tick con 1.000 personas (el tope es 25) frente a ~3-8 ms de un trimesh + BVH propio en enteros que no toca la huella `93b192c8` (la malla, como las cajas, es geometría del mundo que ambos lados construyen del mismo estado). Quince historias de ≤ 30 min; Rapier solo en el servidor el día que hagan falta cuerpos dinámicos (H4c), con ficha propia.
**Hecho (18-10, h1-h2, rama `feat/m6-collision-schema-glb`).** (h1) `objetos` versión 6, aditiva: campo `colision: ninguna | caja | malla` en el estado y en `ajustar`; `solido` se queda como la bandera de caja que leen la simulación y las páginas de antes (`solido: true` sin `colision` = `caja`; `colisionDe()` en `feature.ts`), el servidor escribe `colision: caja` al arrancar en lo guardado como v5; `malla` solo para un modelo (una imagen o un vídeo pueden ser caja), y hasta h5 un `malla` conserva su caja (nunca choca peor que `caja`). (h2) `packages/server/src/colision-glb.ts`: `triangulosDeGlb(bytes, { max })` lee un .glb sin three: nodos de la escena con sus transformaciones (matriz o TRS, padres primero), POSITION en todos los tipos de `KHR_mesh_quantization` (byte, short, normalizados o no, con `byteStride`), con índices u8/u16/u32 o sin ellos, listas, tiras y abanicos de triángulos; `EXT_meshopt_compression` descodificado con meshoptimizer (el mismo del optimizador); rechaza con motivo Draco, accessors dispersos, buffers fuera del fichero, más de `max` triángulos (`TRIANGULOS_MAX_MALLA` 50.000, propuesto; lo publica h15). Salida: vértices en el espacio del modelo, tres índices por triángulo, cuenta, nodos con malla, primitivas saltadas (puntos, líneas). **Medido:** `test/colision-glb.test.ts` (9): bloque 12, farolillo 220, RobotExpressive 3.237 triángulos; la copia meshopt del farolillo da los mismos 220 y la misma caja a < 1 cm; un .glb v5 guardado vuelve con `colision: caja`.
**Hecho (18-10, h3-h4, `packages/sim/src/bvh.ts`).** Árbol BVH entero sobre triángulos cuantizados a 1/64 m (`buildBvh`, hojas ≤ 8, FNV-1a de huella) y `rayBvh` (Möller–Trumbore en enteros); `groundHeight` usa un rayo hacia abajo desde `STEP_UP` sobre los pies cuando el estado trae una malla (`setMesh`). **Medido:** `test/bvh.test.ts` (50k triángulos construidos en < 100 ms; el navegador da la misma huella y el mismo rayo que Node).
**Hecho (18-10, h5-h7, rama `m6h57/ola3`).** (h5) `boxBvh` (consulta caja-triángulo exacta sobre el árbol) + `blockedMesh`: un cuerpo que solapa un triángulo demasiado empinado para pisarlo (pared o techo) queda bloqueado igual que una caja sólida (`blocked` combina cajas y malla); una pared o un techo de la malla detienen a quien camina, igual que las cajas de U10. (h6) `triNormal` da la normal unitaria de un triángulo (siempre hacia arriba); `MAX_SLOPE_COS` (cos 50°, como el límite por defecto de Rapier) decide pared vs. rampa: una rampa de 20° se sube andando y su altura la da `groundHeight`, pero un lado a 60° no se puede subir y empuja como una pared; al tocar una pared o una rampa demasiado empinada en diagonal, solo avanza el componente tangente (igual que U10 con cajas). (h7) los pasos y el pegado al suelo de h3-h4 (`STEP_UP`/`SNAP_DOWN` sobre el rayo) siguen valiendo con paredes en el mismo mundo. **Falta:** tiempo de coyote (salto al borde) con malla — no tocado hoy, ver `PREGUNTAS-m6h5-7.md`. **Medido:** `test/fisica-malla.test.ts` (7 pruebas): pared de malla detiene, rampa de 20° se sube, rampa de 60° no, deslizar en diagonal, techo bajo bloquea el salto, escalón de 25 cm con pared lejana sigue funcionando, huella de referencia intacta. **Falta (otras):** h8-h15 (`DISENO-M6-fisica.md` §4): presupuesto por tick, la página, cámara N1b, zonas, `api.rayo`, inspector, sufijos de Hyperfy, límites publicados.

### M10 — Servidor de instancia completo (para Opus)
Regiones en `worker_threads` (una sola hebra se rompe entre 3.000 y 4.000), traspaso entre regiones sin
saltos, y copias de la instancia cuando se llena (con grupos que entran juntos, F2). Junto con S3
(dilatación).

### M19 — Formato de app (para Opus)
La unidad de contenido decidida en `EVALUACION-MOTORES-2026.md` §3.4: carpeta `app.json` (con `schema` y
versión, nombre, licencia, modelo por hash, propiedades y eventos con esquema, dependencias, ficha
`accesible`) + `main.ts` tipado contra la API pública + `assets/<sha256>` + `README.md`; `build` produce el
paquete de entrega (glTF con la extensión `NUM_app`, o zip firmado) que nunca se edita. Migraciones
automáticas entre versiones. Leer antes `notes/16-content-unit-hyp-vs-alternatives.md` y `16a`.
**Paridad Hyperfy2 (15-10, `docs/HYPERFY2-PARIDAD.md` §2):** una app es una función J7 que se carga en marcha
desde la carpeta del mundo (misma declaración: verbos con nombre hablado, eventos con anuncio, estado con ficha).
Sus nodos (Mesh, Collider, RigidBody, Audio, Video, Image, UI, Particles, LOD, Anchor, Action, Snap, Group) son
componentes con esquema en `app.json`; los campos de propiedades (texto, número, rango, interruptor, lista,
fichero, color, curva, como `app.configure`) salen del esquema y los pinta el inspector de M22.

### M20 — Scripts de mundo (para Opus)
`main.ts` de cada app corre en el servidor, en un compartimento SES (clases congeladas) con tope de CPU por
tick y de memoria; solo ve la API pública (la de J7 ampliada). `KHR_interactivity` como escalón sin código
cuando three o nosotros lo lean.
**Paridad Hyperfy2 (15-10):** la API equivalente a la suya (`src/core/systems/Apps.js` del fork): mundo (`add`,
`remove`, `attach`, `on`/`off`/`emit`, la hora, `chat`, los jugadores, `raycast` y `overlapSphere` de M6,
`get`/`set` = `api.store`, `open`, `load`), app (`on`/`off`/`send`/`sendTo`/`emit`, `create`, `control`,
`configure`, `state`, `props`) y jugador (los efectos de H2, `getBoneTransform`, avatar de la sesión). La mitad
del cliente puede tomar el control (`control`: teclas y cámara para un vehículo o una escena). Editar el script
desde el navegador, con recarga en caliente, solo para administración.

### M9 — WebTransport (para Opus)
Mismo esquema de mensajes, transporte por HTTP/3 con datagramas para los snapshots. No hay servidor de
producción en JavaScript: decidir entre un proxy (Caddy/quic-go) o un servicio aparte; el transporte doble de
Hytopia (MIT) es lo más aprovechable. UDP 443 abierto en el servidor.

### M22 — Constructor en el mundo
**Cambio (15-10, paridad Hyperfy2, `docs/HYPERFY2-PARIDAD.md` §2):** se construye **en vivo**, como en Hyperfy2,
no por PR. Modo construir (tecla o botón; en VR, con el mando) para quien tenga permiso (H1; roles con H3):
coger y llevar, gizmos de mover, girar y escalar con pasos (grados), duplicar, borrar, fijar, deshacer; soltar
ficheros (H9) para crear objetos; puntos de encaje (su nodo `Snap`); inspector de propiedades por esquema (M19);
lista de las apps del mundo con su coste (triángulos, texturas, MB, como su `AppsList`); jerarquía de nodos;
biblioteca de la casa (como sus colecciones: Imagen, Modelo, Texto, Vídeo). Todo cambio pasa por H1: llega a
todos al momento, se guarda como texto y se puede deshacer. Un agente de IA construye igual que una persona si su
rol se lo permite (Pablo, 15-10: «los agentes tendrán también sus permisos»); lo que hace queda firmado como suyo.
Cantera: `oncyberio/awe` (MIT). **Hecho cuando:** e2e: la pestaña A entra en modo construir, mueve y
gira un objeto con el gizmo y deshace; la B ve cada paso; un visitante no ve el modo construir.

**Hecho (15-10, escritorio; rama `wt/constructor`).** `packages/render/src/gizmo.ts`: `view.pick`, `view.puntoBajo` (suelo o encima de otras cosas), contorno amarillo y `TransformControls` de three (X rojo, Y verde, Z azul; mover, girar, escalar; mundo/local; paso; un eje), perezoso (5,45 kB gz). La selección y la herramienta viven en `features/objetos/client.ts` (la usan el panel, el gizmo y los agentes: `seleccionar`, `transformar`, `colocarEn`, `rehacer`, `modo`). Intento nuevo `rehacer` (objetos v2). Panel nuevo (`apps/plaza/constructor.ts`): herramientas, ejes, paso, biblioteca que sigue al puntero y se coloca donde apuntas, «Delante de ti», inspector con campos, ayuda de teclas. Teclas: C o Tab abre; clic selecciona; 1 coger (rueda gira, Mayús+rueda escala), 2 o G mover, 3 o R girar, 4 escalar; X/Y/Z eje; T local/mundo; Ctrl sin paso (0,5 m, 15°, 0,1); Mayús+D o Ctrl+D duplica y coge; Supr borra; Ctrl+Z / Ctrl+Mayús+Z / Ctrl+Y; P fija; F encuadra; N inspector; Esc devuelve o deselecciona. Red: como mucho 8 `mover`/s y un latido cada 0,5 s (un arrastre = un paso de deshacer); nada salta atrás. **Medido:** 96 pruebas en su rama (+4); pierna `tools/e2e-piernas/constructor.mjs` con ratón y teclado de verdad en chromium y firefox (coloca donde apuntas, clic selecciona, arrastra el asa X 1,5–2 m, gira 135°, deshacer/rehacer llegan a B, borra); WebGPU de verdad probado a mano. **Falta:** VR y móvil (M22b), puntos de encaje, selección múltiple y jerarquía (M22c), inspector por esquema (M19), lista de apps con su coste.

### M26 — MCP del motor (espera a M19 y P4b)
Tres herramientas: leer una zona (con el cuerpo de P4: lo que ve un jugador, no un volcado del servidor), proponer un
cambio de manifiesto, abrir un PR. Nunca publica sola: la etapa de autonomía la abre Pablo (`docs/SABER.md` §5).

**Trozo 1 hecho (16-10, rama `agentes/puerta`; numinia-archive ADR-080: una sola puerta para la IA que vive fuera).**
Formato `agente@1` (`aventura/agentes/<id>.json`: id, nombre — el servidor pone « · IA» —, responsable, clave PÚBLICA
Ed25519 como `ed25519:<base64url de los 32 bytes>`, rol?, presencia?, notas?; `tools/aventura.ts` lo comprueba; una clave
privada se rechaza). Billete `a2.<id>.<ms>.<nonce>.<firma>` firmado por el agente sobre el nombre del mundo
(`MOTOR_DOMINIO` o el host al que se conecta), ± 2 min, una sola vez. Lo que puede una IA = su rol ∩ {entrar, construir}:
nunca modera. Órdenes del dueño en el chat: `/agente añadir <id> <nombre…> <clave> [rol]`, `/agente quitar <id>` (cierra
con 4003), `/agente`. Llave del agente: `node tools/agente.ts nuevo <id>` (privada 600 en `~/.numinia/agentes/`).
Puente: `tools/mcp-mundo.ts`, MCP por stdio hecho a mano (sin dependencias), con el cuerpo de P4: mirar, decir, ir_a,
colocar, mover, borrar, deshacer, oir. Cómo conectar Hermes: `packages/agent/README.md`. **Puerta HTTP para el panel de numinia.com (hecho):** `GET|POST /agentes` y `DELETE /agentes/<id>` (`packages/server/src/agentes-http.ts`, `test/agentes-http.test.ts`) con el pase H3b (`manage-organization` o dueño; 401/403; 404 sin `MOTOR_PASE_CLAVE`) y CORS solo para `https://numinia.com`; mismo código que `/agente` (`roles-mundo.ts`). **Falta del lado de numinia.com:** la pantalla del panel que las llama, y que el pase de gestión lleve `manage-organization`. **Medido:** pruebas
`test/puerta.test.ts` y `test/mcp-mundo.test.ts` (el puente como proceso hijo contra un servidor real: coloca, mueve y
borra en el estado de objetos del servidor; `/agente quitar` lo cierra con 4003 y no vuelve). **Falta:** las herramientas
servidas por el propio mundo (MCP por HTTPS), proponer cambio y abrir PR (espera a M19), el timbre que despierta a un
agente «a demanda», el instalador pasando `--dominio` como `MOTOR_DOMINIO`, y el chat del mundo como canal de Hermes.

**IAs de organización (IA-ORG, motor hecho; rama `agentes/de-organizacion`).** Contrato en `ia-organizacion/SPEC.md`. `pase.ts`
acepta `kind:"agent"` + `state:"activa"|"dormida"` + `sub a_<32 hex>` (los tres juntos, nunca en el pase de una persona; los
extras desconocidos se siguen rechazando; la altura de una IA nunca es de dueño). Entra como `ia-a_…`, nombre + « · IA», permisos del
pase ∩ {entrar, construir}, sin ficha en `aventura/agentes/`. Vive mientras su pase valga: `roles-mundo.ts` la cierra con 4003 al
`exp` si no llegó otro PASE (`Instance.renovarPase`: un PASE tras la identidad, solo para IAs con pase; renovaciones a lo sumo
1/s; mismo agente, mundo y organización; no más viejo que el que tiene); una segunda conexión del mismo agente echa a la
primera. `GET /agentes` suma las conectadas con `organizacion: true` y `estado`; `/status` dice `mundoPase` (el `aud` que el
puente pide). Puente: `NUMINIA_URL` + `AGENTE_ORG` (+ `AGENTE_MUNDO`), `pase-org.ts` (`pedirPaseHttp`, inyectable),
renueva a los ~8 min, `apagada` = sale y lo dice por stderr, `mirar` da el estado, dormida no construye ni habla si no la llaman por
su nombre. **Medido:** pase de IA 551 bytes típico, 1.693 el peor (tope 2.048); `test/pase-ia.test.ts` (8) y
`test/puente-org.test.ts` (4: numinia.com falso con `node:http`, servidor real, puente real, pases de 3 s). **Corte 2, token (rama `agentes/token`):** `AGENTE_TOKEN`/`--token` (`ntk_`+43 base64url, forma comprobada antes de toda red) en vez de `AGENTE_CLAVE`; ambos = error; `pedirPaseToken` hace `POST /api/agents/pass` con `Authorization: Bearer` y `{org, agent, aud}`; 401 = «token malo o renovado» = final (`motivo:"token"`), 403 apagada igual que antes; el token se borra de cualquier texto que vuelva de numinia.com y no sale por stderr/stdout; `test/puente-org.test.ts` (9) con el numinia.com falso en los dos modos. **Falta:** la mitad de
numinia.com (till, `POST /api/agents/pass`, panel) y probar contra ella; avisar a la IA dormida de que la han llamado fuera del chat
cercano; reconectar tras 4003 por caducidad usa el backoff normal (hasta 30 s).

### O4 — Seguridad (espera a I1 y S4)
Billete firmado y con caducidad para entrar a una instancia (de I1); tope de conexiones por IP y de mensajes
por segundo; sin grabar voz; exportar y borrar lo tuyo. Lo legal (consentimiento a los 16) lo confirma Pablo.

### O3 — Observabilidad (espera a X3)
Con los números del servidor real: un panel (lo mínimo: una página que lee `/metrics` por el túnel) y avisos
cuando el p99 del tick, el steal o la memoria pasan de su umbral (`puertas.ts`).

### M17 — Voz por cercanía (necesita aprobación)
LiveKit (Apache-2.0); suscripción solo a las N voces más cercanas (N lo decide Pablo), DTX, modo escenario
para eventos grandes (una voz para todos). Es el coste que manda a escala (`docs/SABER.md` §3.1).
**Paridad Hyperfy2 (15-10):** Hyperfy tiene voz espacial con LiveKit y deja compartir la pantalla en una
pantalla del mundo; lo segundo va con M18.

### W1 — La plaza de entrada (necesita aprobación)
El primer mundo, al presupuesto de la Quest (`limits.json`, nivel B), con un portal a un mundo Hyperfy de
hoy. Qué mundo lo estrena es pregunta abierta de Pablo.

### O5 — El motor en la Summa (necesita aprobación)
Un ADR y un SYS del motor en numinia.org, cuando Pablo lo diga (rama, PR y revisores según sus reglas).

## Paridad con Hyperfy2 (H) — de `docs/HYPERFY2-PARIDAD.md` (15-10)

Pablo (15-10): «¿qué falta para llegar como mínimo al nivel de Hyperfy2?». La tabla capacidad por capacidad, las
decisiones (§2) y las tres paradas (§5) están en `docs/HYPERFY2-PARIDAD.md`. Lo que Hyperfy hace mal no se copia
(`docs/SABER.md` §4). Cada fila dice qué nodo o sistema de Hyperfy cubre, para comprobarlo en el fork
(`../numinia-hyperfy2/src/core/`).

### H1 — Objetos del mundo (para Opus)
Lo que se coloca en el mundo y se queda: lo que en Hyperfy son `blueprints` + `entities`. Cada objeto: id, modelo
(sha256 de un `.glb`), posición, giro (cuaternión), escala, propiedades (JSON; con esquema cuando exista M19),
ficha accesible (V1: nombre obligatorio si se puede usar; lo decorativo se marca como decorado, igual que
`alt=""`), autor (id de invitado, I1) y fijado (no se mueve sin quitarlo antes). Decisiones
(`docs/HYPERFY2-PARIDAD.md` §2): la lista de la zona llega entera a quien entra (con tope medido) y los cambios,
a toda la zona; los ficheros de los modelos se bajan por distancia, lo cercano primero; se guarda como texto en
la carpeta del mundo (foto + diario, como S4); se construye en vivo: colocar, mover, girar, escalar, duplicar,
borrar y deshacer (pila por constructor, en el servidor), solo con permiso — hasta H3, el mundo entero abierto o
cerrado a construir con una variable, como el `public` de Hyperfy. Los agentes de IA, igual que las personas:
según su permiso (Pablo, 15-10). Si el
modelo trae animaciones, la primera va en bucle. Los ficheros los sirve el servidor por hash (`/a/<sha256>`,
caché larga) hasta que exista M16. **Hecho cuando:** e2e: la pestaña A coloca un GLB CC0 y la B lo ve; mover,
borrar y deshacer llegan a B; tras reiniciar el servidor sigue ahí; sin permiso, se niega; un objeto usable sin
nombre se niega; medido lo que cuesta entrar en una zona con 2.000 objetos (bytes y ms), apuntado en
`limits.json`.

**Hecho (15-10, sesión con Opus).** `features/objetos/` (declaración, servidor, cliente, `biblioteca.json`) +
`activos/` (la biblioteca de la casa: `casa/bloque.glb`, obra propia hecha por `tools/hacer-bloque.mjs`, y el
robot CC0, movido desde la página) + `packages/server/src/activos.ts` (`GET /a/<sha256>.<ext>`: indexa `activos/` por
sha256 al arrancar y mira `ACTIVOS_DIR` para lo que suba H9; caché de un año, cualquier origen). Decisiones:
(1) cada objeto es una entrada del estado de `objetos` **sin `at`** (llega a toda la zona y a quien entra; persist
de S4); (2) giros en **grados** (`ry`, luego `rx`, luego `rz`) y escala por eje, no cuaterniones: un agente y una
persona leen «ry: 90»; (3) quién puede lo dice el servidor con `api.puede(entidad, "construir")` (nuevo en el
enchufe; hoy `MOTOR_CONSTRUIR=todos` o nadie, que es lo de fábrica; la plaza de casa y el e2e lo abren; H3 lo hará
por rol, personas y agentes igual); (4) **quién colocó qué** se queda en el almacén del servidor (`a:<id>`), nunca
en lo que reciben las páginas; los ids no se repiten tras reiniciar (contador guardado); (5) deshacer: los 50
últimos cambios de cada constructor (por identidad; sin ella, por conexión), un arrastre de menos de 1 s es un solo
cambio; (6) sin nombre solo si es decorado: una ficha con nombre vacío no la leen ni el lector de pantalla ni los
agentes (cambio en `cards()`). Página: `view.place` en `render` (GLTFLoader + `SkeletonUtils.clone`, que solo se bajan cuando llega la primera
cosa: 15 kB comprimidos aparte; un fichero por modelo compartido por sus copias, 4 descargas a la vez la más cercana primero, la primera animación en bucle a menos
de 40 m), `view.here`, y un panel «Construir» (tecla C; botones HTML de verdad: colocar Bloque o Robot delante,
girar, mover, subir, escalar, duplicar, fijar, borrar, deshacer; R, Z y Supr con el panel abierto) que solo sale a
quien puede. Mejora del enchufe de paso: cada entrada de estado se codifica **una vez** y se reenvía (entrar en una
zona con 2.000 objetos: 7,2 ms → 0,3 ms del servidor). Instalador: Caddy pasa `/a/*`, `activos/` va dentro,
`deploy-check` pide el robot por su sha256. **Medido:** 9 pruebas nuevas (`test/objetos.test.ts`), 92 en total;
2.000 objetos = 186,8 kB al entrar; cliente al arrancar 245 kB comprimidos (antes 228; D2 pide ≤ 300); e2e: la pestaña A coloca un bloque, la B lo dibuja y lee su ficha «Bloque», A lo
gira 90° y deshace dos veces. **Falta (otras filas):** gizmos y soltar ficheros (M22, H9), roles (H3), colisión con
lo colocado (M6), propiedades y scripts por app (M19, M20), bajar el peso por objeto con un índice de modelos (M16).

### H2 — Lo que el servidor le hace a un jugador (para Opus; necesita J2)
Teletransportar, congelar, frenar, empujar, gesto forzado, sentarse o anclarse a un objeto (su nodo `Anchor`),
volar (con permiso, H3; correr dobla la velocidad, como en Hyperfy) y salud (`damage`/`heal`, que se ve en el
nombre). Entran en la simulación como órdenes del servidor con su tick, grabadas junto a las entradas: la
repetición da la misma huella y la predicción del cliente las aplica sin tirones. Hyperfy lo hace en el cliente y
se fía. Empujar y volar necesitan la velocidad vertical de J2. **Hecho cuando:** test sin pantalla: una grabación
con teletransporte, congelar y empujar se repite con la misma huella; e2e: un asiento sienta al avatar y la otra
pestaña lo ve sentado; sin permiso no se vuela.

### H3 — Roles del mundo y órdenes (para Opus)
Tres roles por identidad (I1), guardados (S4): administrador, constructor y visitante; un mundo «abierto a
construir» hace constructores a todos (el `public` de Hyperfy). El rol de admin se da con un enlace firmado de un
solo uso que imprime `npm run admin` (mejor que un código escrito en el chat); con chat (J3), también
`/admin <código>`, como en Hyperfy. Órdenes: `/nombre <nombre>` (se guarda con la identidad), `/aparecer aquí` y
`/aparecer quitar` (punto de aparición), `/chat borrar`, `/servidor` (CPU, memoria, personas, tick p99). Las
funciones reciben el evento `orden` (su `command`, el que usa Procyon) y preguntan `api.rol(quien)` y
`api.puede(quien, "construir" | "volar" | "subir" | "administrar")`. Los agentes de IA tienen identidad y rol como
cualquiera (Pablo, 15-10: un agente con permiso construye en directo); su identidad dice que es una IA y lo que
hace queda firmado como suyo (P4a: billete de agente, id `ia-<id>`, nombre con « · IA» que pone el servidor; `/nombre`
no puede acabar en « · IA»). **Hecho cuando:** test: el enlace hace admin a esa identidad y no sirve dos veces; un
visitante no construye; el rol sobrevive a un reinicio.

### H3b — El pase de numinia.com (hecho: servidor, mensaje PASE y página)
Contrato: cabecera de `numinia-web apps/store/src/lib/world-pass.ts` (#144). **Hecho (16-10, rama `roles/pase-h3b`):**
`packages/server/src/pase.ts` (verificador puro con `node:crypto`, cero dependencias: EdDSA, `typ`, `kid`, firma, forma exacta,
`iat/exp` con 60 s de margen, `aud` = este mundo, `org` si se fija; los permisos que el motor no conoce se descartan, no fallan;
devuelve el motivo con el texto que dice cómo arreglarlo) y `configPase`: `MOTOR_PASE_CLAVE` (la clave pública cruda en
base64url o el JSON de `/.well-known/world-pass-key.json`), `MOTOR_PASE_MUNDO` (el `aud`), `MOTOR_PASE_ORG` (opcional). Sin
clave: el pase se ignora y el registro lo dice en una línea; con clave rota o sin `MOTOR_PASE_MUNDO`, el servidor no
arranca y dice qué arreglar. `Instance.identificar(entidad, token, pase?)` + opción `credencial`: un pase bueno nombra a la
persona (id = `sub`, nombre del pase o «Invitado XXXX»; la misma persona en dos aparatos es una) y sus permisos, altura y roles
REEMPLAZAN a los que el mundo guarda para ella (`roles-mundo.ts`, el mismo `puede`; los dueños por `/dueño` siguen siéndolo; un
dueño del pase queda por encima de todos; `/dar` y `/quitar` no tocan a quien viene con pase). Un pase malo o caducado deja un
visitante y una línea en el chat que dice por qué; con «solo miembros» se entra con `enter-worlds` en el pase. Un pase vale para
un mundo (`aud`) y diez minutos: dentro de una sesión abierta no se vuelve a mirar (renovarlo dentro queda fuera de alcance).
Tests: `test/pase.test.ts`, `test/pase-mundo.test.ts`. **El cable (16-10, decidido por Pablo: mensaje nuevo, aditivo):**
tipo `PASE` = 12 en `net` (`encodePase`/`decodePase`): `[12, token en ASCII]`, tope propio `PASE_MAX` = 2.048 bytes con el byte de
tipo; IDENTITY (121) no se toca. La página (`tomarPaseDeLaDireccion`, `packages/client`) lee `#pass=<token>` de `location.hash` al
arrancar, lo quita con `history.replaceState` (deja el resto del hash y la ruta) y, ya conectada, manda PASE y justo después
IDENTITY. El servidor guarda el pase en la conexión hasta que llega IDENTITY y entonces llama a
`Instance.identificar(entidad, token, pase)`. Un PASE mal formado, repetido o tardío (después de IDENTITY) se cuenta
(`conn.bad`) y se ignora sin cerrar la conexión, como el resto; un mundo sin `MOTOR_PASE_CLAVE` lo ignora sin contarlo. Una página o
un servidor viejos que no conocen PASE se comportan como hoy (el servidor viejo cuenta el tipo 12 como desconocido; la página
vieja nunca lo manda). **`maxPayload` del WebSocket sube de 1024 a 2048**, y no más, solo porque un PASE de 2.048 tiene que
caber; la librería mira el tamaño antes de leer nada, así que no se puede mirar el tipo antes. Para que nada más cambie,
`wsTransport` corta como antes (cierre 1009) cualquier trama que no sea PASE y pase de 1.024. Más de 2.048: lo cierra la librería.
**No es un cambio de formato** (AGENTS.md, Autonomía): tipo nuevo aditivo; `WIRE_FORMAT` sigue en 2 y la huella `93b192c8` no
se toca (la simulación no cambia). Pruebas: `test/pase-cable.test.ts` (mensaje, dirección, cliente + Instance sin red, servidor
con WebSocket de verdad: pase de 1,8 KB pasa, 1.025 bytes de otro tipo cierra, 2.049 cierra, PASE repetido o tardío se cuenta y
la conexión sigue), `tools/e2e.mjs` (chromium y firefox: la página con `#pass=` lo quita de la barra y entra) y
`test/mensajes-tope.test.ts` (presupuesto de tamaños, `docs/FICHA-TECNICA.md`). Medido: un pase mide 630 bytes con un rol y
1.813 en el peor caso que numinia.com puede emitir hoy (5 roles, 8 permisos, nombre de 40 caracteres CJK). **Riesgo:** el emisor no
corta `name`: uno de 200 caracteres da 2.423 bytes y la página no lo envía (entra como visitante sin aviso); pedir a
numinia-web que lo corte a 40. **Fuera de alcance:** que numinia.com genere el enlace con `#pass=` y el instalador de la flota. El
instalador de la flota debe añadir `MOTOR_PASE_CLAVE`, `MOTOR_PASE_MUNDO` (y `MOTOR_PASE_ORG`) al entorno del contenedor.

### H4 — Entorno: cielo, luz, niebla y viento
Su nodo `Sky` (`bg`, `hdr`, `sunDirection`, `sunIntensity`, `sunColor`, `fogNear`, `fogFar`, `fogColor`) y su
sistema `Wind`, como datos: fondo (color, degradado o imagen equirectangular), mapa de entorno HDR (PMREM; 256 px
en móvil), dirección, intensidad y color del sol, niebla (cerca, lejos, color) y viento (dirección y fuerza: un
uniforme para la vegetación). Sale de un JSON con esquema (`entorno@1`) que el servidor manda al entrar y puede
cambiar en marcha (H7 lo editará); la plaza trae uno por defecto. En móvil y Quest, sin HDR grande. **Hecho
cuando:** test del esquema; e2e: el servidor cambia el entorno y la otra pestaña cambia su fondo (se comprueba
el estado del render), sin errores en chromium y firefox.

**Hecho (15-10, rama `wt/entorno`).** `features/entorno` (`entorno@1`: cielo, sol, hora y ciclo de día, luz de cielo o HDR, niebla, viento, suelo, tono; presets de día a nublado): una entrada por zona (todos ven el mismo cielo), en directo para quien construye, guardada; un mundo trae su `entorno.json`. Render en `packages/render/src/entorno.ts`: cielo TSL perezoso o cúpula, horneado a un cubo en móvil y XR; sol con sombras según el nivel; niebla del color del horizonte; suelos CC0 de Poly Haven en WebP. Sección propia en el panel de construir. **Medido:** pierna `tools/e2e-piernas/entorno.mjs` en chromium y firefox (el preset de A llega a B; agua y fuego colocados se dibujan con sus fichas; coste de A a D; todo vuelve a como estaba); nivel D: 12–22 llamadas y ~2.400 triángulos. **Falta:** H4b, H4c, M6b; probarlo en un móvil y unas Quest de verdad.

### H5 — Sonido del mundo (espera a V6)
Su nodo `Audio`: fichero, volumen, bucle, grupo (música o efectos), espacial (distancia de referencia y máxima,
caída, conos) o plano; pegado a un objeto (H1) o a un punto de una función (`at`). Usa el mezclador de V6
(volumen por grupo en ajustes, tope de fuentes por aparato, las de accesibilidad primero); suena tras el primer
gesto (regla de los navegadores); nada con la pestaña oculta. Cada sonido que importa tiene su texto (V1).
**Hecho cuando:** test de la mezcla con grupos; e2e: una fuente en bucle queda conectada y el `AudioContext`
corre, sin errores.

### H6 — Imagen y paneles en el mundo
Su nodo `Image` (ajuste contener o cubrir, con o sin luz, doble cara) y sus paneles `UI`, `UIView`, `UIText`,
`UIImage`: diseño flex (fila o columna, márgenes, huecos, alinear, bordes redondeados), texto e imagen, en el
mundo (fijo o mirando a la cámara) o pegado a la pantalla, con clic que dispara un verbo de la función. Se dibuja
en un lienzo y solo se redibuja al cambiar (móvil frío). Cada panel tiene su gemelo HTML, que lee el lector de
pantalla (`docs/SABER.md` §3.6). Diseño flex propio o dependencia MIT exacta con su peso medido (D2: cliente
≤ 300 kB). Legible en VR (J6). **Hecho cuando:** test del diseño (cajas calculadas de un panel fijo); e2e: un
panel con un botón en el mundo, el clic llega al servidor y el gemelo aparece en el árbol de accesibilidad.

### H7 — Ajustes del mundo (espera a H3)
Su `Settings`: título, descripción, imagen, escenario base (un objeto de H1), avatar por defecto, abierto a
construir y límite de personas; más el entorno (H4). Panel HTML solo para administración; se guarda como texto
en la carpeta del mundo; los cambios llegan a todos al momento. Título, descripción e imagen alimentan la ficha
`.md` del sitio para los agentes y la vista previa del enlace. Con el límite lleno, quien llega lee un aviso claro
(con M10, entra en una copia). **Hecho cuando:** e2e: el admin cambia el título y el cielo y la otra pestaña lo
ve; con límite 1, la segunda pestaña recibe el aviso.
**Hecho, primer corte (18-10):** `ficha@1` gana `avatar` (id de la casa, lo llevan todos) y `aforo` (1–1000,
`limits.json` `world_people_cap`, nunca por encima de la capacidad del motor); `GET /status` los publica; el nombre
sale en la pestaña y en la pantalla de entrada («Conectando a «…»»); lleno = cierre 4004 «lleno n/aforo» y aviso
centrado con `role=alert`. Abierto a construir ya lo cubre H3 (`/construir`). Falta: panel de administración para
editarlos en marcha (hoy, el fichero) y el escenario base (M6).

### H8 — Partículas
Su nodo `Particles`: forma (punto, esfera, cono, caja), ritmo y ráfagas, vida, velocidad, tamaño, giro, color y
alfa a lo largo de la vida (curvas), imagen u hoja de sprites, mezcla aditiva o normal, fuerzas. En la GPU,
instanciado, una llamada por emisor; tope de partículas por nivel de aparato en `limits.json`; parado cuando no
se ve; pasa el limitador de destellos de V7 si ya existe. Primer uso: la columna de luz de `despertar`. **Hecho
cuando:** test de las curvas y del tope; e2e con un emisor sin errores; coste por cuadro medido en el banco (P2).

**Hecho, primera parte (15-10, rama `wt/entorno`).** `features/elementos`: agua, fuego, humo y polvo como entradas con `at` y ficha (J9, S4). Partículas en la GPU (`particulas.ts`: una llamada por emisor, curvas, topes por nivel en `limits.json`, quietas lejos o fuera de vista); hoguera con llamas, chispas, humo y parpadeo de ≤ 3 destellos por segundo; agua con reflejos cerca en escritorio y normales que se mueven en lo demás. **Falta:** emisores como fichero (H8b).

### H9 — Subir ficheros
Arrastrar y soltar, como su `/api/upload`, pero con permiso: `POST` solo para quien construye (H1; roles con
H3), tope de tamaño por tipo, nombre = sha256 (lo que ya está no se vuelve a subir: se pregunta antes por el
hash), tipos permitidos `glb`, `vrm`, `png`, `jpg`, `webp`, `ktx2`, `hdr`, `mp3`, `ogg`, `mp4`, `webm`. Se guarda en
`ACTIVOS_DIR` y se sirve por hash con caché larga; cuando exista M21, cada fichero pasa su validación (límites y
licencia) antes de usarse; llevarlo a la CDN es M16. **Hecho cuando:** test: subir dos veces lo mismo guarda uno;
un visitante recibe 403; un tipo no permitido, 415; e2e: soltar un GLB lo coloca delante de quien lo suelta.

**Hecho (15-10, rama `wt/subir`).** `PUT /a/<sha256>.<ext>` con `Authorization: Bearer <billete de invitado I1>`; el servidor comprueba el billete y el mismo permiso `construir` (H3 lo hará por rol), calcula el sha256 y lee los bytes (`packages/net/src/ficheros.ts`, compartido con la página: un .glb entero, el resto por sus primeros bytes). 401 sin billete, 403 sin permiso, 415 tipo no admitido, 413 sobre el tope (glb y vrm 12 MB como Hyperfy2; imágenes 4; ktx2, hdr, audio 8; vídeo 32), 422 bytes malos o sha distinto, 507 sobre 1 GB en total, 503 con más de 4 a la vez. Lo repetido no se sube (la página pregunta antes con `HEAD`). Quién subió qué, en `<ACTIVOS_DIR>/subidas.jsonl`, nunca servido. `api.activo(sha, ext)` en el enchufe: `colocar` acepta lo de la biblioteca o lo subido. Página (`apps/plaza/soltar.ts`): soltar un .glb sobre el mundo lo sube y lo coloca donde cae (`view.sueloBajo`), con el nombre del fichero; botón «Subir modelo…» para teclado y lector. Instalador: `ACTIVOS_DIR` dentro de `datos/` (entra en la copia). **Medido:** 9 pruebas nuevas (`test/subidas.test.ts`, deploy); pierna `tools/e2e-piernas/subir.mjs` en chromium y firefox (cae a 0,01 m del punto bajo el puntero, B lo carga, el repetido no se sube, el roto se niega en la página); deploy-check: HEAD 200, PUT sin billete 401. **Falta:** borrar lo que nadie usa y cupo por identidad (H9b), licencia y límites por fichero (M21), colocar .vrm (H10), imágenes, audio y vídeo (H6, H5, M18).

### H10 — Tu avatar (J1 y H9 hechos)
Elegir entre los avatares de la casa (J1) o soltar tu `.vrm` (H9; validado: ≤ 10.000 triángulos y sus campos de
licencia leídos). Se guarda con tu identidad (I1) y lo ven todos; el avatar por defecto lo pone el mundo (H7);
una función puede poner un avatar solo para la sesión (su `setSessionAvatar`). **Hecho cuando:** e2e: la
pestaña A cambia de avatar, la B lo ve, y al volver A sigue con él.
Validar cada VRM subido con `packages/server/src/vrm.ts` (`revisarAvatar`: CC0 dentro del fichero, ≤ 10.000 triángulos; hecho en J1).

### H11 — Importar de Hyperfy (espera a M19)
Para traer los mundos Numinia de hoy. Un `.hyp` (4 bytes con el tamaño de la cabecera + JSON + ficheros; ver
`../mmo-browser-study/notes/16a-hyp-read-from-source.md`; el escritor es `src/core/extras/appTools.js`) → carpeta de
app (M19): modelo y ficheros por hash, propiedades, nombre; el script se guarda aparte, marcado «por portar» (su
API no es la nuestra). Un mundo entero (su `db.sqlite`: tablas `config`, `blueprints`, `entities`; y su carpeta
`assets/`) → carpeta del mundo (H1, H7). Solo contenido nuestro o con licencia: los 351 `.hyp` de `hyperfy-apps`
no tienen. **Hecho cuando:** test con un `.hyp` propio de prueba y un `db.sqlite` mínimo; informe de lo traído y
de lo que queda por portar.

### H12 — Calidad gráfica
Sombras (no, baja, media, alta) y posprocesado (bloom, antialias), como sus ajustes, decididos por nivel de
aparato: en móvil, apagados por defecto (móvil frío); en Quest, sin posprocesado (presupuesto del nivel B); en
escritorio, según el banco. Elegibles en los ajustes (N2). **Hecho cuando:** coste por cuadro de cada nivel
medido en el banco (P2) y apuntado en `limits.json`; e2e sin errores en los dos backends.

**En curso (15-10, rama `wt/entorno`).** Calidad por nivel de aparato (`calidad.ts`, por capacidad: A escritorio, B visor, C móvil, D móvil viejo): sombras no/baja/media/alta, agua, partículas y HDR, elegibles en el menú (N2); pedir más de lo que el aparato permite se recorta. **Falta:** cascadas, bloom y AO (H12b), compilar antes de dibujar (H12c).

### H13 — Nivel de detalle (espera a M21)
La ingesta (M21) genera 2–3 versiones de cada modelo (`simplify` de meshoptimizer); el cliente cambia de versión
según la distancia y el tamaño en pantalla (como su `LOD` con `scaleAware`), con margen para que no parpadee.
**Hecho cuando:** test de la elección por distancia; triángulos dibujados medidos con y sin LOD en una zona de
prueba.

### N1b — Cámara que choca (espera a M6)
La cámara de N1 se acerca cuando algo construido queda entre ella y tu avatar (rayo contra los colisionadores de M6), sin tirones. **Hecho cuando:** e2e: detrás de una pared colocada, la cámara queda delante de la pared.

### M22b — Constructor en VR y en el móvil
En VR, el rayo del mando selecciona y el gatillo arrastra el gizmo (o coge la cosa con la mano); en el móvil, un dedo sobre un asa la arrastra y dos dedos giran la cámara (N1). Mismas órdenes de `features/objetos`. **Hecho cuando:** e2e con IWER mueve un bloque con el mando; e2e táctil por CDP mueve otro con el dedo.

### M22c — Encajes, selección múltiple y jerarquía (en progreso, rama `constructor/encajes-seleccion-jerarquia`)
Puntos de encaje (su nodo `Snap`), seleccionar varias cosas y moverlas juntas, agrupar (jerarquía de nodos, su `NodeHierarchy`). **Hecho cuando:** e2e: dos bloques encajan cara con cara; tres seleccionados se mueven a la vez y deshacer los devuelve en un paso.

Hecho en esta pasada (`features/objetos`, `packages/render/src/{gizmo,encaje}.ts`, `apps/plaza/constructor.ts`; tests en `test/objetos.test.ts` y `test/encaje.test.ts`, todos en verde):
- **Encaje cara con cara**: arrastrando un objeto con un eje elegido (X/Y/Z), si su cara queda a menos de 25 cm de la de otro objeto (y se enfrentan en los otros dos ejes), encaja exacto. Geometría pura en `packages/render/src/encaje.ts` (3 tests unitarios), enganchada en `gizmo.ts` sobre `TransformControls`.
- **Selección múltiple**: Mayús+clic suma/quita del grupo (`features/objetos/client.ts`: `estado.seleccionados`, `seleccionarVarios`, `alternarSeleccion`); el último clicado es el primario (gizmo e inspector). Contorno azul claro sobre cada secundario (`gizmo.outlineVarios`).
- **Mover el grupo como una unidad**: arrastrar el gizmo del primario mueve a todos los seleccionados (traslación, en vivo); al soltar, todos llegan al servidor con un `lote` compartido (campo nuevo del intent `mover`) que el servidor junta en **un solo paso de deshacer/rehacer** (antes cada `mover` tenía su propio paso).
- **Borrar el grupo**: Supr/Retroceso con varios seleccionados los borra juntos, mismo mecanismo de `lote`; un deshacer los devuelve a todos.
- Versión del feature `objetos` subida a 6 (campo `lote`, opcional, en `mover`/`borrar`/`fijar`); compatible con páginas viejas (por defecto `""`, sin agrupar).

Queda para otra pasada (no roto, solo no empezado):
- **Caja de arrastre** (rubber-band: soltar el ratón sobre el vacío y arrastrar para seleccionar varios por pantalla) — hoy solo Mayús+clic uno a uno.
- **Girar/escalar el grupo como unidad** — hoy el movimiento en grupo es solo traslación; girar o escalar con varios seleccionados solo toca al primario.
- **Panel de jerarquía**: el motor no tiene todavía padre-hijo entre objetos (cada cosa colocada es independiente); un panel de verdad necesita ese dato en el esquema antes de tener sentido — no se ha simulado con una lista plana para no prometer una jerarquía que no existe.
- El e2e con Playwright de «dos bloques encajan + tres seleccionados se deshacen en un paso» (el de BACKLOG) no se ha grabado todavía: lo cubierto hoy es con tests de Node (`node --test`), no con el navegador real.


### H9b — Limpiar subidas y cupo por identidad (espera a H3)
Borrar los ficheros subidos que ninguna cosa usa (tras un plazo), cupo de MB por identidad y por rol, y que quien administra vea quién subió qué (`subidas.jsonl`). **Hecho cuando:** test: un fichero sin uso se borra tras el plazo; una identidad sobre su cupo recibe 507.

### J2b — Aviso de formato distinto
Si `welcome.format` no es el `WIRE_FORMAT` de la página (servidor nuevo, página vieja o al revés), un aviso visible y hablado: «El mundo se ha actualizado: recarga la página». **Hecho cuando:** test del aviso con un servidor de formato 1.

### J1b — Etiquetas a la altura de cada cabeza
`view.setHeadTop` (J3) con la altura del hueso de la cabeza de cada VRM, para nombres, bocadillos y etiquetas de gestos (hoy todos a 2,1 m: flotan sobre Polybot). **Hecho cuando:** e2e: el nombre queda a menos de 0,3 m sobre la cabeza de cada uno de los tres avatares.

### J3b — Chat en multitudes
Tope de mensajes cercanos por oyente y por segundo, y los nombres más cercanos primero cuando hay más de 64. **Hecho cuando:** test con 200 hablando a la vez: cada oyente recibe como mucho el tope y siempre lo del más cercano.

### J3c — Escribir en VR
En una sesión inmersiva, un botón abre el teclado del sistema (o el dictado si existe) para el chat; si no hay teclado, frases rápidas. **Hecho cuando:** e2e con IWER manda una frase rápida; probado en Quest (X1).

### D2 — Peso del cliente al arrancar
**Hecho, la puerta (18-10).** `tools/tamano.mjs` (`npm run tamano`, y una fila en `npm run gates`) mide lo que baja la página antes de dibujar (html + css + entrada + `modulepreload`, gzip -9 cada uno; qué entra y qué no, en `docs/MEDIDAS.md`): **434,9 kB gz** en `5362797`. Tope de la puerta 480 kB (medida + 10 %) para que pase hoy y pare cualquier subida; la meta sigue siendo 300: cada recorte baja el tope. **Falta:** el recorte (los pasos de abajo). Histórico (15-10, contaba solo los .js de entonces): la página bajaba 342 kB gz: `index` 84,6 + `three.core` 66,8 + `three.tsl` 188,9 + `calidad` 1,4 + `avatares-politica` 0,7. La mayor parte es TSL de three que solo usan piezas perezosas (cielo, agua, partículas), y el empaquetador lo pone en el trozo común. Medido por la rama entorno: alias de `three`, `three/webgpu` y `three/tsl` a sus fuentes en `vite.config.mjs` = −24,5 kB; además, mapa grande y ficha perezosos (~7 kB) y el dibujo del menú de ajustes al abrirlo (~4 kB). La pantalla de carga decide qué baja primero. **Hecho cuando:** una puerta mide el arranque en cada `npm run gates` y falla por encima de 300 kB.

### N3 — Ajustes dentro de VR
Hoy el menú se oculta en XR. Un panel 3D legible (J6) con su gemelo HTML, con los mismos datos del registro. **Hecho cuando:** e2e con IWER cambia la sensibilidad desde el panel 3D.

### N4 — Cambiar teclas
El tipo `tecla` deja de ser solo para ver: elegir otra tecla, avisar de los choques con las reservadas (`docs/JUGADOR.md`) y guardarla. **Hecho cuando:** e2e: J pasa a K, K abre el libro y J ya no.

### J13 — Panel de muñeca en VR
Minimapa, lista de lo cercano y ficha en un panel 3D sobre la muñeca (mano izquierda), con su gemelo HTML. **Hecho cuando:** e2e con IWER: girar la muñeca enseña el panel y el objetivo de la misión aparece en él.

### J14 — Dibujo barato de personas
El robot de la casa son 19 llamadas por persona (tope del nivel D: 80). LOD o un modelo de una pieza; con avatares VRM, decidir. **Hecho cuando:** 20 personas a la vista en el nivel D caben en su tope.

### J15 — Marcas de misión sobre las personas
«!» si alguien tiene una misión para ti, «?» si espera algo tuyo; es por jugador (un evento, no estado compartido). **Hecho cuando:** e2e: A ve «!» sobre Alma y B, que ya la hizo, no.

### J16 — Escribir aventuras con un LLM
Receta para que un modelo escriba una aventura (`docs/EXTENDER.md`) y `node tools/aventura.ts` como comprobación; un ejemplo escrito por un LLM y revisado. **Hecho cuando:** la aventura del ejemplo pasa la comprobación y se completa en un e2e.

### H4b, H4c, H8b, H12b, H12c, M6b
Ver su línea en la cola y la nota de la rama entorno en el RUNLOG del 15-10.

## Interfaz, mods y zona de usuario (U) — de `../mmo-browser-study/INTERFAZ-Y-MODS.md` (15-10)

Diseño aprobado por Pablo el 15-10 (respuesta a su pregunta: camino B, passkey). Las notas 26–35 del estudio son la
fuente; los números de los addons con código están medidos solo en un PC (nota 29) y son estimados en móvil.
Orden de Pablo (15-10): primero publicar y probar lo que ya hay; las U se prueban antes en local.

### U12 — Huecos
Pedido de Pablo (16-10) para las plantillas de mundo (`../mmo-browser-study/PLANTILLAS-MUNDOS.md` §9, «huecos que
rellena el dueño»: la pieza común de la galería, el auditorio, la sala de rol y el salón de eventos): «pinchas el hueco,
eliges tu imagen y se encaja sola», «y que te pida abrir carpeta para cargar el documento».

**Hecho (16-10, rama `plantillas/huecos`).** `objetos` versión 5, aditiva: tres campos al final (`huecoAncho`,
`huecoAlto` en metros, `huecoLleno`) y tres verbos. `hueco` hace de una imagen un hueco con el tamaño de lo de dentro
de su marco (la imagen de ese momento queda como cartel en el almacén, `v:<id>`; 0 × 0 deja de serlo). `rellenar` pone
una imagen subida (H9): el servidor la mide por su cabecera (`api.medidas`, nuevo en el enchufe: png, jpg con su
orientación EXIF, webp; `packages/net/src/ficheros.ts` `medidasImagen`) y la encaja entera, centrada y sin deformarla
(`encajar`: escala = mín(alto, ancho·py/px), redondeada hacia abajo), también con el hueco fijado; más de 4.096 px por
lado o tan alargada que quedaría bajo la escala mínima: rechazo con motivo. `vaciar` devuelve el cartel con su nombre.
Deshacer y rehacer valen en un hueco fijado (su escala es el encaje, no un movimiento); duplicar copia el cartel. Página:
cerca de un hueco (3 m; hasta 3,5 m por encima o por debajo de los ojos) quien construye ve «E: poner tu obra en este
hueco» («cambiar la obra…» si ya tiene); E, el botón o un clic en el hueco abren el selector de ficheros en el mismo
gesto (el navegador no lo abre después de una espera). La imagen pasa por `soltar.ts` (`rellenar`): se reduce a 2.048 px
el lado largo y una JPEG se redibuja siempre (de pie según su EXIF y sin el EXIF: el GPS de una foto de móvil no llega a
un mundo público). Panel de construir, con una imagen seleccionada: «Hacer hueco» (el marco = lo que mide ahora),
«Poner obra…», «Vaciar hueco» (`apps/plaza/huecos.ts`). `interactuar.ts` admite ofertas de la página (`locales`: su uso
corre en la página) y clics en cosas dibujadas con su clave (`pinchar`). **Medido:** 8 pruebas (`test/huecos.test.ts`);
pierna `tools/e2e-piernas/huecos.mjs` en chromium y firefox (E abre el selector; una PNG de 3.000 × 1.000 sube como
2.048 × 683 y queda a escala 0,8 en un marco de 2,4 × 1,6; B la ve; un clic en el hueco abre el selector otra vez y una
JPEG en retrato queda a 1,6; vaciar devuelve el cartel). Límite `hole_image_px_max` en `limits.json`.
**Falta:** que el render reduzca las imágenes por nivel (Quest y móvil: unos 15 MB de textura por imagen de 2.048 px,
21 huecos llenos pasan de los 256 MB del nivel B); huecos de modelo (.glb en una peana) y de vídeo; el selector de
ficheros no existe dentro de una sesión VR (hay que salir); quién rellena = quien construye (un papel que solo rellene
huecos espera a H3); la luz por cuadro (escenas).

### U14 — Salón de eventos (la TRG26)
Pedido de Pablo (16-10): «rescata uno de los templates, el que más funcionalidades nos añada para poder luego hacer el
resto de los eventos», con la especificación de la Tarugo «TRG26 · El vuelo del Maestro» (un aprendiz, tres artesanos
que dan una pieza cada uno en cualquier orden, Leonardo que las recibe y vuela, un cofre con el «Sello del Artífice») y el
modelo de su nave. El aire, como https://www.trgcon.com/. La plantilla vive fuera del motor
(`../plantillas/eventos/`, `PROGRESO.md`); aquí, lo que pide al motor.

**Trozo 1 hecho (16-10, rama `plantillas/eventos`): el aire de cada mundo.** ficha@1 admite `tema` (aditivo): diez
colores «#rrggbb» de los paneles, la letra de los títulos de entre las que trae el motor (`geist`, `geist-mono`,
`bebas-neue`, todas SIL OFL; Bebas Neue entra en `apps/plaza/public/fuentes` con su licencia, 13.768 bytes, y el
navegador solo la baja si un tema la pide), una sombra desplazada, mayúsculas y botones rectos o en píldora. El servidor
lo lee valor a valor (`leerTema`: lo que no cabe se deja fuera y se dice; una clave desconocida se ignora) y lo da en
`GET /status`; la página lo vuelca en variables CSS que `tema.css` ya lee (`apps/plaza/tema-mundo.ts`; la tinta sobre el
botón principal, clara u oscura, la decide el motor). Sin tema, el aire de la casa sin un píxel de cambio. **Medido:** 4
pruebas (`test/tema.test.ts`).

**Trozo 2 hecho (16-10, rama `plantillas/eventos`): pasos en cualquier orden.** mision@1 admite (aditivo) `grupo` en
cualquier paso: los pasos seguidos con el mismo grupo se hacen en el orden que quiera el jugador y la misión pasa cuando
están todos (el mismo grupo en dos sitios separados es un error que dice cómo arreglarlo); el grupo es también el nombre
de su contador. Paso nuevo `recibe` (una persona te da una cosa: se completa como `habla_con` y la cosa queda «llevada»)
y `entrega` con `cosas` (de 1 a 8, todas a la vez). El progreso guarda `hechos` (los pasos hechos del grupo en curso; lo
guardado antes carga como «nada hecho»); la máquina completa como mucho un paso por misión y suceso, sin reloj ni azar.
`misiones` pasa a v3 (el evento `paso` lleva `grupo`). En la página, cada paso que falta del grupo sale como «ahora» en
el libro, en el mapa y en VR, y arriba «★ El vuelo del Maestro · Piezas reunidas 1/3 · Artemisia, a 7 m al sureste» (el
más cercano); al recibir algo, «Has recibido: Telas ligeras». **Medido:** 8 pruebas (`test/misiones-grupo.test.ts`: las 6
órdenes, sin dobles, recarga a mitad del grupo, la entrega con 2 de 3 no, las condiciones, los errores con su ruta, el
progreso viejo y la misión entera por el enchufe real); las de misiones de antes, sin tocar, en verde; el progreso a
mitad del grupo ocupa 127 bytes; el tick de las misiones con 1.000 jugadores, p99 0,3 ms (límite 5). En el navegador
(servidor y página propios, Playwright): 3 marcas en el mapa y tres «→» en el libro, que pasan a 2 tras Bianca.
**Trozo «mapa» hecho (17-10, rama `plantillas/eventos-mapa`, unida a `plantillas/eventos`): el mapa de un edificio
es su planta.** entorno@1 admite (aditivo) `mapa.corte` (m, 0–60; 0 o nada = como antes, comprobado píxel a píxel en la
plaza por defecto: diferencia máxima 1/255). Con corte, el mapa grande dibuja la zona sin lo que queda por encima (el
plano cercano de la cámara cenital baja a 80 − corte, igual en WebGL2 y WebGPU, sin sombras en esa foto) y encima las
paredes, columnas y puertas que corta el plano, sacadas de los triángulos (`packages/render/src/corte.ts`: desde arriba
una pared cortada queda de canto y no da píxeles); el vidrio en azul claro. El minimapa usa ese dibujo de fondo y deja de
pintar la huella entera de lo que es más alto que el corte (la Nave salía como un cuadrado amarillo). La foto se hace la
primera vez que hace falta y luego solo cuando cambia la zona (como mucho cada 5 s), nunca en XR. **Medido** (la Nave de
la TRG26, SwiftShader): el corte mira 142.194 triángulos y da 3.340 segmentos en 3–6 ms; la foto entera 3–10 s en
software, casi todo leer los píxeles de la GPU; dos fotos por visita; parado 20 s, ninguna nueva y 58 dibujos 3D frente a
60 sin corte. 6 pruebas (`test/mapa-corte.test.ts`) y las del esquema en `test/entorno.test.ts`. **Sin medir:** en un
móvil de verdad. Mientras alguien construye en un mundo cortado, cada página rehace la foto hasta cada 5 s.
**Trozo 3 hecho (17-10, rama `plantillas/eventos`): el libro con los estados de la especificación.** Cada paso sale en
uno de tres estados, igual de claros en el aire de la casa y en el de cada mundo (todo son variables de `tema.css`):
hecho (check verde, el «poco común» de la casa, y texto atenuado; sobre una superficie clara de tema, el verde oscuro de
éxito), ahora (un punto del color de énfasis del mundo sobre una franja suya, texto entero y dónde; en un grupo, todos
los que faltan del bloque) y bloqueado (candado `lock-key` y texto atenuado, aún a 4,5:1). El lector oye «Hecho»,
«Ahora» o «Bloqueado»; el panel de VR lleva ✓ → □ (sin fuente de emoji). El estado sale de `objetivos()` (`estadoPaso`
en `apps/plaza/misiones.ts`; `features/misiones` no cambia). El libro se abre solo al aceptar una misión, cuando se
cierra la conversación que la dio (escritorio y móvil, nunca en VR), sin llevarse el foco (WASD sigue andando) y
diciéndoselo al lector; lleva «Cerrar (J)». Al conseguir algo (`recibe` o `coge`), el aviso lleva el icono `package`
(los dos iconos, del subconjunto de la casa) y queda por encima del libro (en el móvil lo tapaba). El sonido: el `avance`
declaraba «exito» pero la página no tocaba nada (los sonidos de los avisos llegan con V6); ahora cada paso hecho suena
con tres notas cortas (Web Audio, sin fichero) al volumen general × «Efectos». **Medido:** 7 pruebas
(`test/misiones-libro.test.ts`: los estados en un bloque y fuera, dos misiones sin mezclarse, la misión hecha, abrirse
una sola vez y nunca en VR, los avisos con icono, el check en un tema claro y la misión de la TRG por el enchufe real
con las marcas de VR en cada momento); la pierna `misiones` del e2e, al día. En el navegador (servidor y página propios,
Playwright): 22 de 22 comprobaciones en el aire de la casa, en el de la TRG y en un móvil de 390 × 844; en VR (IWER) el
libro no se abre y el panel dice →→→□□. Arranque: +1,5 kB gz. **Sin medir:** las marcas en unas Quest de verdad.
**Trozo 4 hecho (17-10, rama `plantillas/eventos-marcas`, unida a `plantillas/eventos`): marcas sobre las personas y
su oficio.** pnj@1 admite (aditivo) `oficio` (1–40 bytes): segunda línea bajo el nombre, junto al nombre en la
conversación («Pietro, Aprendiz») y en la lista del mapa («Cosimo (Carpintero)»); `pnj` pasa a v3. El servidor decide
por jugador las marcas (`marcas(progreso, aventura)` en `maquina.ts`): «!» = te ofrece una misión que puedes coger o es
la persona de un paso que te falta en el grupo en curso (las cosas, con un `coge`/`usa` pendiente); «✓» = te dio una
misión o ya hiciste su paso y no le queda nada para ti. Van en el evento silencioso `marcas` (tres listas de ids, ≤ 256
bytes cada una) solo a las conexiones de su dueño, tras cada libro; `misiones` pasa a v4. La página las pinta en el
rótulo («!» ámbar, «✓» verde; una cosa de misión solo tiene rótulo mientras lleva «!») y en los dos mapas (tipos
`para-ti` y `hecho`). Decisión: quien te dio la misión lleva «✓» al aceptarla. **Medido** (960×600, 8 rótulos): +7
llamadas de dibujo, +8 texturas (un sprite por rótulo, como antes; lienzo de hasta 512×304 px, unos 0,6 MB cada uno);
lienzos repintados parado: 0; aceptar repinta 4, recibir una pieza 1. 5 pruebas (`test/misiones-marcas.test.ts`, con dos
invitados en el mismo servidor que no ven las marcas del otro). Tras unir con el trozo 3, la pierna e2e `misiones`
(libro con estados + marcas de dos invitados) en verde.
**Trozo 5 hecho (17-10, rama `plantillas/eventos`): un momento que solo ve quien lo provoca y un paso que espera.**
Fichero nuevo de aventura `secuencias/<id>.json` (`secuencia@1`, 1–30 s): pistas `mueve` (una persona sigue sus claves,
posiciones del mundo, por una curva monótona que no se pasa de ninguna: si aterriza en el suelo no lo atraviesa),
`muestra` (un .glb de más, sobre una persona —con su giro y su tamaño, aunque vuele— o en un sitio), `texto` (la nota de
la página, leída en voz alta) y `sonido` (los de la casa, notas Web Audio sin fichero). Se comprueba al cargar: una
persona o un modelo que el servidor no tiene es un error con lo que hay (y la misión que la nombra no carga). mision@1
admite (aditivo) en cualquier paso `secuencia` (se manda al hacerlo, solo a las conexiones de quien lo hizo, una vez:
volver a entrar no la repite) y `espera` (1–60 s desde que empezó su bloque). La máquina sigue pura: el servidor le pasa
`ahora` en cada suceso y el progreso guarda `desde` (solo las misiones con esperas; lo guardado antes no espera nunca);
quien lo intenta antes oye «Todavía no: faltan 7 s para «…».»; mientras, candado y cuenta atrás en el libro y arriba,
sin objetivo ni «!»; al cumplirse, el libro y las marcas otra vez, una vez (las conexiones con una espera se miran 5 veces
por segundo). `misiones` pasa a v5 (`paso.espera` y los eventos silenciosos `secuencia`, `pista`, `clave`). En la página
(`features/misiones/secuencia.ts`, su propio trozo: se baja con la primera secuencia) una a la vez (las siguientes
esperan, hasta 3), nada por cuadro mientras no suena ninguna, sin tocar la cámara (VR); al acabar cada persona vuelve a
donde dice el servidor. `__numinia.misiones.secuencia()`. **Medido:** 8 pruebas (`test/misiones-secuencia.test.ts`:
formatos con sus rutas, la máquina con tiempos inyectados —antes no, después sí, el bloque, `desde` guardado y leído,
progreso viejo—, el reproductor puro y el enchufe real con dos invitados, reconexión y reinicio a mitad de la espera);
tick de las misiones con 1.000 jugadores esperando: p99 0,14 ms (límite 5), y al abrirse un libro cada uno y nada más; el
vuelo, 15 eventos y 554 bytes solo para su dueño; arranque +1,8 kB gz (el reproductor, 1,9 kB gz aparte). En el
navegador (servidor y página propios, dos invitados): A ve las alas, el vuelo y el aterrizaje; B, a la vez, a Leonardo
quieto en su sitio; un evento `secuencia` cada uno; el cofre «Todavía no: faltan 10 s» y su «!» a los 10,0–10,2 s.
**Trozo 6 hecho (17-10, rama `plantillas/eventos-cofre`, unida a `plantillas/eventos`): una cosa que se ve usada para
ti y un premio apuntado una sola vez.** cosa@1 admite (aditivo) `apariencia.usada` { modelo, escala? }: la cosa se ve así
para quien ya hizo su paso `usa`/`coge` (lo decide cada página con su propio libro: el cofre de la TRG26 sale abierto solo
para quien lo abrió; los demás lo ven cerrado y abren el suyo). Al completar una misión con `recompensas`, el servidor
apunta una concesión por invitado con identidad en el almacén de misiones (`c:<misión>:<id>` = jugador, nombre, misión,
recompensas, instante en UTC, estado «concedida»; nunca se sobrescribe; una repetible cuenta la primera vez; sin
identidad, nada), y `npm run concesiones -- <carpeta del mundo> [misión]` la saca en CSV para la organización, solo
lectura y con el servidor en marcha (`packages/server/src/datos.ts` lee la foto y el diario como el servidor). En la
página, el cartel «Misión completada» (unos 4 s, aria-live, sin quitar el teclado) con un acorde. misiones v5 (el mismo
salto que el trozo 5). **Medido:** 9 pruebas (`test/misiones-cofre.test.ts`: la concesión una sola vez tras repetir,
dos pestañas, dos invitados a la vez, reconexión y reinicio; sin identidad, nada; el CSV; el aspecto por jugador por el
enchufe real); en el navegador, el cofre abierto para A y cerrado para B a la vez. Unido con el trozo 5 (chocaron los
sonidos de la página, el comentario de la versión y dos líneas de documentación): 72 de 72 en las pruebas de misiones,
mapa, entorno, altura y tema; la pierna e2e `misiones` en verde.
**Falta:** poner el vuelo y el cofre en la aventura de la plantilla (`../plantillas/eventos/notas-vuelo.md`,
`notas-cofre.md`); que V6 dé su sonido a cada aviso (y quite las notas del libro y de las secuencias).

### U1 — Pantalla de carga
Armazón dentro de `index.html` (≤ 14 kB comprimido, letra del sistema, sin lienzo ni `requestAnimationFrame`) y un
controlador de ~2 kB con un estado `__numinia.carga = {fase, hecho, total, estado}`. Fases: código, gráfica, red,
mundo (bytes del manifiesto M16 cuando exista), preparar (`compileAsync(…, onProgress)`), listo. Aparece si la espera
pasa de 400 ms y se queda ≥ 600 ms; barra por fases, nunca indeterminada; atasco a los 8 s sin bytes → «Sigue
trabajando» con Reintentar/Cancelar y un aviso urgente; ≤ 6 avisos hablados; `inert` + `aria-busy` mientras carga;
foco al mundo al terminar. Reconexión con espera creciente cuando el socket se cierra (hoy no se maneja). El arte de
`work/pantalla-carga/` como imagen ≤ 45 kB tras el primer pintado (sin el fractal por cuadro, sin la fuente en línea,
sin cursor que parpadea). **Hecho cuando:** e2e con red lenta simulada ve las fases en orden y el estado en
`__numinia.carga`; con caché caliente no aparece; cortar el servidor → «Reintentar» → vuelve.

### U2 — Teclas y menú del juego
Un enrutador con capas (cambiar tecla › escribir › paneles › modo › menú › jugar): Esc, «atrás», B y el gesto de
volver cierran la de arriba; sin capas abren el menú. Las 13 escuchas de teclado y los 4 dueños de Esc de hoy pasan
a capas. El menú se abre también al soltarse el puntero o salir de pantalla completa (el primer Esc es del
navegador); «Continuar» es un clic, nunca se recaptura solo. Diálogos nativos (`showModal`). Entradas fijas que
ningún addon quita: Continuar, Ajustes, Controles y ayuda, Zona de usuario, Gente, Salir; después, entradas
declaradas por datos. **Hecho cuando:** e2e: Esc abre y cierra; con el chat escribiendo, Esc no abre el menú; en
móvil el ⚙ abre lo mismo; prueba de 10 min por aparato (nota 33 §E) apuntada en X1.

### U3 — Marcos (para Opus: es el contrato de U5–U9)
`marco@1`: id estable (`hud.chat`, `addon:<id>/<marco>`), ancla (9 puntos o otro marco), desplazamiento en unidad
relativa a la altura, escala, opacidad, visibilidad con la gramática `requiere` de N2, y un árbol de piezas fijas
(caja, fila, columna, texto, imagen, botón, deslizador, interruptor, lista) con nombre hablado y verbo. Pintor de
página (HTML real = gemelo de texto). El HUD de hoy (chat, minimapa, misiones, botones) pasa a marcos y desaparecen
los px escritos a mano en cinco sitios. Añade la clave `marcos` a `defineFeature` (la `panels` de J7 nunca se hizo).

### U4 — Zona de usuario
Secciones de la ficha J12: quién eres, avatar (licencia VRM leída y enseñada), misiones e insignias, lo que he
construido (índice por invitado, cuota, borrar, descargar), interfaz, ajustes, privacidad y datos (qué se guarda,
lo último enviado, descargar y borrar), seguridad (bloqueos, informes), ayuda y legal. El informe T1 se pide una vez
al entrar y queda apagado hasta que digan sí (guía 2/2023 del EDPB). Edades: no se tocan en el motor (Pablo, 15-10:
la plataforma, las comunidades y la clasificación de cada aventura lo deciden).

### I3 — Passkey
WebAuthn con SimpleWebAuthn (MIT, versión exacta); la llave se une al id del invitado; sin correo; un toque en
«Guardar mi progreso». Recuperar en otro aparato = la llave sincronizada (iCloud, Google). Más adelante (O4) se une
con la cuenta de numinia.com. **Hecho cuando:** test: registrar, borrar el billete, entrar con la llave → mismo
invitado, mismas insignias.

### U5–U9
Ver `INTERFAZ-Y-MODS.md` §6–§9 y la tabla de límites §10 (todos `estimated` en `limits.json` hasta medirlos).
