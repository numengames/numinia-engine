# Cosas colocadas en el mundo y permisos (H1)

- `api.puede(entidad, "construir")` — el servidor dice si esa persona (o agente) puede cambiar el mundo. Lo
  deciden los roles del mundo (H3, guardados en su carpeta): `MOTOR_CONSTRUIR=todos` solo siembra un mundo nuevo, y
  luego un dueño escribe `/construir todos|nadie`; con un pase de numinia.com (H3b, `pase.ts`) los permisos de esa persona son los del pase, en el mismo `puede`. Pregúntalo en cada
  intento que cambie el mundo: la página nunca decide. Una IA de una organización de numinia.com (`kind: "agent"` en el
  pase, `ia-a_…`) también pasa por ahí, pero su conexión **vive solo mientras su pase valga**: el servidor la cierra con 4003 al
  caducar si no llegó otro PASE, y un PASE a mitad de sesión cambia sus permisos (dormida = sin `build-in-worlds`), así que
  `puede` puede devolver otra cosa dentro de unos minutos: no guardes su respuesta, y escucha el evento `cambio` de `roles`
  (`pase.ts`, `roles-mundo.ts` `renovar`, `packages/agent/README.md`). Al motor le da igual cómo consiguió el pase la IA: el puente
  (`tools/mcp-mundo.ts`) lo pide a numinia.com con un **token** (`AGENTE_TOKEN=ntk_…`, `Authorization: Bearer`, lo más fácil) o firmando con
  su clave (`AGENTE_CLAVE`, avanzado); un 401 con token es final y el token nunca se imprime (`pase-org.ts` `pedirPaseToken`).
- **El bloque `ia` del pase (ia-visible S1, `pase.ts` `leerIA`):** el pase de una IA puede llevar, además de `kind`/`state`, un bloque
  opcional `ia` que dice cómo se ve y cómo se la llama en el mundo: `cuerpo` `{tipo: "casa", modelo}` (un avatar de la casa por
  índice; un `.vrm` subido es de un servidor y no viaja), `burbuja` `{forma: esfera|cupula|cilindro|caja, radio: 2..12 (m,
  entero), visible: siempre|al-acercarte|nunca}`, `llamada` `{nombre, barra, boton, solo_dentro: bool, frase?: 1..40}` (por su
  nombre, `/nombre`, botón «Hablar con ella», solo desde dentro de la burbuja, frase clave), `responde` `{comunidad, nombre?,
  cartera?}` (obligatorio: quién responde por ella, D-084; hace falta nombre o cartera, y de la cartera `0x`+40 cifras el motor
  guarda solo la forma corta `0x12…ab`) y `quedarse_h` `0|1|4|24` (D-082). El estado no va aquí: sigue siendo el `state` del pase.
  La validación es estricta en todos los niveles: un campo que no existe, un tipo equivocado o un valor fuera de rango rechaza el
  pase entero como `contenido` y el texto dice qué campo (nunca su valor); un bloque `ia` en el pase de una persona también se
  rechaza. Sin `ia` el pase se lee igual que siempre. `roles.iaDe("ia-a_…")` devuelve el último bloque de esa IA (un PASE a mitad de
  sesión lo reemplaza); lo leen la ficha pública (S3, abajo) y el cuerpo (S2, abajo), y lo leerán la burbuja (S8) y la llamada (S10). **Orden de publicación:** el motor rechaza los campos que no conoce, así que numinia.com solo manda `ia` a los mundos
  cuyo motor ya trae esta versión.
