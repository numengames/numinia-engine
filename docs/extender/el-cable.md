# El cable (D-041, v1): disparadores que un mundo escribe en datos, sin código

La pieza `disparadores@1` (`features/disparadores`) es el cable del mundo: un constructor (o un agente que escribe JSON)
conecta «cuando pase esto, haz aquello» en `MUNDO_DIR/disparadores.json` (`numinia-engine/disparadores@1`) y **nadie
decide nada en su página**: el servidor vigila quién entra en cada zona (`api.onTick`, una distancia por persona y
disparador), comprueba el alcance de cada pulsación (`api.within`), cuenta el cooldown en ticks y el «un solo uso»,
avisa a los cercanos (`disparado`, `CERCA_M = 30`) y emite **una acción por receptor** como evento con alcance
`"server"` (`accion`): la función dueña de esa acción la oye con `api.listen("disparadores", "accion", …)` y devuelve
`true`. Hoy `features/objetos` hace `muestra` / `oculta` (pone `oculto` al objeto por id o por nombre exacto; la página no
dibuja un modelo oculto al jugar y sí al construir); `features/sonido` hace `suena` (S6: toca el fichero del catálogo
de la casa, no un pitido); `teletransporta`, `da_paso` y `abre_enlace` llegan en sus historias: mientras tanto el
registro dice `nadie hace «teletransporta» en este servidor` en vez de callar.

- **El fichero:** `{ "disparadores": [{ id, nombre, tipo: "zona" | "boton", x, y?, z, radio?, frase?, cooldown?, un_solo_uso?,
  receptores: [{ accion, … }] }] }`. `id` es `[a-z0-9-]{1,16}`; `radio` es el de la zona (0,5-64 m, 3 por defecto) o desde
  cuánto se pulsa el botón (1-16 m, 2); `frase` es lo que ve quien se acerca al botón («E: pulsar», en el ordenador,
  el móvil y el visor; por defecto `pulsar <nombre>`); `cooldown` 0-3600 s; `un_solo_uso` gasta el disparador para
  siempre (el botón deja de ofrecerse: su `alcance` pasa a 0). Receptores (hasta 8; una línea mala tira el disparador
  entero, y el registro dice cuál): `{ "accion": "muestra" | "oculta", "objeto": "<id o nombre>" }`,
  `{ "accion": "teletransporta", "x", "y"?, "z" }`, `{ "accion": "da_paso", "mision", "paso" }`, `{ "accion": "abre_enlace",
  "enlace": "https://…" }`, `{ "accion": "suena", "sonido" }`. Hasta 64 disparadores por mundo; sin fichero no hay ninguno y
  el motor no cambia (la huella de la simulación es la misma: `test/disparadores.test.ts`).
- **Estado por disparador:** `nombre, tipo, x, y, z, radio, alcance, frase, cooldown, unSoloUso, usos, enEspera, agotado`;
  intención `pulsar {disparador}` (2/s, ráfaga 4) y, para quien construye, `editarReceptores`, `crearDisparador` y `borrarDisparador` (más abajo); eventos `disparado` (cercanos), `senal` y `accion` (solo servidor) y
  `rechazado` («Acércate…», «Todavía no: … espera N s», «… ya se usó»). Una zona nunca regaña: si está en espera o
  gastada, entrar no hace nada; se dispara al **entrar** (una vez por entrada, por persona) y salir y volver a entrar
  vuelve a contar si el cooldown pasó.
- **Ejemplo mínimo (botón que enciende una farola oculta):** `{ "disparadores": [{ "id": "rojo", "nombre": "Botón rojo",
  "tipo": "boton", "x": 12, "z": 0, "frase": "E: pulsar", "cooldown": 5, "receptores": [{ "accion": "muestra", "objeto":
  "Farola" }] }] }` con un objeto llamado «Farola» marcado como invisible al jugar en el constructor.
