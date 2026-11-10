# Condiciones de entrada (condiciones/c1-c2): las normas del mundo y la puerta del servidor

Un mundo dice qué hay que aceptar para entrar en `aventura/condiciones.json` (formato `condiciones@1`; sin fichero, el
ejemplo de la casa; fichero roto = una línea en el registro con la ruta del fallo y el ejemplo de la casa).

```json
{ "formato": "condiciones@1", "puerta": true,
  "capas": [
    { "capa": "casa", "version": "2026-10", "puntos": [
      { "id": "uso",     "titulo": "Normas de uso", "texto": "…", "obligatorio": true,  "tipo": "norma" },
      { "id": "informe", "titulo": "Informe anónimo de rendimiento", "texto": "…", "obligatorio": false, "tipo": "datos" } ] },
    { "capa": "comunidad", "version": "A", "puntos": [ … ] } ] }
```

- **Capas**: `casa` (la plataforma) y `comunidad` (la organización), cada una con su `version`. Aceptar una capa es aceptar
  esa versión; si el texto cambia y subes la versión, todos vuelven a tener que aceptarla.
- **`tipo`** (por punto, opcional, por defecto `"norma"`): `norma` = una condición del servicio, y si es `obligatorio` cierra
  la puerta hasta que se acepta; `datos` = un permiso sobre datos (informe de sesión, IA que escucha, avisos…) que
  **nunca** puede ser obligatorio (EDPB 05/2020 §39, RGPD 7.4): `obligatorio: true` con `tipo: "datos"` es un error del
  validador y el mensaje dice cómo arreglarlo (`"obligatorio": false`, o `"tipo": "norma"` si en realidad es una norma).
  Rechazar un punto de datos no bloquea nunca.
- **`nombre`** (por capa, opcional, 1–60 caracteres, c3): cómo llama la burbuja a esa capa en sus pasos («Numen Games»); sin él dice «La casa» / «La comunidad». El motor no lleva marca: los nombres salen de este fichero.
- **`puerta`** (opcional, `true`/`false`): pide encender la puerta del servidor para este mundo.

### Interruptores de funciones del mundo (f1: `features/funciones`, `funciones.json`)

Regla R-1: cada pieza del motor se enciende sin tocar código. El mundo guarda un interruptor por pieza en `entorno/funciones.json`
(formato `numinia-engine/funciones@1`, todo opcional; una clave que no está no dice nada y el mundo sigue como hoy):

```json
{ "schema": "numinia-engine/funciones@1", "normas": false, "dardos": true, "pesca": true }
```

- **`normas`**: la puerta de condiciones de entrada. **Orden de prioridad** (la primera que existe manda): la opción
  `condicionesPuerta` de `startServer` y la variable `MOTOR_CONDICIONES_PUERTA` (si|no) → `normas` de `funciones.json` →
  `"puerta"` de `aventura/condiciones.json` → apagada. Si manda el entorno, el estado sale con `fija: true` y el interruptor se niega.
  El interruptor solo existe si el mundo tiene condiciones (su `condiciones.json`, una fuente de la comunidad o la puerta forzada desde fuera).
  **Apagarla** deja entrar a quien estaba leyendo (su burbuja se va para todos); **encenderla** solo afecta a quien llegue después: nadie
  que ya esté dentro sale.
- **`dardos`, `pesca`** (f2: obedecen): por defecto encendidas, como hoy. Apagadas, **el servidor** rechaza toda acción de la pieza
  (dardos: `jugar`, `lanzar`, `cambiar`, `empezar`; pesca: `lanzar`, `recoger`, `soltar`) con «Los dardos están apagados en este mundo» /
  «La pesca está apagada en este mundo», y **cierra lo que estaba en marcha** al apagar: una tirada suelta termina (lo lanzado ya cuenta en
  el marcador, como al alejarse); un duelo, en marcha o esperando, se cancela para todos sin ganador (`finduelo` con `empate` y el texto
  «…partida cancelada»); quien pescaba pierde el flotador con `escape { motivo: "apagada" }` (sin captura, sin `otorga`, el sitio queda libre).
  **La página** no dibuja diana, estanque, flotador, pez en mano ni «E: tirar dardos / E: pescar» (los controladores devuelven `sitios()`
  vacío y `ofrece()` falso; el chunk de la pieza ni se carga) y reaparece al volver a encender, sin recargar. Lógica pura:
  `encendida(estado)` y `verSi(cosas, estado)` en `features/funciones/feature.ts`; la página lee el interruptor de otra pieza con
  `api.estadoDe("funciones")` (solo lectura, como en el servidor). Una pieza que se enciende sin código: un mundo cuyo único cambio es
  `"dardos": true` ya los tiene. Pruebas: `test/funciones-obedecen.test.ts`.