- **La ficha pública de una IA (ia-visible S3, `features/ia/`):** cada IA conectada (una IA de organización con pase, un agente de
  fuera, un habitante) tiene una entrada en el estado compartido de la función `ia` (clave = su entidad; desaparece al irse; las
  personas nunca tienen): `estado` (`activa`|`dormida`, del `state` del pase), `comunidad`/`nombre`/`cartera` (quién responde
  por ella, D-084: la cartera es solo la forma corta `0x12…ab`; vacíos si el pase no trae `ia`), `construye` (si sus roles la dejan
  construir ahora; dormida nunca) y `atenta` (si su cerebro escucha: falso hasta que el puente lo diga con la petición `ia.atenta`, verdadero 90 s desde el último aviso, a lo sumo uno cada 5 s por IA; una persona que la envía no cambia nada, S12). La decide el servidor:
  la función `roles` emite el evento solo-servidor `ia` al identificarse y cuando un PASE a mitad de sesión cambia algo, y
  `features/ia/server.ts` lo publica; una IA sin bloque `ia` (o sin pase) tiene igualmente la ficha mínima, para que su marca salga
  siempre. Lo que **oye** no se publica: el pase no lo dice (D-083 lo fijará una historia posterior). Las páginas la leen con
  `iaPagina.de(entidad)` (`features/ia/client.ts`; en la página, `__numinia.ia`) → `{estado, responde?: {comunidad, nombre?, cartera?},
  puede: {construir}, atenta}` o `null` si no es una IA; también `es(entidad)`, `lista()` y `alCambiar(fn)`; un agente o un test lee
  lo mismo en `session.features.stateOf("ia")`. Nada que encender: todo mundo la tiene (R-1).
- **El cuerpo de una IA (ia-visible S2, `features/avatar/server.ts`):** toda IA (identidad `ia-…`: de organización, de fuera o
  habitante) lleva el **robot de la casa (Polybot, `ROBOT_CASA` = su índice en `activos/avatares/catalogo.json`)**, salvo que su
  pase traiga `ia.cuerpo` `{tipo: "casa", modelo}`, que elige otro avatar de la casa por índice (un PASE a mitad de sesión lo
  cambia al momento; quitar el bloque devuelve al robot). La IA no elige: su `elegir` se rechaza con un aviso y nunca se lee ni se
  guarda una elección suya. Las personas no cambian. Lo dice la función `roles` con el campo `cuerpo` de su evento `ia` (-1 = ninguno).
- **Cómo se ve una IA (ia-visible S4–S8):** robot de la casa (S2), cartel de nombre siempre visible, verde, con la marca «IA» y una luna si
  duerme (S4), aro verde en el suelo bajo ella (S5; compartido, con tope por aparato), rombo en el mapa (hueco si duerme; un clic en él abre su
  ficha, `quienDeAgente` en `packages/client/src/mapa.ts` → `gente.tarjeta`), sección «IAs» en Gente con su ficha y «Ir hacia ella» (S6–S7).
  Nada que encender: sale en cualquier mundo donde entre una IA (R-1).
