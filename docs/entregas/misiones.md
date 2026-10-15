# Entrega de la rama `misiones` (J5 misiones + núcleo de J4)

Proyecto: numinia-engine · Para: quien junta las ramas (y Pablo) · De: agente `misiones` (Opus) · Fecha: 2026-10-15 14:47 UTC ·
Estado: hecho el trozo pedido; lo que falta, abajo.

## Qué

Pablo: «el libro de misiones, el diseño de los PNJ que dan misiones… que el motor pueda crecer, muy versátil». Hecho
como **datos con esquema** (una aventura trae su carpeta de misiones, personas y cosas en texto que un LLM puede escribir)
y **lógica en código**, determinista y decidida por el servidor.

- **Formatos** (`features/misiones/formato.ts`, comprobados con `Result` y rutas que dicen cómo arreglar cada problema):
  `mision@1` (pasos `llega_a {x,z,radio,lugar}`, `habla_con {pnj}`, `usa {cosa}`, `coge {cosa}`, `entrega {cosa,pnj}`;
  requisitos; recompensas = insignias; textos), `pnj@1` (nombre, apariencia = sha256 de un .glb o el robot; `vrm`
  reservado; posición, giro, radio; diálogo = árbol determinista: `entradas` con condiciones, nodos con hasta 4
  respuestas con `si`, `ir` y acciones `dar_mision` / `avanzar_paso` / `entregar` / `despedir`) y `cosa@1` (lo que se
  coge o se usa, con su aviso «coger la caja»). Las referencias entre ficheros se comprueban: lo roto no se carga y el
  registro dice por qué. `node tools/aventura.ts <carpeta>` lo comprueba sin arrancar nada.
- **Aventura**: `AVENTURA_DIR` (por defecto `aventuras/ejemplo`, **contenido de EJEMPLO**: Alma la guía, Bruno el farolero,
  la caja; la misión «Primeros pasos en la plaza»: pilar dorado del este → hablar con Bruno → coger su caja).
  El servidor la lee con `packages/server/src/aventura.ts` y las funciones con `api.aventura(carpeta)`.
- **Servidor** (`features/misiones/server.ts`, dos funciones y un motor: `pnj` y `misiones`): personas y cosas en el
  estado con `at` y ficha (J9: solo a quien está cerca); progreso por invitado (I1) en el almacén (S4, `p:<id>`), que
  sobrevive a reinicios y **llega solo a su dueño**; pasos comprobados por el servidor (distancia con `api.within`,
  posiciones cada 0,2 s solo de quien espera llegar a un sitio, paso actual); intentos `hablar`, `elegir`, `adios`,
  `aceptar`, `abandonar`, `seguir`, `usar`; eventos con anuncio para lectores de pantalla (`dialogo`, `aceptada`,
  `avance`, `completada`, `aviso`, `rechazado`, `fin`) y los silenciosos del libro (`libro`, `mision`, `paso`).
  Máquina de estados pura en `maquina.ts`. Costura para P5: `Frasear` (hoy devuelve la línea escrita).
- **Núcleo de J4 en el enchufe** (`packages/feature`): `state.card.interact = { intent, prompt, radius, key }`
  comprobado por `defineFeature`; `api.within(entidad, clave)`; `features.reachable(x, z)` y `features.use(f, clave)`;
  `view.tag` (nombre que se queda sobre una cosa); `api.aventura`. Puertas, botones y objetos que se cogen de J4 usarán
  lo mismo.
- **Página**: `apps/plaza/interactuar.ts` (aviso «E: hablar con Alma, la guía» de lo más cercano; E, clic sin arrastrar
  sobre la cosa vía `view.pickThing`, o el propio aviso, que es un botón real para el móvil; nunca con el panel de
  construir abierto, en modo construir, escribiendo o hablando), `apps/plaza/dialogo.ts` (caja de conversación con
  botones reales, foco en la primera respuesta, dígitos 1-4 y Esc solo con la caja abierta), `apps/plaza/misiones.ts`
  (libro con J o «Misiones»: pasos ✓/→, Seguir, Abandonar, hechas con su insignia; línea del paso seguido con distancia
  y rumbo; columna de luz 15 s al seguir o al cambiar de paso; nota breve en pantalla).
- **Dibujo de las personas**: `aspectoPnj()` en `features/misiones/client.ts` (una función): el robot de la casa, quieto
  (sin animación: móvil frío), escala 0,4, con su nombre encima (sprite). Las cosas: el bloque de la casa, pequeño.
- **`window.__numinia.misiones`** (para el mapa, la ficha del jugador y los agentes): `objetivos()` →
  `[{ mision, paso, nombre, texto, x, z, seguida }]` (el paso actual de cada misión activa; `nombre` = el sitio, la
  persona o la cosa); `resumen()` → `{ activas, hechas, insignias: string[], seguida: { mision, titulo, paso, pasos,
  texto, donde } | null }`; `libro()`, `dialogo()`, `estado`; verbos `hablar(pnj)`, `elegir(n)`, `adios()`,
  `aceptar(mision)`, `abandonar(mision)`, `seguir(mision | "")`, `usar(cosa)`, `ofrece(feature, key)`, `alCambiar(fn)`.
  También `window.__numinia.interaccion` (`actual()`, `usar()`, `mirar()`).