- **Quién**: quien puede construir (`api.puede(e, "construir")`, igual que el interruptor «Espacio base»). El servidor reescribe solo la
  clave pedida (las demás se quedan; sin fichero lo crea con `{ schema, <función> }`), lo valida y lo escribe de forma atómica; un fichero
  mal escrito no se sobrescribe nunca (el log y el rechazo dicen cómo arreglarlo). Sin carpeta de mundo, el cambio vale hasta reiniciar.
- **Desde la administración de numinia.com (e1: la puerta HTTP `/funciones`)**: el panel cambia los mismos interruptores sin entrar al mundo.
  `GET /funciones` → `{ "funciones": [{ "id": "normas"|"dardos"|"pesca", "activa": bool, "fija": bool }] }` (solo las que el mundo tiene:
  sin condiciones de entrada no sale `normas`); `POST /funciones` con `{ "funcion": "normas", "activa": true }` → `200 { ok, funcion, funciones }`
  (`puerta` vale como otro nombre de `normas`). Mismo pase que `/habitantes` y `/agentes` (`Authorization: Bearer <pase>`, `aud` = este mundo,
  permiso `manage-organization` o dueño): sin pase configurado `404` (cerrada), sin pase `401`, sin permiso `403`; CORS solo `https://numinia.com`,
  nunca `*`; cuerpo máximo 1 KiB (`413`). `400` función desconocida o cuerpo que no es `{ funcion: texto, activa: booleano }`; `404` el mundo no
  tiene esa función; `409` la fija el servidor (`fija: true`, «Lo fija el servidor») o `funciones.json` está mal escrito (no se toca);
  `500` no se pudo escribir. **Un solo camino**: `cambiar` de `features/funciones/server.ts`, el mismo que el verbo `poner` (sale por el enlace
  `EnlaceFunciones.cambiar`, `packages/feature/src/enlace-funciones.ts`): reescribe la clave, escribe atómico, aplica en vivo y avisa a todas las
  páginas conectadas; encender las normas solo pide aceptar a quien llegue después. El log dice quién: `el pase p_… enciende normas desde el panel`.
  Código `packages/server/src/funciones-http.ts`; pruebas `test/funciones-http.test.ts`. Un motor sin esta puerta contesta `404` en `/funciones`.
- **En la página**: estado compartido `normas` / `dardos` / `pesca`, cada uno `{ activa, fija }` (una función que el mundo no tiene no
  aparece); `__numinia.funciones.actual()` → `{ normas?, dardos?, pesca? }`, `.fija(nombre)` y `.ponerFuncion(nombre, si)`. Para un agente:
  el verbo `poner { funcion, activa }` de la pieza `funciones`. El panel que los pinta es f3 (abajo).
- **El panel (f3)**: en el cajón «Entorno» del constructor (PC y móvil), debajo de «Espacio base», el bloque «Funciones de este mundo» con un
  interruptor por función que el mundo tiene (`actual()`): «Normas de entrada» (con la ayuda «Apagadas, se entra sin aceptar normas. Para demos.»),
  «Dardos» y «Pesca». Mismo componente y estilo que «Espacio base»; muestra el estado del servidor, nunca el del clic; si la función es `fija`
  sale desactivada con «Lo fija el servidor.»; quien no puede construir no ve el bloque. Lógica pura (filas, textos es/en, si se puede
  pulsar) en `features/funciones/panel.ts` (+ `frases.es.ts`, `frases.en.ts`, mismas claves; ja, ko y pt-br pendientes); la página
  (`apps/plaza/entorno.ts`) solo las dibuja. Pruebas: `test/funciones-panel.test.ts`; navegador: `tools/e2e-piernas/funciones-interruptores.mjs`.