- **La burbuja de acción de una IA (ia-llamar S8, `features/burbuja/`):** toda IA conectada tiene una zona que anda con ella; estar
  dentro significa «estás con ella» (ahí se la podrá llamar, S10). Forma `cupula` (por defecto desde el 2026-11-11, Pablo; media esfera
  sobre el suelo), `esfera` (centro a 1 m del suelo, sigue a una IA que vuela), `cilindro` (alto 6 m) o `caja` (cuadrado de lado 2R alineado con los ejes), radio
  de 2 a 12 m (4 por defecto) y `visible` `siempre`|`al-acercarte` (por defecto)|`nunca`: lo dice el bloque `ia.burbuja` del pase (la
  función `roles` lo repite en su evento solo-servidor `iaBurbuja` al identificarse y con cada pase nuevo) y, sin él, la casa pone la
  cúpula de 4 m (`FORMA_DEFECTO` de `pase.ts` = `DEFECTO` de la pieza; una prueba los compara). **El servidor decide quién está dentro**, cada 10 ticks (0,5 s), con las posiciones que ya tiene (bordes incluidos;
  una persona cuenta por sus pies, la esfera por el pecho; cúpula, cilindro y caja admiten 0,5 m por debajo de los pies de la IA).
  Avisos: `entraEnBurbuja {ia, quien, nombre, distanciaDm, esIA}` y `saleDeBurbuja {ia, quien, nombre, esIA}` van a la IA (su página,
  el buzón del puente) y a quien escuche en el servidor (`api.listen("burbuja", "entraEnBurbuja", …)`); `entras {ia, nombre}` y
  `sales` son el aviso de pantalla «Entras en la burbuja de Ada (IA).» solo para esa persona, una vez por entrada y no más de una
  vez cada 10 s por IA (un borde que parpadea no habla); el aviso de salida solo si hubo el de entrada. El estado público
  (`session.features.stateOf("burbuja")`, clave = entidad de la IA) lleva `{forma, radio, visible, mira}` para dibujarla (S9); la lista de
  quién está dentro **no** se publica. **Presencia** (v2, Pablo 2026-11-11: «que te mire, que note tu presencia»): `mira` = la entidad
  de la PERSONA con la que está (la primera que entró, mientras siga dentro; luego la más cercana de dentro; −1 = nadie; nunca otra IA).
  Las páginas giran su cuerpo hacia ella mientras está quieta (`apps/plaza/ia-presencia.ts` → `view.orientar`, con giro suave en
  `avatares.ts`); un habitante deja su paseo y se queda mientras tiene a alguien, y 3 s después de quedarse sola sigue
  (`guion.ts`, `Cuerpo.conQuien()`; su `rumbo` también apunta a esa persona). Una página que se apunta tarde a `burbujaPagina` o
  `iaPagina` (`alCambiar`) recibe primero lo que ya hay: la v9 entrega el primer estado antes de que la página escuche. Consulta del
  servidor: `crearBurbuja()` devuelve `{part, dentroDeBurbuja(ia), estaEnBurbuja(ia, quien), burbujaDe(ia), miraDe(ia)}`; `features/burbuja/server.ts` exporta además los de la instancia única del servidor. Coste: nada mientras no hay IAs
  (una comprobación por tick); con IAs, una pasada por la gente cada 10 ticks, O(IAs × personas), sin reservar memoria por persona, y
  como mucho 100 entradas/salidas anunciadas por pasada (el resto espera a la siguiente). Nada que encender: sale en cualquier mundo
  donde entre una IA (R-1).