- **Documentos**: `docs/EXTENDER.md` («Cosas que se usan de cerca» y «Misiones y personas: cómo escribe una aventura las
  suyas», para que un LLM escriba misiones), `docs/JUGADOR.md`, `docs/FICHA-TECNICA.md`, `limits.json` (7 límites),
  `packages/feature/README.md`.

Ficheros nuevos: `features/misiones/{formato,maquina,feature,server,client}.ts`, `aventuras/ejemplo/**`,
`apps/plaza/{interactuar,dialogo,misiones}.ts`, `packages/server/src/aventura.ts`, `tools/aventura.ts`,
`test/misiones.test.ts`, `tools/e2e-piernas/misiones.mjs`, este fichero.

Ficheros compartidos tocados (para juntar):
- `packages/feature/src/index.ts`: tipo `Card` + `interact` (una línea cambiada) y `Interact`/constantes justo debajo;
  `checkInteract` tras `okImportance`; una línea en la comprobación de `card`; `ServerHost.aventura`; `ServerApi.aventura`
  y `within` (al final del tipo y al final de `api()`); `ViewHooks.tag`; tipo `Reachable` tras `CardView`;
  `ClientRuntime.reachable/use` tras `stateOf`.
- `packages/instance/src/index.ts`: opción `aventura` (2 líneas). `packages/server/src/server.ts`: import, opción,
  un log y `aventura:` al final del `new Instance(…)` (línea larga: choca con quien añada otra opción ahí).
  `packages/server/src/main.ts`: una línea (`AVENTURA_DIR`).
- `packages/render/src/index.ts`: bloque de `tags`/`ray` tras `updateThings`; `tag`, `tagCount`, `pickThing` tras
  `beaconCount` (no toca `place`, `draw` ni `updateDecorations`).
- `apps/plaza/main.ts`: 4 imports, `tag` en los ganchos de la vista, el bloque J4/J5 tras `montarConstructor`, y
  `misiones, interaccion` en `__numinia`. `apps/plaza/index.html`: estilos al final del bloque, 6 elementos tras
  `#panel-construir` y la línea `#help` (« · E hablar o coger · J misiones»).
- `features/cliente.ts`, `features/servidor.ts`: un import y `...misiones` en la lista.
- `escribiendo(e)`: **no estaba en esta rama**: copia local con el mismo nombre en `apps/plaza/interactuar.ts` (la usan
  también `dialogo.ts` y `misiones.ts`). Al juntar con `chat`, importar la suya y borrar la copia.

## Decisiones

- **Dos funciones, un motor** (`pnj` con rol `persona`, `misiones` con rol `objeto`): la ficha tiene un rol por función,
  y una caja no es una persona para el lector de pantalla. Comparten el motor por un cierre (`crearMisiones()`).
- **El árbol es la política**: el texto de una persona nunca lo decide un modelo. P5 podrá *redactar* la línea escrita
  (`Frasear`), con STD-050 (papel y normas en las instrucciones; nombre del jugador y texto de personas en `<material>`;
  respuesta comprobada; la línea escrita de reserva). Coste por cadencia: se llama al hablar, nunca por tick.
- **`habla_con` y `entrega`**: se completan con la respuesta explícita (`avanzar_paso`/`entregar`) si el árbol de esa
  persona la tiene para esa misión; si no, basta con hablarle. Así una aventura sencilla no tiene que escribir árbol.
- **Las cosas de misión no desaparecen**: cada uno coge «la suya»; el aviso «E: coger…» solo sale a quien tiene ahora
  ese paso (`ofrece`). El servidor lo vuelve a comprobar.
- **El libro llega entero tras cada cambio** (pocos mensajes pequeños; las 20 hechas más nuevas) y solo a las conexiones
  de ese invitado (dos pestañas del mismo navegador comparten libro). Bots y agentes sin identidad: progreso en memoria.
- **Accesibilidad**: la línea de la persona llega una vez por el canal de anuncios (región `aria-live` polite `#avisos`,
  V1); la caja de diálogo es `role="dialog"` con nombre y foco en la primera respuesta, y **no** es una segunda región
  viva (se leería dos veces). La línea del paso seguido no es región viva (la distancia cambia demasiado).
- **Sin animación en las personas** (robot quieto) para el móvil frío; la columna de luz dura 15 s, no siempre.
- **Clic sobre cosas**: convención `view.place("<función>:<clave>")` para saber de qué función es lo que se toca.

## Números (de esta ejecución, 15-10, PC de desarrollo, núcleos 30-31)

- Pruebas: **99 bien, 0 mal** (92 de antes + 7 nuevas en `test/misiones.test.ts`).
- Puertas: unitarias 99/0 · capas 0 · determinismo e398ea35 = e398ea35 · **ancho de banda 25,0 kbit/s** (K=50) ·
  **plaza de 1.000: tick p99 7,49 ms** (p50 6,24). La plaza de la puerta no corre funciones: el coste de las misiones se
  mide aparte (siguiente).