- **En el menú de VR (v3)**: «Ajustes» del menú de la muñeca acaba con «Este mundo»: una fila de título y una fila por función (las mismas, en el
  mismo orden y con los mismos textos que el bloque de PC, sacadas de `panel.ts`), con un botón que dice el estado del servidor («Encendida» /
  «Apagada») y pide lo contrario al pulsarlo con el rayo + gatillo. Si la función es `fija` el botón sale apagado y debajo va «Lo fija el
  servidor.»; quien no construye no ve el bloque. Filas en `features/funciones/menu-vr.ts` (puro); las dibuja `apps/plaza/xr-menu.ts`.
  Pruebas: `test/funciones-menu-vr.test.ts`; navegador (IWER): `tools/e2e-piernas/funciones-menu-vr.mjs` (apaga Dardos desde el menú VR y la diana desaparece).
- Pruebas: `test/funciones-interruptores.test.ts` (f1), `test/funciones-obedecen.test.ts` (f2), `test/funciones-panel.test.ts` (f3).

### Las normas de la comunidad llegan solas al mundo (w4: `packages/server/src/condiciones-fuente.ts`)

Cuando una comunidad publica una versión de sus normas en numinia.com (Ajustes → «Normas de vuestros espacios»), sus mundos la usan sin que
nadie copie nada a mano, y **cada mundo guarda su copia en su carpeta**: si numinia.com está caída, el mundo sigue con la última que bajó
(file over app). El motor **tira** (pull); numinia.com no necesita saber dónde vive el mundo ni tener llave para escribir en él.

Un autor lo activa con una línea en el `aventura/condiciones.json` del mundo (la dirección está en la página pública de normas de su
comunidad: `/es/communities/<id>/normas/`):

```json
{ "formato": "condiciones@1", "puerta": true,
  "comunidad": { "fuente": "https://numinia.com/api/community-terms?comunidad=numen-games" },
  "capas": [ { "capa": "casa", "version": "2026-10", "puntos": [ … ] } ] }
```

- **Qué hace**: al arrancar y luego cada 15 minutos (`MOTOR_CONDICIONES_FUENTE_MIN`, nunca menos de 5: numinia.com guarda la respuesta 5
  minutos) descarga ese JSON (`community-terms-public@1`), valida la capa con el mismo lector de C1 (un punto `datos` obligatorio se
  rechaza aquí también) y, si es válida y distinta, la escribe en **`aventura/condiciones-comunidad.json`** y la pone encima de la capa de
  la casa. La capa `casa` sigue saliendo de `condiciones.json` (o del ejemplo); la `comunidad` descargada sustituye a la que el autor
  hubiera escrito a mano.
- **A quién le toca**: la oferta cambia para **quien llega después**; quien ya está dentro sigue dentro (la conexión admitida no se
  vuelve a cerrar) y quien está dentro de la burbuja recibe el texto nuevo y la burbuja empieza de nuevo con él. Como la versión de la
  capa cambia, quien aceptó la anterior tiene que aceptar la nueva (c6 enseñará solo lo que cambió).
- **Si falla algo** (red caída, HTTP ≠ 200, JSON roto, respuesta de otra comunidad, publicación más vieja que la copia, más de 256 KB,
  más de 8 s): una línea `[condiciones] …` en el registro y sigue lo que había (la copia; sin copia, la casa y lo que el fichero lleve
  a mano). Nunca impide arrancar. Con copia el servidor arranca sin esperar; **sin copia espera hasta 5 s la primera respuesta** para que
  el primero en llegar ya vea las normas de su comunidad. Una copia de otra fuente (otra comunidad) no se usa.
- **Seguridad**: solo `https` (`http` únicamente en `localhost`/`127.0.0.1`, para pruebas); sin usuario ni contraseña en la dirección;
  sin dependencias nuevas (`fetch` de Node); tope de tamaño y de tiempo.