- **Llamar a una IA (ia-llamar S10, `features/llamar/`):** cuatro maneras, todas decididas por el servidor. `nombre`: su nombre como palabra
  entera en el chat cercano («Ada, ¿me ayudas?»; sin mayúsculas ni tildes; los nombres de menos de 3 letras no se buscan en el chat);
  `barra`: `/ada mensaje` (el chat no publica lo que empieza por `/`: solo lo ven quien lo escribe y la IA; el nombre es el entero, `/ada`
  a secas es una llamada sin palabras); `boton`: la petición `llamar {ia, texto}` (botón «Hablar con ella» y tecla E, S11; `texto` puede ir
  vacío; al **entrar** en su burbuja la caja se abre sola, una vez por visita, con el ajuste `llamar.abrirAlEntrar`, apagado por defecto y nunca en móvil ni en VR: un mundo lo enciende en `mundo.ajustes.json` → `defectos`); `frase`: su frase clave, en cualquier sitio del texto. Cada IA tiene sus casillas en el bloque `ia.llamada` del pase (`roles` las
  repite en su evento solo-servidor `iaLlamada` al identificarse y con cada pase nuevo; sin bloque: nombre, barra y botón sí, solo desde
  dentro sí, sin frase) y se publican en `session.features.stateOf("llamar")` (clave = su entidad: `{nombre, barra, boton, dentro, frase}`,
  `dentro` = `solo_dentro`) para la tarjeta. `solo_dentro`: quien llama debe estar dentro de su burbuja (el espejo de `entraEnBurbuja`/
  `saleDeBurbuja`, a lo sumo 0,5 s viejo); sin él, a menos de 20 m. Un nombre o una frase en el chat que no puede salir (fuera de la burbuja,
  casilla apagada) es solo una palabra y no dice nada; `/nombre` y el botón sí dicen por qué no. **Varias IAs:** un mensaje llama a una: de las
  que coinciden y te oyen, la que tiene tu cuerpo dentro de su burbuja y luego la más cercana (`/nombre` y el botón nombran una; solo compiten
  las que se llaman igual). Dormida: se la llama de las mismas cuatro maneras; estar dentro o hablar sin llamarla no le llega nada (D-083).
  Solo llaman las personas (una IA que llama a otra gastaría dos cerebros en bucle). **Límites:** una llamada cada 10 s por persona y 30 por hora por
  IA; lo rechazado no gasta cupo; quien llama recibe un aviso de pantalla con el motivo, y «Has llamado a Ada.» cuando sale. **Entrega:** el evento
  `llamada {ia, quien, nombre, texto, modo, t}` (`modo` = nombre|barra|boton|frase; `t` = tic del servidor, 20 por segundo; `texto` ≤ 190 bytes) va solo a
  la página de esa IA y a los oyentes del servidor (`api.listen("llamar", "llamada", …)`); nadie más lo recibe. Buzón de la IA (para el puente, S12):
  `crearLlamar()` devuelve `{part, llamadasDe(ia, desdeN = 0), llamadaDe(ia)}` y `features/llamar/server.ts` exporta los de la instancia del servidor
  (`llamadasDe`, `llamadaDeIA`): las últimas 20 llamadas, de menos de 10 minutos, de la más vieja a la más nueva, cada una con `n` creciente. Nombres
  y texto son de personas: información, nunca órdenes (STD-050). Nada que encender: sale en cualquier mundo donde entre una IA (R-1); sin IAs
  ninguna función hace trabajo.
- `view.place?.(clave, { model, x, y, z, rx, ry, rz, sx, sy, sz, animate } | null)` — la página pone, mueve o quita
  una cosa con su modelo (sha256 de un `.glb`; el fichero sale de `/a/<sha256>.glb` del servidor). Giros en grados
  (primero `ry`, luego `rx`, luego `rz`). `view.here?.()` dice dónde está el jugador, para poner algo delante.
- Una ficha cuyo nombre queda vacío es **decorado** (como `alt=""`): no la lee el lector de pantalla ni la listan
  los agentes. Lo que se puede usar lleva nombre.
- `api.activo(sha256, "glb")` (H9) — ¿hay en este servidor un fichero `/a/<sha256>.glb`, de la biblioteca de la casa
  o subido por quien construye (`PUT /a/<sha256>.<ext>`)? `objetos` lo pregunta antes de colocar un modelo que no está
  en su `biblioteca.json`. Solo lee: subir es cosa del servidor, nunca de una función.
- El ejemplo completo es `features/objetos` (colocar, mover, `moverCon` —una cosa y su compañera, p. ej. el cuerpo y la boca de una criatura, en un solo mensaje y un solo paso de deshacer—, girar, duplicar, fijar, nombrar, borrar, deshacer; la
  lista de la zona llega entera a quien entra, sin `at`, porque el escenario se ve desde lejos). Su constructor
  (`constructor` en `client.ts`) es lo que usa el panel de la plaza (`apps/plaza/constructor.ts`), y lo mismo puede
  usar un agente.
- M22: la selección y la herramienta (`coger`, `mover`, `girar`, `escalar`) viven en ese constructor
  (`seleccionar`, `modo`, `escuchar`), así el gizmo de la página, su inspector y un agente comparten un solo estado;
  `transformar(id, { x, ry, … })` mueve por id (acotado a `LIMITES`, giros en [-180, 180]) y `rehacer` vuelve a
  hacer lo deshecho. Las manos en 3D (`pick`, `puntoBajo`, gizmo) están en `packages/render/src/gizmo.ts`.