- **Crear y borrar cables en vivo (historia A, «cable sin JSON»):** quien tiene permiso de construir ya no necesita
  tocar el fichero. En el panel Cable (cajón del constructor), **«+ Nuevo cable»** crea un botón en el sitio donde
  estás (id `cable-1`, `cable-2`…, frase «E: pulsar», con un receptor de partida `suena «campana»` que luego
  cambias) y cada cable tiene su **«Borrar»**, que pide confirmación en la propia fila («¿Borrar «X»? Sí, borrar /
  Cancelar»). Todo se puede hacer con teclado y los botones llevan `aria-label`. Detrás hay dos intenciones nuevas,
  limitadas igual que `editarReceptores` (1/s, ráfaga 3), solo con permiso de construir:
  - `crearDisparador {disparador, nombre, tipo, x, y, z, radio, frase, senal, cooldown, unSoloUso, receptores}` — la
    misma forma que una línea de `disparadores.json` (`receptores` viaja como JSON en texto, hasta 512 bytes; `radio`
    es el de la zona o el alcance del botón; `tipo` es `zona`, `boton` o `senal`). **El servidor la valida con el
    mismo lector que lee el fichero** (`leerDisparador`: nada se copia), así que vale exactamente lo que valdría
    escrito a mano, y añade los topes del mundo: **64 cables por mundo**, **8 receptores por cable**, id
    `[a-z0-9-]{1,16}` y **único**. Si lo acepta, el cable aparece para todos al momento (zonas, botones y señales
    funcionan igual que los del fichero), avisa a quien lo creó (`creado`) y **reescribe `disparadores.json` sin
    reiniciar**.
  - `borrarDisparador {disparador}` — quita el cable del estado y de la vigilancia de zonas y señales (también si
    venía del fichero), avisa (`borrado`) y reescribe el fichero. Un id que no existe se rechaza diciendo cuál.
  - Los rechazos (`rechazado`) dicen cómo arreglarlo: «No puedes construir aquí…», «Ya hay un cable «x»: elige otro
    id o bórralo antes», «Este mundo ya tiene 64 cables… borra alguno antes», «receptores: un cable lleva como mucho
    8; quita alguno», «id «…»: usa minúsculas, cifras y guiones (hasta 16)». Nada de esto corre en el tick: crear o
    borrar solo toca una tabla, y un mundo sin cables sigue dando la misma huella de simulación.
  - Pieza reutilizable (R-1): cualquier mundo que cargue `disparadores` lo trae; la página no decide nada, solo
    manda la petición y pinta el estado que el servidor deja. En código: `disparadores.crearDisparador(…)` y
    `disparadores.borrarDisparador(id)` en `features/disparadores/client.ts`.
- **El cable dicho como frase (historia B, «cable sin JSON»):** el panel Cable enseña cada cable como una frase
  («Cuando alguien pulse “Botón rojo”, muestra “Farola”. Espera 5 s.») y deja el JSON dentro de un desplegable
  **«Ver datos»** (con el área de texto y «Guardar» de siempre). La frase la hace una función **pura**,
  `fraseDeCable(disparador, idioma)` en `features/disparadores/cable-frase.ts`: sin DOM, sin reloj, nunca tira (lo
  que no entiende sale como una frase segura) y cubre los 3 «cuando» (`boton`, `zona`, `senal`), las 8 acciones, varios
  receptores, el cooldown y el «un solo uso». Como no depende de la página, la misma función sirve al servidor y a
  los agentes (la historia D la usará para enseñar la frase antes de confirmar). **Ninguna palabra sale del código:**
  los textos viven en un fichero por idioma, `cable-frases.es.ts` y `cable-frases.en.ts`, con parámetros `{nombre}`,
  `{objeto}`, `{segundos}`… y las reglas de unir varios receptores (`lista.dos`, `lista.sep`, `lista.ultimo`; en
  inglés lleva la coma final). **Añadir un idioma:** copia `cable-frases.es.ts`, traduce los valores (mismas claves,
  mismos `{parámetros}`), regístralo en `FRASES` e `IDIOMAS` de `cable-frase.ts`; `test/cable-frases.test.ts`
  falla si falta una clave o cambia un parámetro. El idioma de la página es el `lang` del documento (`es` si no hay
  o no existe). Hoy hay `es` y `en`; **`ja`, `ko` y `pt-br` están pendientes** y caen en español.