- **El operador manda**: `MOTOR_CONDICIONES_FUENTE=<url>` (o la opción `condicionesFuente`) sustituye a la del fichero; `=no` la apaga.
- **La copia** (`condiciones-comunidad@1`) se lee, se compara y se guarda en git como cualquier fichero del mundo:
  `{ "formato": "condiciones-comunidad@1", "fuente": "<url>", "descargadoEn": "<UTC>", "publicadoEn": "<UTC>", "capa": { "capa": "comunidad", "version": "…", "puntos": [ … ] } }`.
  Se puede borrar sin miedo (se vuelve a bajar); solo se usa mientras el mundo tenga esa misma `fuente`.
- **Probarlo en local**: un servidor HTTP cualquiera que sirva ese JSON en `http://127.0.0.1:<puerto>/…` sirve de numinia.com
  (`test/condiciones-fuente.test.ts` lo hace: nueva versión → nueva oferta; red caída → copia; JSON inválido → casa/copia).

### El pase dice lo que ya aceptaste en numinia.com (w5: `pase.ts`, `condiciones-puerta.ts`)

Quien ya aceptó las condiciones de numinia.com al iniciar sesión no tiene por qué leerlas otra vez al entrar a un mundo suyo. El pase
firmado con el que entra (`#pass=…`, el de «Entrar») puede llevar un campo más, **`acepto`**: `{ "acepto": { "casa": "terms@1.0.1+privacy@2.1.0" } }`
(la versión exacta de los textos que la web le hizo aceptar; el motor ignora las claves que no conoce, hoy `casa` y `comunidad`).

**Cómo lo declara quien hace el mundo**: en la capa `casa` de `condiciones.json`, `"versionWeb": "<esa misma cadena>"` — «el texto de esta
capa ES el que numinia.com muestra en esa versión». Sin `versionWeb` el mundo no se cree el pase y pregunta como siempre.

```json
{ "capa": "casa", "version": "2026-10", "versionWeb": "terms@1.0.1+privacy@2.1.0", "puntos": [ … ] }
```

Reglas (el servidor las aplica en `crearPuertaCondiciones`, en un solo sitio):
- **Solo cuenta si el pase es bueno**: firma Ed25519 válida, no caducado, de este mundo (todo lo de `verificarPase`). Un pase falso, caducado,
  de otro mundo o recortado no da nada: la persona entra como invitada y se le pregunta todo. El campo no alarga el pase (`exp` es el suyo) ni
  toca los permisos, la altura ni los roles. En el pase de una IA el campo está prohibido (la IA no acepta nada).
- **Coincidencia exacta**: `acepto.casa === versionWeb`. Si la web sube sus textos y el autor del mundo aún no ha revisado el suyo, no coincide
  y se pregunta como siempre (y, si la persona ya aceptó antes en este mundo, c6 le enseña solo lo que cambió).
- **Cubre las NORMAS de esa capa, nunca los permisos de datos**: la oferta (`condiciones-estado@1`) añade `porPase: ["casa"]`, no cuenta esa
  capa en `faltan`, y la lista en `capas` solo con sus puntos `datos` (o sin la capa si no tiene ninguno). Si no queda nada por pedir, `abierta: true`
  y la burbuja ni sale; si falta la comunidad, empieza en la comunidad y al final pide «Tus datos» con las casillas vacías. Un permiso de datos
  solo existe si la persona lo marca en el mundo.
- **No se guarda como aceptación**: la aceptación de la casa vive en la web; en el mundo solo se guarda lo que la persona acepta aquí. Al volver
  con un pase al día vuelve a valer; sin pase (invitado) se pregunta.
- El mundo no manda `acepto` a la página (la identidad que recibe el navegador no lo lleva).

### La burbuja de entrada (c3, PC y móvil: `apps/plaza/condiciones.ts`)

