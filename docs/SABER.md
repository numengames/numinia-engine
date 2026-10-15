# Lo que sabemos — el proyecto, destilado para quien trabaja en el motor

Todo lo aprendido entre el 11 y el 15 de octubre de 2026 (estudios, medidas, decisiones de Pablo, lo
que nos enseñó el agente de IA en Hyperfy), en una página por tema. **Léelo antes de diseñar una
fila**: casi todo lo que vas a preguntarte ya se contestó, con número o con fuente.

- Las fuentes completas (25 notas, cada afirmación con su URL, copias en `raw/`) viven en
  `../mmo-browser-study/`. Aquí va lo que manda; allí, el porqué largo.
- Lo que se convirtió en trabajo está en `docs/BACKLOG.md` (la tabla de §8 dice qué fila sale de qué).
- Si algo de aquí choca con `AGENTS.md`, manda `AGENTS.md`. Si choca con una medida nueva, gana la
  medida: corrige este documento en el mismo commit.

---

## 1. Decisiones tomadas

| Decisión | Por qué, en una línea | Fuente |
|---|---|---|
| Motor propio, fino, MIT, TypeScript de punta a punta, sobre three.js r186 (`WebGPURenderer`) | Nada libre en oct-2026 junta WebGPU + XR + 1.000 en una instancia + TypeScript; three elige solo WebGPU o WebGL2 y hace XR con los dos | `EVALUACION-MOTORES-2026.md` §8, `EL-MOTOR.md` §0 |
| Frontera primero, escalera hacia abajo; suelo = cualquier navegador con WebGL2 | Pablo, 11-10: el techo primero, el móvil viejo es la última prueba, nunca el origen del diseño | `PLAN-MOTOR-WEB-3D.md`, `EL-MOTOR.md` §3 |
| VR es requisito duro; **la AR va primero** | Pablo, 11-10 y 15-10 («la AR me interesa muchísimo») | `REALIDAD-CRUZADA.md` |
| 1.000 personas en una instancia como diseño, 5.000 como horizonte (con dilatación de tiempo) | Pablo: «eso parece bien» (11-10) | `LIMITES.md` §1 |
| El servidor manda; el cliente solo predice su propio avatar | Auditable, sin trampas de posición (el error de Hyperfy, §4) | `PREGUNTAS.md` #5 |
| Simulación determinista: tick fijo de 20 Hz, punto fijo Q16.16, azar con semilla, huella por tick | Es lo que deja grabar, reproducir y que una IA mantenga el motor: cada fallo se vuelve un test | `EL-MOTOR.md` §2.3, `docs/DETERMINISM.md` |
| Zonas unidas por portales, copias cuando se llenan, regiones en hilos dentro de una instancia; nunca «sin costuras» entre servidores | Coste y complejidad; lo que hacen los que aguantan | `PREGUNTAS.md` #7 |
| Red: solo lo cercano (área de interés con tope por persona), binario; WebSocket hoy, WebTransport como escalón de arriba detrás de la misma interfaz | Ancho de banda O(N) en vez de O(N²) | `PREGUNTAS.md` #8 |
| La lógica vive en el servidor; los scripts de mundo, en un sandbox del servidor (SES por defecto) | El cliente dibuja y manda teclas | `PREGUNTAS.md` #9, nota 16 |
| El mundo son datos: glTF + manifiesto JSON con esquema; los formatos solo crecen (aditivos) | Contenido que sobrevive al motor | `PREGUNTAS.md` #10 |
| Unidad de contenido: **carpeta de texto** (`app.json` con esquema y versión + `main.ts` tipado + activos por sha256) como verdad; **paquete glTF con extensión `NUM_app`** como entrega. `.hyp` es entrega, no verdad | Diff y PR para personas y agentes; migraciones; salida de emergencia a glTF | `EVALUACION-MOTORES-2026.md` §3.4, notas 16 y 16a |
| Física: Rapier determinista en WASM (provisional, se mide) | Determinismo entre navegador y servidor | `PREGUNTAS.md` #13 |
| Avatares VRM 1.0, ≤ 10.000 triángulos; completo cerca → maniquí → horneado lejos | Presupuesto de la Quest | `PREGUNTAS.md` #14, `LIMITES.md` §3 |
| Voz con LiveKit, por cercanía, con tope de voces audibles y modo escenario | La voz es el coste que manda a escala (§2) | `PREGUNTAS.md` #15 |
| Red y descompresión en workers; COOP/COEP solo bajo `/w/*` | El hilo principal es del dibujo | `PREGUNTAS.md` #16 |
| Identidad: invitado primero; passkey y wallet para volver a ser tú | Decentraland perdió el 72 % de los nuevos en el paso de registrarse | `PREGUNTAS.md` #17, nota 03 |
| Grupos: la pieza ahora (un id compartido que el servidor conoce: prioridad en el área de interés, portal juntos, canal propio), la pantalla después | Barato hoy, caro mañana | `PREGUNTAS.md` #19 |
| Los agentes de IA entran como jugadores por el mismo protocolo, LLM solo por evento, nunca moderan, siempre se identifican; los constructores cambian el mundo por PR (MCP) | Nativo para IA sin darles poder | `PREGUNTAS.md` #21, `EL-MOTOR.md` §2.8 |
| Juego en el servidor y transaccional; escape rooms como máquinas de estado; sin azar de pago | Auditable y legal | `PREGUNTAS.md` #22 |
| URLs: ciudad en `numinia.com/w/<zona>`, activos en `assets.numinia.com`, instancias en `ix-<n>.numinia.com`; los Hyperfy de hoy no se tocan | Almacenamiento por origen, caché por sitio | `LIMITES.md` §4 |
| La regla de las reglas: cada función declara API, nivel (Base/Mejorado/Frontera), escalón de bajada, **alternativa accesible** y prueba; se detecta por capacidad, nunca por nombre de navegador | Saber qué funciona dónde, verificado | `FUNCIONALIDADES.md` §0, `ACCESIBILIDAD-3D.md` §4 |
| Licencias: motor MIT, ciudad AGPL-3.0 con CLA, mundo y avatares CC0 | Pendiente la firma de Pablo (#29) | `DISENO-MOTOR-NUMINIA.md` §10 |
| Hyperfy sigue con los eventos de hoy; el motor nuevo solapa, no salta | Sin riesgo para lo que ya funciona | `PREGUNTAS.md` #31 |
| Movimientos (gestos, bailes, sentarse): todo CC0; un original → dos salidas (`.vrma` para este motor, `.glb` para Hyperfy); nunca se edita una salida a mano | Pablo, 14-10; Mixamo prohibido | `../movimientos/PLAN.md`, `COBERTURA.md` |
| Calidad de cuadro: nunca perder cuadros a la tasa nativa del visor (72 Hz garantizados en Quest 3 / Pico 4 → 13,9 ms, diseñar para ≤ 10 ms; 90 Hz objetivo); escritorio a la tasa del monitor; móvil 60 objetivo, 30 suelo declarado | Se mide p99 del cuadro y cuadros perdidos, no «fps medios» | `EL-MOTOR.md` §2.2 |
| Los tres principios de Pablo (14-10): nativo para IA, móviles fríos, límites publicados | Mandan sobre cualquier tarea | `AGENTS.md` |
| Servidor de pruebas: empezar por la máquina más pequeña (OVH VPS-1, Gravelines, Ubuntu 24.04) y subir | Pablo, 15-10 | `SERVIDOR-X3-paso-a-paso.md` |

## 2. Lo medido (número, dónde y cuándo)

| Qué | Número | Notas |
|---|---|---|
| Determinismo entre motores de JS | huella `fa94375e` igual en Node, Chromium (V8) y Firefox (SpiderMonkey) | WebKit/Safari **sin probar**: Playwright WebKit no arranca en Bazzite (X2) |
| 1.000 personas por WebSocket real, un núcleo | tick p99 17–23 ms, 25,5 kbit/s por persona, 20 Hz exactos | PC de desarrollo (Ryzen 9 7950X); en un VPS se espera 1,5–2,5× peor (estimado, X3 lo mide) |
| Un hilo, todos a menos de 80 m | 1.000 → p99 10 ms · 2.000 → 21 · 3.000 → 36 · 4.000 → 53 | Se rompe entre 3.000 y 4.000: regiones en hilos solo para el horizonte de 5.000 |
| Área de interés ingenua (ordenar ~999 candidatos por cliente) | p99 146 ms con 1.000 | Por eso: rejilla de 8 m, anillos, quickselect |
| Los dos tipos de tick | impar sin snapshot: p50 ~0,09 ms; par con snapshots: el p99 | Juzga siempre por p99 y por la respuesta del tick (retraso + duración), nunca por p50 |
| `--max-semi-space-size=64` | sin ganancia (12 + 9 pasadas) | No copiar banderas de Node sin medirlas |
| Latencia desde casa de Pablo | Gravelines 25 · Estrasburgo 27 · Roubaix 27 · Hetzner Núremberg 43 · Falkenstein 50 · Helsinki 65 · Vultr Madrid 5 ms | |
| Cliente Hyperfy de hoy | 1,25 MB de JS + 1,49 MB de PhysX comprimidos | Nuestro cliente (PP1): 210 kB comprimido |
| Escaneo de QR → efecto en la plaza (R1) | 4 ms en local | Sin medir con móvil real |
| Conversión de animaciones (UAL1 de Quaternius, CC0) | caderas 0,916 → 0,533 → 0,917 m al sentarse y levantarse, 0 errores | Defectos conocidos en §3.4 |

**Hechos de plataforma (oct-2026), comprobados en fuente:**
- WebGPU dentro de XR solo es producción en Vision Pro; en Quest es experimental (v146–v152, tras banderas) → en Quest, backend WebGL2.
- iPhone no tiene WebXR: allí todo se juega en plano o con la cámara dibujada detrás. Firefox y Safari de escritorio, tampoco.
- La Quest 3 da sus cámaras a las páginas por `getUserMedia`; cámara, GPS y WebXR exigen HTTPS.
- El GPS del móvil falla ~4,9 m: solo sirve para zonas de ≥ 30 m, nunca para colocar cosas.
- `KHR_interactivity` está ratificado (15-07-2026) pero three.js no lo lee; la física de Khronos sigue sin ratificar.
- Ningún estándar web deja que un lector de pantalla «vea» una escena 3D, y el lector del sistema no entra en una sesión inmersiva (Meta lo dice): **el motor tiene que ser su propio lector**.
- Los ejemplos de AR de three r186 son solo para `WebGLRenderer`; con `WebGPURenderer` hay que leer `src/renderers/common/XRManager.js`.
- En España, los operadores bloquean rangos de Cloudflare durante los partidos de LaLiga: una ciudad cuyos activos solo están en Cloudflare se queda sin activos.

## 3. Reglas aprendidas

### 3.1 Red y servidor
- **Nunca mandar todo a todos.** Hyperfy escribe cada paquete en cada socket (`ServerNetwork.send()`): eso es O(N²) y es su techo. Aquí, siempre área de interés.
- **Nunca fiarse de la posición que manda el cliente.** Hyperfy reenvía la transformación del jugador sin validarla; aquí el servidor aplica entradas.
- Pruebas de carga en lazo abierto (cadencia fija, como wrk2): si no, la medida sufre «omisión coordinada» y miente a la baja.
- Un número de servidor solo vale con **steal < 2 %**; la columna `st` de `vmstat` se lee por nombre (las versiones nuevas añaden `gu` detrás); pausar `apt-daily*` mientras se mide.
- Con un servidor de un hilo se compara **precio por núcleo dedicado**, no número de vCPU.
- **La voz por cercanía es lo caro a escala**: ~230 suscripciones de audio por núcleo → ~13 núcleos para 1.000 oyentes con 3 voces audibles. Tope de voces, DTX, modo escenario.
- Un LLM cuesta por **cadencia**, no por modelo: por evento ≈ 0,0024 $ por agente y hora; sondeando cada 2 s, 0,29 $.

### 3.2 Cliente, móvil y XR
- **El cliente es más riesgo que el servidor**: el mejor cliente WoW en three.js cae a 25 fps con 200 personajes animados en una RTX 5070 Ti. Medir la multitud (A1) antes de prometer una plaza llena.
- Presupuesto del nivel B (Quest 3 / Pico 4): ≤ 100–150 draw calls por ojo, 300–500 k triángulos por ojo, ≤ 256 MB de texturas KTX2, 1 sol + ≤ 2 luces sin sombra, 12–25 VRM completos, zona ≤ 40 MB comprimida, jugable en ≤ 12 MB.
- Nada importante pegado a la cabeza (impide acercarse a leer y rompe la lupa) — Apple.
- AR y cámara a ráfagas de ≤ 90 s; los fotogramas de la cámara no salen del aparato.
- En pruebas sin pantalla (GL por software, ~6 fps) se espera por estado medido, nunca por reloj: un cuadro lento pierde tiempo por el tope de `dt` y no es un fallo de red.

### 3.3 Contenido, formatos y licencias
- **Entrega como los ports de juegos nativos**, lo único que se copia de ellos: manifiesto por zona con clases arranque / fondo / perezoso, sha256 por fichero, trozos con Brotli desde una CDN (nunca desde el VPS del juego), caché del navegador por hash (OPFS). Y **un origen de reserva fuera de Cloudflare** (LaLiga).
- **La ingesta hace cumplir los límites, no los recomienda.** Acepta los sufijos de Hyperfy (`_collider`, `_xcollider`, `_tcollider`, `_xtcollider`) y los convierte en datos de física explícitos; **los colisionadores no se cuantizan** (gltfpack cuantiza por defecto y rompe la colisión: el `gltfpack -cz -ke -kn -mi` de `EL-MOTOR.md` tiene ese fallo latente).
- Licencia por fichero; los campos de licencia de cada VRM se validan.
- El estado de un estándar se lee en su registro (Khronos `extensions/README.md`, el PR en la API), no en un blog; antes de decir que three soporta algo, se busca en su código.
- **Registro de licencias trampa:** Redis ≥ 8 (usar Valkey), SpacetimeDB (BUSL-1.1), núcleo de Hyperscape (GPL-3.0-only aunque diga MIT), Piper TTS mantenido (GPL-3.0), Mixamo (ni redistribuir ni usar con IA), bases de VRoid (no CC0), bitECS (MPL-2.0 y parado), los 351 `.hyp` de `hyperfy-apps` (sin licencia), project-forge (BUSL), fnayr y hyperforge (sin LICENSE), Hunyuan3D (dicen que excluye la UE: comprobar). «Gratis» en Pexels o Pixabay no es CC0; y CC0 no limpia una coreografía reconocible (Hanagami c. Epic, 2023): solo pasos genéricos.
- **Muertos o parados (no proponer):** Hathora (cerró 05-05-2026), Lance.gg, la plataforma de 8th Wall (su código MIT queda), Hytopia (MIT y congelado; su transporte doble WebTransport/WebSocket es lo más aprovechable), `rapier.js` (archivado, vive en el monorepo de Rust), Hyperfy (sin commits desde el 21-04-2026).

### 3.4 Animaciones (lo que enseñó convertir movimientos)
- Convertir por **rotación de mundo respecto a la pose T del propio paquete**, en un marco canónico, sobre un esqueleto de reposo identidad: así la corrección de reposo del motor no hace nada.
- La altura de las caderas se normaliza a la del avatar; unas piernas de otra proporción hunden los pies al sentarse (~5 cm): ajustar al avatar de la casa.
- **Al cambiar de animación, mantener la vieja hasta que la nueva haya cargado y entonces fundir**; si no, se ve un cuadro de la pose de reposo (en Hyperfy, las caderas saltan ~9 cm).
- Los cinco primeros gestos que necesita un agente: saludar, asentir, negar, pensar (mientras el LLM contesta) y señalar.

### 3.5 Agentes de IA dentro del mundo (lo que enseñó Procyon en Hyperfy)
- **La política va en el código, el LLM solo redacta**: responder solo si lo llaman (por su nombre o `/p`), las órdenes cortas (≤ 6 palabras) se deciden sin LLM, el admin tiene prioridad, los roles salen del mundo y nunca de lo que alguien escribe. No usar «para» como palabra de parada (es una preposición).
- **El texto no fiable nunca entra en las instrucciones**: enlaces, la ficha del sitio, nombres de personas y objetos van en **un** bloque `<material>` vallado antes del último mensaje, rehecho en cada turno y nunca guardado; dentro no se obedece nada (numinia.org STD-050, reglas AGW-001…014).
- El cerebro contesta en JSON con lo que el mundo anuncia (`{decir, gesto}` de una lista), y el código lo valida; los primeros fallos en producción de otros fueron bucles agente↔agente y respuestas largas.
- Un agente público nunca ejecuta código y nunca tiene las llaves de administración.
- Cada sitio tiene su ficha `.md` para LLM (solo lo que no se puede medir, nada privado), que se lee como material.
- El agente dice que es una IA. Presencia por teletransporte delante de quien le habla (1,6 m), «sígueme» detrás.
- Las escape rooms son máquinas de estado deterministas; el LLM solo redacta pistas escritas por una persona.

### 3.6 Accesibilidad (estudio del 15-10, tras la charla de la Commit Conf)
- **Cada cosa del mundo lleva una ficha**: nombre, función, estado, descripción corta, importancia, sonido y acciones (como `AccessibilityComponent` de Apple o ARIA en la web). Sin eso no funciona nada más. En Second Life, el 40–50 % de los objetos no tenían nombre y nunca fue accesible.
- **La misma ficha la leen los agentes de IA**: hacer el motor accesible y hacerlo nativo para IA es el mismo trabajo.
- **El motor es su propio lector**: en gafas habla él con voz espacial; en ordenador y móvil copia lo cercano a una lista HTML invisible que leen NVDA, VoiceOver o TalkBack (el «gemelo HTML» de Babylon). La selección es la misma que la del área de interés.
- **La persona pide, no se le echa encima**: escáner direccional, «¿dónde estoy / qué hay cerca / dónde está X?», sonar, «mírame al objetivo», balizas sonoras.
- **Cada canal tiene su doble**: ningún aviso sin sonido, ningún sonido importante sin texto, ninguna acción que solo se haga con un gesto.
- Las ayudas (protección contra caídas, andar solo hasta un punto) son **reglas por jugador que el servidor conoce**, no trucos del cliente.
- Con IA, tres niveles y en este orden: lo que el motor sabe (datos, sin modelo) → un LLM que razona sobre esos datos → un modelo que mira la imagen, marcado como IA. Sus errores son «difíciles de detectar sin vista».
- Un mundo con objetos interactivos sin nombre **no se publica**; otra puerta pasa un detector de destellos (≤ 3 por segundo).
- Ley: tienda, cuenta, ajustes y chat en **HTML de verdad**, auditable (RD 193/2023: nivel AA para servicios nuevos desde el 01-01-2029); el lienzo 3D no está claro en la ley.
- Se diseña **con** las personas afectadas: punto de parada con las dos ponentes de la Commit Conf.

### 3.7 Realidad cruzada (calle en AR ↔ mundo en VR)
- Los «puntos de enlace» los decide el servidor; la posición se manda solo al reclamar y no se guarda.
- Las mecánicas de la ciudad usan las Semillas del Conocimiento y las Células del Prisma del manual del juego; el canon no se toca.
- Cada mecánica tiene versión plana para iPhone y ordenador. Zonas en la calle: nunca en la calzada, bloqueo a velocidad de coche, QR a altura de silla de ruedas.

### 3.8 Operación
- Precios de servidores: del catálogo vivo, nunca del titular ni de una nota vieja (el «desde X €» de OVH es el precio a 12 meses; Hetzner subió dos veces en 2026).
- `/metrics` se queda en 127.0.0.1; a la calle solo salen `/ws`, `/health` y las rutas públicas de las funciones (hoy `/e/`).

## 4. Lo que nos enseñó Hyperfy (y no repetimos)

| Hyperfy hace | Nosotros |
|---|---|
| Manda cada paquete a todos | Área de interés con tope |
| Se fía de la posición del cliente | Entradas validadas por el servidor |
| `.hyp` binario como única verdad, API de scripts inestable | Carpeta de texto con esquema y versión; paquete de entrega aparte |
| Scripts y propiedades llegan a todos los clientes (no caben secretos) | Secretos solo en el servidor (`MOTOR_SECRET`, `api.sign`) |
| Guarda el mundo en SQLite cada 60 s | S4 decide; reiniciar sin perder nada es la prueba |
| Animaciones: solo 8 internas; pierde la traslación de caderas con nombres VRM | `.vrma` con traslación; colección «Movimientos» |
| Proyecto parado desde abril de 2026 | Motor que mantiene una IA, con puertas numéricas |

## 5. Lo que está abierto (lo decide Pablo)

| Pregunta | Qué fila espera | Fuente |
|---|---|---|
| ¿Cuántas voces a la vez es aceptable oír (2, 3, 5)? | M17 (voz) | `PREGUNTAS.md` #15 |
| ¿Los ciudadanos tendrán parcela propia? | — (después de PP6) | #20 |
| En un evento de cliente, ¿modera el cliente o la casa? | F1 | #18 |
| ¿Cuál es el aparato más bajo que probamos (nivel D)? | X5 | #2 |
| ¿Cuándo se abre cada etapa de autonomía de la IA? | M26 | #28 |
| Firma de la AGPL y el CLA (STD-010) | antes de publicar nada | #29 |
| Aprobar el ADR y el SYS del motor en la Summa | O5 | #30 |
| Lo legal: consentimiento a los 16, datos | O4 | #32 |
| Nombre del motor (con Christian) | X4 | #33 |
| ¿Qué mundo lo estrena? (propuesta: la plaza de entrada con un portal a un Hyperfy) | W1 | #34 |
| Acceso por correo o cuentas sociales | deuda | #17 |
| Las notas del organizador de un agente: ¿instrucciones o material? | P5 | STD-050 |

## 6. Huecos honestos (no sabemos y hay que medir)

- Cuánto aguanta un VPS de verdad (X3) y si un núcleo de VPS rinde 1,5× o 2,5× peor que el PC.
- Cuántos avatares animados aguanta una Quest 3 a 72 Hz (A1 + X1), y cuánto cuestan la lupa y el contraste allí (V11).
- Si `speechSynthesis`, el reconocimiento de voz y «menos movimiento» funcionan dentro de una sesión inmersiva en Quest, Pico e iPhone (V2).
- Safari de verdad (X2): la huella en JavaScriptCore.
- Temperatura y batería en un Android real (X5).
- WebTransport: no hay servidor de producción en JavaScript (M9 lo investiga).

## 7. Cómo seguir aprendiendo

- Una medida nueva que cambie un número de §2 → se corrige aquí y en `limits.json` en el mismo commit.
- Una decisión nueva de Pablo → fila en §1 con fecha.
- Una regla aprendida al fallar → §3, en una línea, con el porqué.

## 8. De dónde sale cada fila de la cola

| Documento del estudio | Filas |
|---|---|
| `CONSTRUIR.md` (piezas M, O, W) | S1–S5, P1–P4, A1–A4, D1–D4, M6, M9, M10, M16–M23, M25, M26, O2–O5, W1 |
| `FUNCIONALIDADES.md` → `docs/JUGADOR.md` | J0–J9, N1, N2, F1, F2 |
| `REALIDAD-CRUZADA.md` | J8, R1–R4, I1, S4 |
| `ACCESIBILIDAD-3D.md` | V1–V14 |
| `PLAN-DE-MEDIDAS-X3.md`, `SERVIDOR-X3-paso-a-paso.md` | S5, X3, `docs/MEDIDAS.md` |
| `LIMITES.md` | P1 (`limits.json`, `docs/FICHA-TECNICA.md`) |
| Agente en Hyperfy (`../procyon-hyp/`) y STD-050 | P4, P5 |
| `../movimientos/` | J1, W2 dentro de J1 |