- **La frase es el editor (historia C, «cable sin JSON»):** en el panel Cable, cada hueco de la frase es un control:
  «Cuando [alguien pulse el botón ▾] [nombre], [muestra ▾] [Farola ▾]. Espera [5 s ▾]. ☐ Solo funciona una vez».
  Solo se puede **elegir lo válido**: el tipo (3), la acción (8), el objeto de la lista real del mundo (o el
  movedor, para «mueve»), la misión, el sonido del catálogo, la espera (0, 1, 2, 5, 10, 30, 60, 300 s y, si el cable
  trae otra, también esa). Texto libre solo donde no hay otra forma: el nombre, el nombre de la señal, el enlace
  (https) y las coordenadas (con «Mi posición»). Hasta 8 acciones («+ Otra acción», «✕» para quitar). **La página no
  tiene reglas:** las opciones y las partes de la frase las da una función **pura**,
  `huecosDeCable(cable, idioma, contexto)` en `features/disparadores/cable-huecos.ts` (la frase como lista de textos y
  huecos; los textos salen de `cable-frases.es.ts`/`.en.ts`, claves `editor.*`, `opcion.*`, `boton.*`), y la lista
  del mundo la reúne `contextoDelCable(…)` (`cable-contexto.ts`, también pura). «Guardar cambios» manda UNA petición,
  **`disparadores.editarDisparador({ id, nombre, tipo, senal, cooldown, unSoloUso, receptores, mover? })`**: mismo
  permiso de construir y mismo límite de ritmo que `editarReceptores`; el servidor valida la línea entera con el
  mismo lector de `disparadores.json` (8 receptores, 512 bytes, nombre ≤ 60 bytes), conserva el id y el contador de
  usos, reescribe el fichero y responde a quien edita; si rechaza, el motivo, en español, sale junto al control
  (`aria-invalid` y `role=alert`). `mover` solo hace falta al pasar de «señal» a botón o zona (el cable aún no tiene
  sitio). **«+ Nuevo cable»** abre los mismos huecos con valores de partida y no existe hasta pulsar «Crear cable».
  Accesibilidad: cada control tiene `aria-label`; la frase entera es un `role=group` con su texto completo como
  `aria-label` (se lee en orden); todo es nativo (Tab, flechas, Espacio); blancos táctiles de 44 px (ya con el
  «Tamaño de la interfaz»); a 360 px la frase baja de línea sin desbordar. «Ver datos» sigue como estaba.
  La historia D reutilizará este mismo `editarDisparador` y su validación.