Con la puerta encendida, la página recibe `condiciones-estado@1` con `puerta: true, abierta: false` y pone al jugador en una pompa: el mundo se
ve detrás, borroso y oscurecido (un solo `backdrop-filter` CSS: nada de post-proceso GPU, barato en móvil) y un panel `role="dialog"` `aria-modal`
pide, paso a paso, una página por capa (casa, luego comunidad: lo esencial, el texto entero y una casilla obligatoria) y al final «Tus datos · entras
igual digas sí o no»: los puntos `datos` como casillas VACÍAS y dos botones iguales («Entrar sin lo opcional», «Aceptar todo y entrar»).
Además «← Atrás» y «Salir» (a la `ciudadUrl` del mundo si la tiene; si no, una despedida con «Volver atrás» / «Volver a empezar»). No se cierra con
Escape ni con clic fuera, el foco se queda dentro del panel (Tab da vueltas) y el resto de la página va `inert`; mientras está, ninguna tecla llega al
mundo y `readAxes` devuelve 0 (el servidor también te sujeta). Al aceptar manda `ACEPTAR` (`session.aceptar(versiones, datos)`); cuando el servidor
contesta `abierta: true` la pompa estalla (650 ms, o 30 ms con `prefers-reduced-motion`) y se camina. Móvil vertical (ventana estrecha o
`?aparato=movil-vertical`): el panel ocupa casi toda la pantalla. Con la puerta APAGADA (por defecto) no se crea ningún elemento ni estilo.
`apps/plaza/condiciones-logica.ts` guarda las decisiones sin navegador (pasos, qué manda ACEPTAR, qué cierra la puerta) y las prueba
`test/condiciones-burbuja.test.ts`; `__numinia.condiciones` expone `estado`, `cerrada()` y `alCambiar()` para c4 (VR); c5 (la pompa vista desde fuera) va aparte, justo debajo.
Mundo de pruebas: `aventuras/condiciones-prueba/` (ver su `LEEME.md`); e2e: `node tools/e2e-piernas/condiciones.mjs` (con `SHOTS=carpeta`, fotos de cada paso en PC 1400×900 y móvil 390×844).

### La burbuja de entrada en VR (c4: `apps/plaza/condiciones-xr.ts` + `packages/render/src/condiciones-vr.ts`)

Con el visor puesto la misma burbuja es **un panel en el mundo**: a 1,2 m delante, a la altura de los ojos, quieto (se pone una vez; si te das la
vuelta y lo dejas de mirar 2,5 s vuelve delante de ti) y con la letra grande (≥ 1,2°; los botones ≥ 3°). Es **otra vista de la misma lógica**, no otra
lógica: los pasos, los textos de cada paso, los botones del pie y cuándo están apagados, el rótulo de la casilla y lo que manda ACEPTAR salen de
`condiciones-logica.ts` (`textosDePaso`, `botonesDePie`, `rotuloNormas`); la burbuja plana sigue siendo la dueña del estado (paso, casillas, «enviando») y el
panel VR llama a los mismos métodos (`ir`, `marcarNorma`, `marcarDato`, `enviar`, `salir`). Por tanto:

- **Menos texto por página**: un paso de normas = «Lo esencial» (los títulos de las normas, numerados) y después el texto entero a 7 líneas por página;
  un paso de cambios (c6) = primero lo nuevo / cambiado / quitado y después el texto de lo que cambió; «Tus datos» = 2 permisos por página, todas las
  casillas VACÍAS y los dos botones iguales («Entrar sin lo opcional» / «Aceptar todo y entrar») en todas las páginas, más «Atrás» y «Salir». La casilla
  que acepta las normas se ve siempre, en cualquier página del texto. Las páginas solo recorren el texto; la ley sigue estando en la casilla.
  Paginación sin navegador: `apps/plaza/condiciones-vr-logica.ts` (`test/condiciones-vr.test.ts`).
- **Cómo se maneja**: rayo de cualquiera de los dos mandos + gatillo; pellizco del rayo de una mano seguida (lo hace `manos.ts` con cualquier `Panel`); tocar con
  la punta del dedo (a ≤ 15 mm, una vez, hay que despegar para repetir); la **palanca** (izquierda o derecha, ← →) pasa de página — dentro de la burbuja la
  palanca no gira ni mueve. «Salir» pregunta dos veces en VR (un rayo se desliza fácil); si sales, termina la sesión de VR para que se lea la despedida plana.
- **Locomoción**: con la burbuja abierta `vr.update` pone el movimiento y el giro a 0 (el cliente ni lo intenta; el servidor ya te sujeta) y no hay reloj
  ni menú de muñeca. Al estallar la pompa se vuelve a andar.