- Tick de las funciones con 1.000 jugadores esperando llegar a un sitio: **p99 0,18 ms, p50 0,09 ms** (400 ticks tras 40
  de calentamiento; 5 pasadas iguales). Sin calentamiento, una pasada dio p99 2,4 ms (JIT).
- `tools/auto.sh e2e` en 8808/5188/5198: chromium OK · firefox OK · AR (IWER) OK · VR (IWER) OK · **misiones OK** ·
  https OK. La pierna de misiones tarda ~24-34 s (A: aviso «E: hablar con Alma, la guía», E, foco en «1. Sí. ¿Me
  enseñas la plaza?», 1, 1 → misión aceptada y seguida, `objetivos()` = pilar (18, 0), columna de luz 1, línea «★
  Primeros pasos…»; libro con J; pilar → `objetivos()` = Bruno (10, 8); **clic** sobre Bruno → «Te manda Alma», 1 →
  `objetivos()` = caja (4, 14); «E: coger la caja», E → hecha, libro «✓ Primeros pasos en la plaza · Insignia «Conoce
  la plaza»», `objetivos()` = []; B, otro invitado: ve «persona: Alma, la guía» y «persona: Bruno, el farolero», 0
  eventos de A, libro vacío; 0 errores de página; 3 modelos cargados, 0 fallos).
- Coste de dibujo: con las dos personas, la caja, los nombres y columnas a la vista, **67-68 draw calls** (sin ellas, 7-8;
  la pierna https de `tools/e2e.mjs` midió 56 con las personas a la vista). El robot son **19 draw calls por persona**.
  Tope del nivel D: 80. Cabe hoy, pero con más personas no.

## Sin comprobar

- Lector de pantalla real (NVDA/VoiceOver) con la caja de diálogo y el libro; solo se comprobó el texto en `#avisos`.
- Móvil real y táctil: el aviso como botón y que no arranque el joystick (hay `stopPropagation`, sin prueba con dedo).
- Firefox en la pierna de misiones (la pierna corre solo en chromium); WebGPU; VR (rayo y gatillo: no hecho).
- Junto con las otras ramas: `camara` (el clic sin arrastrar llega al lienzo: `pointerdown`/`pointerup` propios, y
  `view.cam?.modo?.()` para el modo construir), `constructor` (sus clics y teclas 1-4 con el panel abierto), `chat`
  (`escribiendo`), `mapa` (lee `objetivos()` y `resumen()`), `avatares` (cambiar `aspectoPnj` por un VRM).
- El instalador (`deploy/`) no lleva `aventuras/`: un servidor instalado arranca sin aventura (sin personas).

## Lo que falta (para otra fila)

- **Dibujo barato de personas**: LOD o un modelo de una pieza (el robot: 19 llamadas); con avatares VRM, decidir.
- J4 completo: mantener pulsado con anillo de progreso, rayo y gatillo en VR, puertas y botones de ejemplo, soltar
  lo cogido; inventario de verdad (hoy «llevar» vive dentro de cada misión).
- Marcas «!» y «?» sobre quien tiene algo para ti (es por jugador: un evento, no estado compartido).
- Libro incremental (hoy se reenvía entero en cada cambio) y más de 10.000 invitados con progreso (tope del almacén S4:
  hace falta un almacén por jugador o expirar los viejos).
- Columna de luz que se apaga al cambiar de paso (hoy caduca a los 15 s; `view.beacon` no se puede quitar).
- Validar que `apariencia.modelo` está en la biblioteca al cargar (hoy la página avisa si no lo encuentra).
- Panel en la muñeca en VR (J5 lo pide) y el mapa (rama `mapa`).

## Para el BACKLOG

- **J5**: la parte de misiones, hecha (formato con esquema, estado por jugador en el servidor, libro con seguimiento,
  misión de ejemplo de tres pasos completada en un e2e); falta «el mapa marca su objetivo» (rama `mapa`, con
  `objetivos()`) y el panel en la muñeca en VR. Propongo `hecho` cuando `mapa` junte.
- **J4**: `en curso` — núcleo hecho (ficha `interact`, `within`, `reachable`/`use`, aviso E/clic/botón); faltan los tres
  ejemplos (puerta, botón con luz, coger y soltar), mantener pulsado y VR.
- Filas nuevas: **J10 PNJ que dan misiones** (hecho aquí: `pnj@1`), **J11 Dibujo barato de personas** (LOD/una pieza;
  medir con 20 personas en el nivel D), **J12 Marcas de misión sobre las personas** («!»/«?», por jugador),
  **J13 Escribir aventuras con un LLM** (receta + `node tools/aventura.ts` como comprobación; un ejemplo escrito por un
  LLM y revisado), y en **P5**: usar `Frasear` (solo redactar, STD-050).

## Dependencias nuevas

Ninguna.