- **«Decírselo al mundo» (historia D, «cable sin JSON»):** en el panel Cable, quien puede construir escribe una frase
  («que al entrar en el círculo suene la campana», hasta 300 caracteres), pulsa **Decirlo** y la página enseña lo que
  entendió, ya escrito como frase, con **Aplicar** / **Cancelar**. Hasta pulsar Aplicar **no cambia nada**.
  - **Quién llama al modelo:** el **servidor**, nunca la página. `decirCable {texto, idioma}` pide a la IA del mundo
    que rellene **una herramienta cerrada** (`proponer_cable`, `features/disparadores/cable-decir.ts`): los 3 tipos,
    las 8 acciones y, en los huecos de nombre, **solo** los objetos, movedores, misiones y sonidos que ese mundo tiene
    de verdad (la herramienta se arma con sus listas y la API obliga al modelo a llamarla: `tool_choice`). Las reglas
    van en el turno de sistema, fijas y sin datos del mundo; la frase del usuario y las listas van en el turno de usuario,
    dentro de bloques de datos (`<material>`, `<frase>`), con `<` y `>` quitados para que nada cierre el bloque. Lo que
    devuelve el modelo es **solo un dato**: pasa por el mismo lector que `disparadores.json` (`leerDisparador`: 8
    receptores, tamaño, https, id…), por una comprobación de que cada nombre existe en el mundo, y nunca se ejecuta.
    Si algo no cuadra, la persona recibe el motivo en español (`decirRechazado`) y no se aplica nada.
  - **Dos pasos:** `decirCable` solo devuelve una **propuesta** (`cablePropuesto`: número y frase, calculada en el
    servidor con `fraseDeCable` en el idioma de quien la pidió). `confirmarCable {propuesta}` la aplica, **solo la
    misma persona, en 2 minutos** y con permiso de construir, volviendo a validar todo (el mundo pudo cambiar: un
    objeto borrado, el tope de 64) y reescribiendo `disparadores.json`. La propuesta vive en la memoria del servidor.
    Un cable de tipo botón o zona se pone **donde está quien lo pidió**, igual que «+ Nuevo cable».
  - **Topes** (como los Topes del cerebro de los habitantes): 3 peticiones por minuto y persona, `CABLE_DIA_MAX` por día
    UTC y mundo (100; `CABLE_MINUTO` cambia lo de por persona), una petición a la vez por persona y 4 en vuelo, 20 s
    de espera al modelo. Si el modelo falla, durante 1 minuto se dice «La IA no contesta ahora mismo» sin repetir
    lo que contestó el proveedor (puede repetir lo enviado; solo va al registro del servidor, 120 caracteres).
  - **Dónde vive la clave:** donde ya vive la del cerebro de los habitantes, **no hay un segundo sitio**: `CEREBRO_CLAVE`
    (o `ANTHROPIC_API_KEY`) y `CEREBRO_MODELO` en el entorno del servidor, leídos solo en `packages/server/src/cable-ia.ts`
    y usados con `cerebroClaude` de `packages/agent/src/cerebro.ts`. La clave nunca sale de ahí: ningún mensaje, estado,
    registro ni error la lleva, y la página no la ve (test con la clave puesta y búsqueda en todo lo que ven las páginas).
    **Ojo con la instalación:** `instalar-motor.sh --clave-ia` guarda la clave en `cerebro.env`, que **solo carga el
    servicio de los habitantes** (su usuario y su cortafuegos, que solo sale a Anthropic). El servicio del servidor
    no la carga, así que **en una instalación así «Decirlo» queda apagado hasta que el dueño decida** darle la clave
    al servidor (`EnvironmentFile=-…/cerebro.env` en su unidad y salida a Anthropic). No se hizo solo: es dinero y
    cambia lo que la casa exige.
  - **Sin IA no hay caja muerta:** el estado `puedeDecir {puede, motivo}` (solo para quien construye) dice si se puede
    y, si no, por qué en español («Este mundo no tiene una IA conectada. Pide al dueño que la añada.», «Hoy este mundo
    ya ha usado sus 100 peticiones…», «La IA no contesta ahora mismo…»). La página **oculta el cuadro y enseña el
    motivo** en su lugar. En pruebas el modelo es una función inyectable (`crearDisparadores({ decir: { pensar } })`);
    el servidor de pruebas e2e usa el cerebro eco con `CEREBRO_ECO=1` y `CABLE_ECO_RESPUESTAS=<fichero.json>`
    (`{"<frase>": <entrada de proponer_cable>}`): solo existe si se arranca así, ninguna ruta de producción lo activa.
  - **No toca la simulación:** la llamada es asíncrona y fuera del tick; la huella no cambia. Pieza reutilizable
    (R-1): cualquier mundo que cargue `disparadores` y le enchufe un `pensar` lo tiene. Textos en `cable-frases.es.ts` y
    `cable-frases.en.ts` (claves `decir.*`); `ja`, `ko` y `pt-br` siguen pendientes. En código: `disparadores.decir.pedir(texto)`,
    `.confirmar(propuesta)`, `.estado`, `.alResponder(fn)`; página: `apps/plaza/cable-decir.ts`. Leg e2e: `tools/e2e-piernas/cable-decir.mjs`.
- **Lo que no hace (todavía):** mover un cable ya creado a otro sitio desde la página
  (`editarDisparador` ya lo admite con `mover`, la página solo lo usa al salir de «señal»). La vista del constructor (`apps/plaza/cable.ts`) lista cada disparador, deja «Probar» un botón y edita
  en vivo sus receptores (`editarReceptores`: el servidor valida cada receptor igual que al leer el fichero y, si
  acepta, reescribe `disparadores.json`; el campo `receptores` del estado viaja a toda página, como el resto de la
  ficha; no es un secreto como el código de una cerradura). Sin servidor con escritor de ficheros el cambio vale
  hasta reiniciar y el registro lo dice.