- **La pompa alrededor**: una esfera de 1,6 m vista desde dentro, un solo material plano, opacidad 0,16 como mucho y que sube en 1 s: el mundo nunca se oscurece
  de golpe y no hay viñeta. Estalla en ~⅓ s (crece ×1,35 y se desvanece; el panel se va con ella). Un solo lienzo → una textura, y se redibuja solo cuando
  cambia el modelo (paso, casilla, página) o el resalte (como mucho cada 100 ms).
- **Casos**: *PC con el visor, burbuja a medias* → al entrar en VR (botón «Entrar en VR» de la propia burbuja, porque la barra queda tras ella) el panel sale en el
  mismo paso y con las mismas casillas; la burbuja plana sigue montada bajo el visor (en el monitor se ve como siempre) y lo que hagas en uno se ve en el otro.
  *Quest, la burbuja plana sale antes de entrar en VR* → igual; el navegador de la Quest también la tiene (con su «Entrar en VR»). *Salir de VR con la burbuja
  abierta* → sigues en el mismo paso en la burbuja plana. *Servidor con la puerta apagada* → no se carga nada de VR de la burbuja.
- Se carga bajo demanda (`import()` en cuanto la burbuja sale en un navegador con VR, para que entrar no espere). Comprobación: `__numinia.view.vr.condiciones()?.estado()`
  y `.zonaMundo(id|botón)`; e2e con IWER (Quest 3 emulada): `node tools/e2e-piernas/condiciones-vr.mjs` (puertos 8861/5193; `SHOTS=carpeta` guarda el lienzo del panel).
  **No probado en una Quest real** (ver el PR: paso a paso por USB).

### La pompa vista desde fuera (c5: `packages/render/src/pompas.ts`)

Quien aún está leyendo las normas (puerta encendida y no abierta) se ve, para todos los demás, **dentro de una pompa translúcida** con un
rótulo «Nombre · leyendo las normas…» (el rótulo de nombres de siempre, `nombres.ts`, que además se queda encendido y un poco más alto mientras
dura). Es una esfera con **una sola geometría y un solo material compartidos** (sin shader propio, sin refracción: un dibujo por persona que
lee y se ve, como mucho 24); al aceptar estalla en ~⅓ s sobre una copia del material que solo existe durante el estallido. Una pompa quieta no
pide fotogramas (`busy()`). Con la puerta apagada no se crea ni la geometría. Para comprobarlo: `__numinia.view.pompas()` y
`__numinia.view.nameTags()`; e2e: `node tools/e2e-piernas/condiciones-pompa.mjs`.

- **`LEYENDO` (15), servidor → página**, aditivo: `[15, (entidad u16 BE, estado u8)…]`, estado 1 = está leyendo, 0 = ya no (aceptó o se fue).
  Se manda **solo al cambiar** (llega y tiene que leer; acepta; se desconecta) y **una vez, como lista, a quien se conecta**: 4 bytes por
  cambio a cada otra conexión, **0 bytes por tick**, nada en la instantánea. Quien ya aceptó esa versión no genera nada al volver; con la puerta
  apagada no sale ni un byte (test: mismos bytes que sin puerta). Una conexión nunca recibe su propio estado (su pompa es el panel de c3).
  Hasta 300 entidades por mensaje. Cliente: `session.leyendo` (conjunto de entidades) y `session.onLeyendo(entidad, leyendo)`; la página lo
  pasa a `view.leyendo(entidad, si)`.
- **Ni se la oye ni se la empuja**: su voz no se reenvía (c2) y, mientras lee, el servidor rechaza `ordenar(…, { empujar | quieto | sentar })`
  sobre ella (`Instance.leyendoNormas(entidad)`, `api.leyendoNormas`) y `lucha` rechaza el golpe PVP («Esa persona está leyendo las normas»).
  No hay colisión cuerpo a cuerpo en el simulador, así que nada más la mueve. Una función nueva que mueva o dañe a otra persona pregunta
  `api.leyendoNormas(e)` antes.

### La puerta (apagada por defecto)

Con la puerta **encendida**, una persona que no ha aceptado todas las normas obligatorias de la versión actual de cada capa
se queda quieta donde llegó (sus entradas de movimiento se ignoran), y se ignoran su chat, su voz (no se reenvía nada de su
micrófono) y todo mensaje de función: colocar y construir, y cualquier acción de juego. Ver y oír a los demás no se toca.
No es un error del cliente: no suma a los mensajes malos. Una IA con su billete firmado no pasa por la puerta (no tiene
burbuja que pulsar).

Quién decide si está encendida, por orden: la opción del servidor `condicionesPuerta` (`startServer`) o la variable de
entorno `MOTOR_CONDICIONES_PUERTA=si|no` → la clave `puerta` de `condiciones.json` → **apagada**. Con la puerta apagada el
servidor se comporta exactamente como antes (no envía nada por su cuenta, no registra la función `condiciones`, no cambia
ni un byte) y solo contesta si la página pregunta. El registro del arranque dice una línea con el estado
(`[condiciones] puerta apagada|ENCENDIDA …`).

### Los mensajes (net, tipos 13 y 14, aditivos; `WIRE_FORMAT` sigue en 2)

- **`CONDICIONES` (13), servidor → página**: `[13, JSON]` con
  `{ formato: "condiciones-estado@1", puerta, abierta, faltan: [capa…], aceptado: { versiones: {capa: versión}, datos: [id…], en: ISO } | null, capas?: [{ capa, version, puntos: [{ id, titulo, texto, obligatorio, tipo }] }] }`.
  `abierta` = puedes moverte, hablar y construir (puerta apagada, o ya aceptaste lo vigente). `faltan` = las capas cuya versión
  vigente tienes que aceptar. `capas` (el texto entero) va en la oferta y no en la respuesta a `ACEPTAR`. Con la puerta encendida
  la oferta llega sola justo después de `IDENTITY`.
  **c6, campo aditivo `cambios` por capa** (solo cuando esa persona aceptó antes OTRA versión de esa capa y el servidor guardó las huellas;
  un cliente viejo lo ignora y enseña todo): `capas[i].cambios = { desde: "1.0", nuevos: [id…], cambiados: [id…], quitados: [id…], antes?: { id: "título de antes" } }`.
  `nuevos` y `cambiados` están en `puntos`; `quitados` ya no (solo su id y, en `antes`, su título). Cambia el título, el texto, `obligatorio` o
  `tipo` = `cambiado`. Un punto `datos` nuevo o cambiado se ofrece con la casilla VACÍA: el permiso de uno cambiado se pierde (consentimiento
  informado) y el de uno sin cambios sigue dado (`aceptado.datos` lo conserva aunque la página no lo muestre). Un registro de c2 (sin huellas) o una
  capa nunca aceptada: sin `cambios`, se pide todo. La capa con la misma versión aceptada no entra en `faltan` ni lleva `cambios`.
- **`CONDICIONES` (13), página → servidor**: un solo byte `[13]` = «mándame las condiciones y dónde estoy». Se contesta siempre
  (puerta encendida o apagada, antes o después de `IDENTITY`).
- **`ACEPTAR` (14), página → servidor**: `[14, JSON]` con `{ versiones: { capa: "versión que leíste" }, datos: ["id de dato marcado"…] }`
  (hasta 4 capas, 40 ids, 40 caracteres cada texto, 900 bytes). Solo cuentan las versiones **vigentes** y los ids que existen
  como puntos `datos`; lo demás se ignora. `datos` es exactamente la lista de permisos marcados (otra aceptación la sustituye:
  desmarcar es retirar). Hace falta haberse identificado (se guarda por persona); hasta 5 por segundo. Se contesta con un
  `CONDICIONES` sin `capas`.
- Se guarda por persona (`a:<id>` en el almacén de la función `condiciones`, `datos/condiciones.json`; solo existe con la puerta
  encendida): `{ v: {capa: versión}, d: [ids], en: ISO UTC }`; sobrevive a reinicios y viaja con la persona.
- Cliente (`ClientSession`): `condiciones` (último mensaje; conserva el último `capas`), `onCondiciones`, `pedirCondiciones()` y
  `aceptar(versiones, datos = [])`.

