# Misiones y personas (PNJ): cómo escribe una aventura las suyas (J5)

Una **aventura** es una carpeta de ficheros de texto que el servidor lee al arrancar (`AVENTURA_DIR=/ruta`; por defecto
`aventuras/ejemplo`, que es **contenido de ejemplo**; `AVENTURA_DIR=` vacío = ninguna). El motor pone la máquina
(`features/misiones`: los formatos, las comprobaciones, la máquina de estados, el diálogo, el libro); la aventura pone
qué misiones hay, quién las da y qué cosas se cogen. Comprueba una carpeta sin arrancar nada:
`node tools/aventura.ts <carpeta>` (dice cada problema con su fichero y su ruta, y cómo arreglarlo).

```
mi-aventura/
  misiones/<id>.json   formato "mision@1"
  pnj/<id>.json        formato "pnj@1"     (personas que no son jugadores: hablan y dan misiones)
  cosas/<id>.json      formato "cosa@1"    (cosas que se cogen o se usan)
  secuencias/<id>.json formato "secuencia@1" (un momento con guion que solo ve quien lo provoca: U14 (5))
  habitantes/<id>.json formato "habitante@1" (IA que viven en el mundo: packages/agent)
  saber/<nombre>.md    texto que un habitante sabe (hasta 16 kB; lo nombra su `cerebro.saber`; también .txt)
  ficha.json           formato "ficha@1"   (opcional: cómo se llama el mundo, de qué va y su portada)
  *.md                 notas para quien escribe (no se leen)
```

**`habitante@1` y su cuerpo propio (`apariencia`)** — sin ella, un habitante lleva el robot de la casa. Con
`"apariencia": { "modelo": "<sha256 de un .glb que lleva el mundo>", "escala": 1 }` (la misma forma que en `pnj@1`;
la escala es opcional) se dibuja ese modelo, **mirando hacia donde anda** (los modelos propios miran a +z). El servidor
lo cuenta en el estado `avatar` (`tipo: "modelo"`, `sha`, `ext: "glb"`, `escala`) y la página lo coloca como a una
persona del mundo; una persona nunca puede elegir ese tipo. Si el `.glb` no está en el servidor, vale el robot (nunca un
cuerpo invisible). **Vive como una persona del mundo** (2026-11-11): si el `.glb` trae clips con estos nombres, la página
pone `respira`/`idle`/`reposo` en reposo, `habla`/`talk` mientras se ven sus palabras (más o menos lo que se tarda en
decirlas: 1,2 s más 55 ms por letra, nunca más que su bocadillo) y `camina`/`walk`/`andar` mientras se mueve; quieta,
mira a la persona con la que está (`burbuja.mira`). Sin clips, el modelo se queda quieto. Ejemplo: Chispa, un moñoñi con
la boca en su propio nodo (el clip `habla` la escala).

**`habitante@1` y lo que sabe (`cerebro.saber`, E2)** — una IA con cerebro (escalón 2 o 4) conoce quién es por su
`cerebro.persona`, que no pasa de **1500 bytes**. Para lo que no cabe ahí (un programa de horarios, dónde está cada
cosa, una lista de patrocinadores) el fichero del habitante puede llevar `"cerebro": { …, "saber": "saber/procyon.md" }`:
una ruta **relativa a la carpeta de la aventura**, de la forma `saber/<nombre>.md` o `.txt` (una sola carpeta, `saber/`;
sin ruta absoluta, sin `..`, sin `\`). Cómo se lee:
- El servicio de habitantes (`packages/agent/src/main.ts`) lo lee **una vez al arrancar** con `lectorSaber` (`saber.ts`)
  y lo mete en el prompt del sistema **justo después de la persona**, bajo «## Lo que sabes» y entre `<saber>` y
  `</saber>`, como material de referencia de fiar (lo escribe quien administra el mundo, como la persona); el modelo
  contesta desde ahí y, si no está, dice que no lo sabe. Para cambiarlo hay que reiniciar el servicio.
- **Tope: 16 KB (`SABER_MAX`, 16.384 bytes)**, en bytes y no en letras. Más grande, vacío, que no exista, que sea un enlace que
  sale de la carpeta de la aventura, que no sea texto o que contenga algo que parezca una clave (`sk-…` o una cadena
  larga de letras y cifras) → **ese habitante no se carga**, y el log dice por qué en castellano
  (`[habitantes] NO se carga: habitantes/procyon.json.cerebro.saber: «saber/procyon.md» pesa 17601 bytes y el tope es 16384 (16 kB)…`).
- Viaja con el mundo: `aventura/saber/*.md|txt` entra en el zip `mundo@2` (copia, comprobar, importar) por las mismas reglas
  de toda la aventura (carpeta `[a-z0-9-]`, nombre `.json|.md|.txt`, hasta 64 KB por fichero), así que no hace falta
  tocar nada del servidor.
- Sin `saber`, nada cambia: el prompt es el de siempre, byte por byte. El prompt del sistema es el mismo en cada
  llamada de ese habitante, así que la caché de prompt del proveedor (`cache_control` del bloque de sistema) lo conserva.
- `node tools/aventura.ts <carpeta>` hoy solo comprueba la ruta como texto; que el fichero existe y cabe lo comprueba el servicio al cargar.

**`ficha@1`** (ADR-074: el mundo dice qué es desde su propia carpeta) — `{ "formato": "ficha@1", "nombre": "Plaza de
ejemplo", "descripcion": "…", "portada": "<sha256>.webp" }`. `nombre` de 1 a 60 caracteres (sin `<` `>` ni saltos de
línea), `descripcion` hasta 500 caracteres, `portada` = una imagen png, jpg o webp que el servidor ya tiene por su
sha256 (la biblioteca de la casa o una subida al mundo, en `datos/activos/`, que viaja en el zip; tope 4 MB, el de
cualquier imagen subida). Aquí, a diferencia de los demás formatos, se miden caracteres y **un campo desconocido se
guarda** (un motor más nuevo puede añadir alguno). El nombre va al `<title>` de la página y a `GET /status` (`nombre`,
`descripcion`, `portada` = `/a/<sha256>.<ext>` si el servidor la tiene). Sin ficha, todo como antes.

**`avatar`** y **`aforo`** (H7, opcionales, dentro de la ficha): `avatar` = el id de un avatar de la casa
(`activos/avatares/catalogo.json`: `astrodisco`, `skelly`…) que llevan TODOS mientras nadie elige el suyo (H10);
`aforo` = cuántas personas caben a la vez, entero de 1 a 1000 (`limits.json` `world_people_cap`); el tope real es el
menor entre ese aforo y la capacidad del motor. Los dos salen en `GET /status` (`avatar`, `aforo`; `aforo` sale siempre,
sin ficha = la capacidad). Con el mundo lleno, el servidor cierra la conexión con el código **4004** y el motivo
«lleno <dentro>/<aforo>»; la página lo enseña en el centro (`#mundo-lleno`, `role=alert`) y no reintenta sola. Un valor
que no cabe deja la ficha entera sin cargar, con su motivo en el log (`[ficha] no se carga: ficha.json.aforo: …`).
Se editan en el fichero o, en marcha, desde el cajón «Entorno» → «Ajustes del mundo» (pieza `ficha-mundo`; solo quien manda: administrador
o dueño): título, imagen, avatar por defecto y límite de personas. El servidor valida con las mismas reglas, reescribe SOLO esas claves
de `ficha.json` (las demás, como `descripcion`, `tema` o `audio`, quedan igual) y la puerta usa el límite nuevo al momento; bajar el límite
por debajo de los que hay dentro no echa a nadie, solo cierra la puerta al siguiente. El avatar nuevo lo llevan los que entran después.

**`audio`** (S6f, opcional, dentro de la ficha): lo que este mundo pide del sonido. **R-1: una línea lo enciende.**
`{ "audio": { "ambiente": "ambiente-numinia" } }` y ya suena el colchón de fondo. Cuatro campos, todos opcionales:

- **`ambiente`** — el id del catálogo de sonidos (`features/sonido/catalogo.json`) que suena como **cama única en
  bucle**. Hoy el único que vale es `ambiente-numinia`: 113 s en CC0 que un amigo de Numinia hizo para Numinia.
  Tiene que ser una fila **con fichero y con `bucle`**; se toca por **streaming**
  (`MediaElementAudioSourceNode`), nunca descodificada — descodificarla serían ~46 MB de RAM por un sonido que
  nadie escucha a propósito. **Sin este campo no suena ningún ambiente.**
- **`ambiente_ganancia`** — su volumen (×), de 0 a 4. Sin decir nada, **×0,2** (−14 dB sobre un fichero a −23 LUFS:
  debajo de todo, pero se oye; el nivel del original, ×0,042, no se oía). El
  deslizador de «ambiente» del jugador manda por encima: **a cero, el colchón ni arranca ni se descarga.**
- **`ambiente_sintetizado`** — hasta 8 ids de **receta** (`packages/render/src/audio/sintesis.ts`: `bed-*`,
  `capa-*`…) que este mundo enciende por su nombre. **De serie, ninguna**: una cama o una capa sintetizada no
  suena hasta que un mundo la nombra aquí (decisión de Pablo, 19-10). Encenderlas no enciende el colchón, ni al
  revés.
- **`avisos`** — un sonido de la casa para cada aviso de misión: `{ "recibida": "ui-confirmar", "entregada":
  "coger-soltar", "completada": "ui-logro" }` (esos son los de serie). `recibida` = aceptas una misión; `entregada` =
  haces un paso de tipo `entrega`; `completada` = terminas la misión. El valor es el id de una fila **con fichero** del
  catálogo (suena en la cabeza, sin panner, por el bus de interfaz) o `""` para que ese aviso no suene (su texto sigue
  llegando a quien lee). Cada paso que no es de entrega sigue mudo, a propósito. Si el catálogo aún no ha llegado o el
  id no tiene fichero, suenan las notas cortas de siempre.

Un valor que no cabe deja la ficha entera sin cargar, con su motivo en el log. Va en `GET /status` (`audio`).

### Cómo suena algo (S6f: una sola puerta)

Todo el motor hace sonar algo por **`packages/render/src/audio/sonar.ts`**, con una regla: **cuando existe el
fichero de un id, gana el fichero; la receta queda de respaldo.**

```ts
import { sonar } from "…/audio/sonar.ts";
sonar("ui-pulsar");                       // tiene fichero CC0 → suena el fichero
sonar("salto");                           // no tiene fichero  → suena la receta de sintesis.ts
sonar("dados", { semilla, donde });       // la semilla la manda el SERVIDOR: todos oyen la misma variante
```

El `AudioBuffer` de una receta entra por el **mismo** pool de voces que un fichero: el mismo tope del aparato, la
misma virtualización por prioridad-distancia, el mismo cooldown y el mismo bus. El buffer se genera **una sola
vez** por id y variante y se guarda. Un id que no tiene ni fichero ni receta **avisa una vez** y no rompe nada.

El **catálogo es la única lista de verdad**, también para lo sintetizado: una fila `"fuente": "receta"` no lleva
fichero, pero sí bus, prioridad, cooldown y **texto accesible** (que es obligatorio: ningún sonido sin su texto).
Si un día uno de esos ids consigue un fichero CC0, se le añade y el fichero gana sin tocar una línea de código.

**Quién decide qué suena.** Lo **compartido** lo manda el **servidor** con su semilla (D-048): la puerta, los
dados, el dardo, el pez cobrado y el teletransporte. `features/sonido/server.ts` se asoma con `api.listen` a los
eventos que esas funciones **ya emiten**, así que una función nueva que quiera sonar no tiene que saber nada de
sonido: emite su evento y se le añade una línea allí. Lo **local** (mis pasos, mi salto, mi aterrizaje, mi caña)
lo dispara la página y no viaja por la red: es de cada quien y se oye en la cabeza o a mis pies.

**Qué suena y qué no** (Pablo, 2026-10-19: «solo ponemos sonido a lo que normalmente se pone sonido»). Suena lo
que en el mundo haría ruido —pasos, puertas, agua, un dardo que se clava, unos dados— y los pocos hitos raros (una
misión completada). **No suena la interfaz**: ni los botones, ni abrir un panel, ni cada paso de una misión. Lo frecuente y lo que ya se ve se queda en silencio: el silencio es lo
que deja oír lo que informa. Antes de enchufar un sonido nuevo: ¿haría ruido de verdad?, ¿cuántas veces por minuto
sonará?, ¿lo dice ya otra cosa (la vista, la vibración, el servidor)?
Las **personas (PNJ)** hablan dos veces por conversación, sin palabras y bajito: un saludo corto («hmm», «¿ah?») cuando
la conversación **se abre** y una despedida cuando **se cierra**; las líneas nuevas y las respuestas, calladas (cada paso
con su voz saturaría). Sale de la persona, colocada en 3D a la altura de su boca, y solo la oye quien habla con ella
(`apps/plaza/pnj-voz.ts`, bus «efectos», con freno de 0,8 s para quien abre y cierra deprisa). Cada persona suena
siempre con la misma voz: la de su `voz` (pnj@1, abajo) o, sin ella, una elegida por su id.

**`tema`** (opcional, dentro de la ficha): cómo se ve la página de ESTE mundo, para que un evento traiga su aire sin
tocar el motor. Diez colores «#rrggbb» de los paneles — `fondo`, `superficie`, `elevado` (botones), `texto`, `texto2`,
`linea`, `foco` (lo que se toca), `accion` (el botón principal; la tinta encima, clara u oscura, la elige el motor),
`enfasis` (la misión seguida y los avisos), `etiqueta` —; `titulos`, la letra de los títulos, una de las que trae el motor
(`geist`, `geist-mono`, `bebas-neue`; todas SIL OFL, en `apps/plaza/public/fuentes`), nunca un fichero; `sombra`, el color
de una sombra desplazada en los títulos; `mayusculas` (true/false) y `forma` de los botones (`recta` o `pildora`). Un valor
que no cabe se deja fuera y se dice en el registro (`[ficha] tema.fondo: …`); el resto se aplica; una clave desconocida
se ignora. Va en `GET /status` (`tema`) y la página lo vuelca en las variables CSS de `apps/plaza/tema.css`
(`apps/plaza/tema-mundo.ts`). Sin tema, el aire de la casa. Ejemplo, el de la TRG26: `"tema": { "fondo": "#0b0006",
"texto": "#e8f8ff", "accion": "#ff8ebe", "enfasis": "#f9ff8e", "foco": "#64f5f0", "titulos": "bebas-neue", "sombra":
"#ff8ebe", "mayusculas": true, "forma": "pildora" }`.

**`interfaz`** (opcional, dentro de la ficha): qué botones quita ESTE mundo de la pantalla. Hoy un solo campo, `ocultar`, una
lista de grupos. Hay dos:
- `"gestos"` = «Saludar», «Bailar» y «Movimientos» (la barra de abajo en escritorio, el menú «…» del móvil y el botón
  «Movimientos» de la pantalla táctil). Pensado para un simulador de formación, donde esos botones sobran:
  `"interfaz": { "ocultar": ["gestos"] }`.
- `"recoger-soltar"` = el «Recoger» de la pesca (F) y el «Soltar» de lo que lleva el jugador (Q), en la barra de abajo y en el menú
  «…» del móvil. Para un mundo donde no se pesca y las cosas se cogen con «E» (una aventura de investigación):
  `"interfaz": { "ocultar": ["gestos", "recoger-soltar"] }`. **No** quita el «Soltar el báculo» ni el «Pasar el báculo» (son de quien
  dirige), ni la forma de coger: coger una cosa con «E» (o manteniéndola) es la tarjeta de la propia cosa, no un botón de la barra, y
  sigue igual. Ojo en móvil: allí no hay tecla Q, así que quien oculta «Soltar» en un mundo que se visita en móvil deja a la gente
  sin forma de soltar lo que lleva; úselo solo si la cosa vuelve a su sitio por otra vía (se entrega, se usa o se guarda).

**Solo quita botones**: las teclas (G para la rueda, H para bailar, F y Q) siguen funcionando, y el «Saludar» de la tarjeta de una
persona también (es otra cosa: saludar a alguien). El botón «…» del móvil solo nombra, para el lector de pantalla, lo que ofrece
(«Más acciones: saltar, saludar, bailar…»; con `gestos` oculto, «Más acciones: saltar…»). Un nombre que no existe se deja fuera y se
dice en el registro (`[ficha] interfaz.ocultar: «chat» no existe…`); el resto se aplica; una clave desconocida se ignora. Va en
`GET /status` (`interfaz`, solo si hay algo que ocultar) y la página lo lee en `apps/plaza/interfaz-mundo.ts`. Sin el campo, nada
cambia: ni `/status` ni la pantalla. Fuente: `leerInterfaz` (`packages/server/src/aventura.ts`); prueba: `test/interfaz-mundo.test.ts`.

Reglas para quien escribe (persona o LLM):
- **Ids** en minúsculas, cifras y guiones (`primeros-pasos`); cada fichero, un `formato` en su primera línea. Un campo
  desconocido es un error (así una tilde de más, `descripción`, no pasa en silencio). `notas` vale en todos.
- Los textos se miden en **bytes UTF-8** (una letra con tilde cuenta 2): título ≤ 80, descripción ≤ 300, texto de paso
  ≤ 160, línea de diálogo ≤ 400, respuesta ≤ 100, aviso ≤ 40, nombre ≤ 60, grupo ≤ 40, oficio ≤ 40.
- Posiciones en metros (`x`, `z`; −z es el norte, hacia donde mira la cámara al llegar), radios en metros.
- Lo que tenga un problema **no se carga** (y el registro dice por qué); el resto sí.

**`mision@1`** — pasos en orden (o en cualquier orden, los de un mismo `grupo`: abajo); cada uno se completa solo cuando
el servidor lo ve:

```json
{ "formato": "mision@1", "id": "primeros-pasos", "titulo": "Primeros pasos en la plaza",
  "descripcion": "Visita el pilar dorado, saluda a Bruno y busca su caja.",
  "requisitos": { "misiones": [] },
  "pasos": [
    { "id": "pilar", "tipo": "llega_a", "texto": "Visita el pilar dorado", "x": 18, "z": 0, "radio": 4, "lugar": "Pilar dorado" },
    { "id": "bruno", "tipo": "habla_con", "texto": "Habla con Bruno", "pnj": "bruno" },
    { "id": "caja", "tipo": "coge", "texto": "Recupera la caja", "cosa": "caja-de-bruno" }
  ],
  "recompensas": [{ "tipo": "insignia", "id": "conoce-la-plaza", "nombre": "Conoce la plaza" }],
  "textos": { "aceptada": "Lo tienes en tu libro (J).", "completada": "Bruno ya puede arreglar los faroles." },
  "repetible": false }
```

| Paso | Campos | Se completa cuando |
|---|---|---|
| `llega_a` | `x`, `z`, `radio` (1-50, 4), `lugar` (nombre para el mapa); opcional `y` (0–30 m: la planta) | el servidor ve al jugador a menos de `radio`; con `y`, además a menos de 2,5 m de esa altura (desde la planta de abajo no cuenta) |
| `habla_con` | `pnj` | elige en el diálogo de esa persona una respuesta `avanzar_paso` de esta misión; si su árbol no tiene ninguna, basta con hablarle |
| `recibe` | `pnj`, `cosa` | como `habla_con`; esa persona te da la cosa, que queda «llevada» para una `entrega` |
| `usa` | `cosa` | usa la cosa a su alcance (E) |
| `coge` | `cosa`; opcional `otorga` (el id de un `objeto@1` de `objetos/`) y `abreLibro: true` (P3: al completarse este paso, la página de quien la cogió abre el libro de misiones, p. ej. al coger el cuaderno de investigación) | la coge a su alcance (E); queda «llevada» para una `entrega`; con `otorga`, en ese momento pasa a tu Reserva el arma o la reliquia que la aventura definió (una vez; si el `objeto@1` no existe o es inválido, la misión no carga y el diagnóstico dice el fichero y el campo `pasos[n].otorga`) |
| `entrega` | `pnj` y `cosa`, o `cosas` (una lista de 1 a 8) | las lleva todas (cada una con un `coge` o un `recibe` antes en la misma misión) y elige `entregar` (o le habla, si no hay esa respuesta); se las da todas a la vez |

**Misión sin pistas (`pistas: false`, P3).** `mision@1` admite `"pistas": false` (por defecto `true`, lo de siempre). Esa
misión no señala nada: ni «!»/«✓» por su causa, ni estrella ni baliza en el mapa y el minimapa, ni flecha, y la línea de
arriba solo dice el nombre del grupo y su contador («★ Recoger datos 1/3»), nunca el objetivo más cercano. Sus pasos llegan a
la página sin sitio. El libro, los textos de los pasos y los contadores no cambian. Las demás misiones siguen señalando.
Para aventuras de formación en las que el libro no debe delatar qué importa.

**Aviso «antes haga…» (`antes`, P3).** Opcional en **cualquier** paso (1–80 bytes) menos los primeros (los que ya se pueden
hacer: allí nunca saldría): si el jugador intenta ese paso mientras sigue bloqueado tras otro sin terminar (llega a la zona de
un `llega_a`, o habla o usa su objetivo), el servidor le manda ese texto como aviso corto, **como mucho una vez cada 5 s por
paso**. Ejemplo: `{ "id": "precinto", "tipo": "llega_a", "texto": "Llegue al precinto", "x": 30, "z": 0, "lugar": "el precinto",
"antes": "Recoja antes el cuaderno de investigación." }`. Pon los textos de cara al jugador en «usted» si la aventura lo usa.

**`hace`: que quien construye haga algo de verdad (T1).** `{ "id", "tipo": "hace", "texto", "accion", "modelo"?, "disparador"?, "senala"? }`.
Lo decide el servidor a partir de lo que las otras piezas ya cuentan (no hay nada nuevo en el tick); solo cuenta si ese
paso es el que toca, y **sin permiso de construir no cuenta ninguna acción**. Un tutorial del constructor lo usa para
que cada misión enseñe un botón y no avance hasta que se ha usado de verdad. Ejemplo:
`{ "id": "pon-farolillo", "tipo": "hace", "texto": "Añade un farolillo al mundo", "accion": "coloca", "modelo": "farolillo", "senala": "dock-anadir" }`.

| `accion` | Cuenta cuando… |
|---|---|
| `coloca` | pones un objeto nuevo (no un duplicado); con `modelo` (el id de la biblioteca: `bloque`, `farolillo`…) solo uno de ese modelo |
| `mueve` · `gira` · `escala` | un objeto cambia de sitio · de giro (también la acción de girar) · de tamaño (un arrastre que cambia varias cosas cuenta una sola: la primera que pide la misión) |
| `oculta` | un ajuste deja el objeto oculto al jugar (si el ajuste lo deja visible, no cuenta) |
| `borra` | quitas un objeto |
| `crea_cable` · `edita_cable` · `borra_cable` | creas, editas o borras un cable (disparador); con `disparador` solo ese cable |
| `dispara_cable` | pulsas un botón o entras en una zona de un cable; con `disparador` solo ese |
| `abre_construir` · `abre_cable` · `abre_biblioteca` | la página abre el panel Construir, el cajón Cable o el cajón Añadir. El servidor no lo ve: la página lo dice con la orden `misiones.hace` y **solo estas tres** se aceptan (cualquier otra se rechaza); la página solo lo manda si hay un paso que lo pide |

`modelo` solo va con `coloca`; `disparador`, solo con las acciones de cable. **`senala`** (opcional, vale en **cualquier**
tipo de paso): el id del botón de la página al que apuntará la flecha (`[a-z0-9-]`, 1 a 32; p. ej. `construir`,
`dock-cable`). El motor solo lo valida, lo guarda y lo manda a la página con el paso (`misiones.senala()`); un paso `hace`
no tiene sitio en el mundo, así que no pone baliza ni marca en el mapa. La flecha (`apps/plaza/flecha.ts`, T3) ya lo lee: señala ese botón y, si no se ve, el que lleva a él
(`cable-nuevo` → `dock-cable` → `construir` → `mas` en móvil; lógica pura en `flecha-logica.ts`). Para oír esto las piezas dicen quién hizo qué con
dos eventos solo-servidor: `objetos.hizo` y `disparadores.hizo` (más `persona` en `disparadores.senal`).

**En cualquier orden: `grupo`.** Pasos **seguidos** con el mismo `grupo` (un texto de 1 a 40 bytes) forman un bloque que
se hace en el orden que quiera el jugador; la misión pasa al siguiente paso cuando están todos. El `grupo` es también el
nombre del contador que ve arriba de la pantalla. Un `grupo` repetido más adelante, separado, es un error (junta esos
pasos). Así es la misión de la TRG26: tres artesanos te dan una pieza cada uno, en cualquier orden, y luego llevas las tres
a Leonardo:

```json
"pasos": [
  { "id": "bastidor", "tipo": "recibe", "texto": "Recoge el bastidor de Cosimo", "pnj": "cosimo", "cosa": "bastidor", "grupo": "Piezas reunidas" },
  { "id": "telas", "tipo": "recibe", "texto": "Recoge las telas de Bianca", "pnj": "bianca", "cosa": "telas", "grupo": "Piezas reunidas" },
  { "id": "plano", "tipo": "recibe", "texto": "Recoge el plano de Artemisia", "pnj": "artemisia", "cosa": "plano", "grupo": "Piezas reunidas" },
  { "id": "entrega", "tipo": "entrega", "texto": "Entrega las tres piezas a Leonardo", "pnj": "leonardo", "cosas": ["bastidor", "telas", "plano"] },
  { "id": "cofre", "tipo": "usa", "texto": "Abre el cofre y recoge tu recompensa", "cosa": "cofre" }
]
```

En el libro, cada pieza que le falta sale como «ahora» y la entrega y el cofre con candado hasta que les toca (el libro
se abre solo al aceptar la misión, en cuanto termina la conversación con quien la da); las tres, en el mapa, y arriba
«★ El vuelo del Maestro · Piezas reunidas 1/3 · Bianca, a 12 m al norte» (la más cercana); al hablar con cada artesano,
«Has recibido: <la cosa>» con el icono de objeto (también al coger algo con un paso `coge`) y un sonido corto.
Hablar dos veces con el mismo no cuenta dos. Leonardo no acepta la entrega hasta que llevas las tres.

**Un momento que solo ves tú y un paso que espera (U14 (5)).** Dos campos opcionales de cualquier paso:
- `secuencia`: el id de una `secuencia@1` (abajo). Cuando el servidor da ese paso por hecho, manda la secuencia **solo a
  quien lo hizo** (a todas sus pestañas), y su página la pone: los demás jugadores del mismo servidor siguen viendo a esa
  persona en su sitio y pueden hacer su propia misión a la vez. Se manda una vez: quien vuelve a entrar no la ve otra vez.
- `espera` (segundos, 1–60): el paso no se puede hacer hasta que pasan esos segundos desde que le tocó (en un `grupo`,
  desde que empezó el bloque). Mientras espera sale con candado en el libro y la cuenta atrás («· en 7 s», también arriba
  de la pantalla), no es objetivo en el mapa y su persona o su cosa no lleva «!»; quien lo intenta antes oye «Todavía no:
  faltan 7 s para «Abre el cofre…».». Al cumplirse, el servidor le manda el libro y las marcas otra vez (una vez). La
  cuenta es del reloj del servidor y se guarda con el progreso (`desde`): volver a entrar, o un reinicio, no la reinicia.

Así acaba la TRG26: al darle las tres piezas, Leonardo se pone las alas y vuela (solo para ti), y el cofre se abre
cuando ha aterrizado:

```json
{ "id": "entrega", "tipo": "entrega", "texto": "Entrega las tres piezas a Leonardo", "pnj": "leonardo", "cosas": ["bastidor", "telas", "plano"], "secuencia": "vuelo" },
{ "id": "cofre", "tipo": "usa", "texto": "Abre el cofre y recoge tu recompensa", "cosa": "cofre", "espera": 10 }
```

**`secuencia@1`** — un momento corto con guion (1–30 s): pistas que se tocan a la vez, cada una con sus tiempos (en
segundos desde que empieza). Todo pasa **solo en la página** de quien la provoca: la persona se mueve allí, no en el
servidor; al acabar vuelve exactamente a donde dice el servidor.

```json
{ "formato": "secuencia@1", "id": "vuelo", "duracion": 9.5,
  "pistas": [
    { "tipo": "texto", "t": 0.2, "texto": "¡Eureka! Leonardo se pone las alas…" },
    { "tipo": "muestra", "modelo": "<sha256 de alas.glb>", "pnj": "leonardo", "offset": { "x": 0, "y": 1.45, "z": -0.16 }, "desde": 0.5, "hasta": 9.5 },
    { "tipo": "sonido", "t": 0.5, "sonido": "magia" },
    { "tipo": "mueve", "pnj": "leonardo", "claves": [
      { "t": 1.5 },
      { "t": 2.8, "x": -30, "y": 5, "z": -2, "giro": 90 },
      { "t": 3.8, "x": -26, "y": 6, "z": -6, "giro": 180 },
      { "t": 4.8, "x": -30, "y": 6.5, "z": -10, "giro": -90 },
      { "t": 5.8, "x": -34, "y": 6, "z": -6, "giro": 0 },
      { "t": 6.8, "x": -30, "y": 3, "z": -2, "giro": 90 },
      { "t": 7.8, "x": -30, "y": 0, "z": -2, "giro": 0 } ] },
    { "tipo": "texto", "t": 8, "texto": "Leonardo aterriza. En un momento podrás abrir el cofre." } ] }
```

| Pista | Campos | Qué hace |
|---|---|---|
| `mueve` | `pnj`, `claves` (1–12: `t` y, si quieres, `x`, `y` (0–60), `z`, `giro`) | la persona sigue sus claves (posiciones del mundo, en metros; giro en grados) por una curva suave que no se pasa de ninguna (si una clave está en el suelo, no lo atraviesa); lo que una clave no dice es su sitio y su giro del `pnj@1`. Antes de la primera, en su sitio; tras la última, quieta ahí. Una persona, un `mueve` a la vez |
| `muestra` | `modelo` (sha256 de un .glb), `desde`, `hasta`; y `pnj` con `offset` `{x, y, z}` (±10 m, en su marco: −z es su espalda), o `x`, `y`, `z`; opcionales `giro` (+ el suyo), `escala` (1) | un modelo de más de `desde` a `hasta`: con `pnj` va con esa persona aunque vuele (con su giro y su tamaño) |
| `texto` | `t`, `texto` (≤ 120 bytes) | la línea sale en la nota de la página y se lee en voz alta (lector de pantalla) |
| `sonido` | `t`, `sonido` (`suave`, `aviso`, `exito`, `error`, `paso`, `campana`, `magia`) | un sonido de la casa (notas cortas hechas en la página, sin fichero; con el volumen de efectos) |

- Hasta 16 pistas; cada `t`, `desde` y `hasta` dentro de `duracion`; las claves, cada una después de la anterior.
- Se comprueba al cargar: un `pnj` que no existe es un error (con la lista de los que hay), y también un `modelo` que el
  servidor no tiene (súbelo arrastrándolo al mundo o cópialo como `datos/activos/<sha256>.glb`; la biblioteca de la casa
  vale). Un paso que nombra una secuencia que no hay deja fuera su misión (se haría sin su momento).
- En la página: una secuencia a la vez (si llega otra, espera su turno; como mucho 3 en cola); mientras no suena
  ninguna, la página no hace nada por cuadro; en VR no mueve la cámara; su código (1,9 kB gz) se baja con la primera
  que llega. Para comprobaciones y agentes,
  `__numinia.misiones.secuencia()` → `{ id, t, duracion, personas, modelos, linea, cola }` o `null`.
- Coste: el servidor la convierte una vez en eventos (`secuencia`, una `pista` por pista y una `clave` por clave: 15
  eventos y 554 bytes el vuelo de arriba) y los manda solo a ese jugador; las esperas pendientes se miran 5 veces por
  segundo, solo las de quien tiene una (1.000 jugadores esperando: tick de las funciones p99 ≈ 0,15 ms).

Recompensas: `insignia` (un recuerdo de lo hecho) o `semilla` (`{ "tipo": "semilla", "color": "verde", "n": 1 }`: una
Semilla del Conocimiento al inventario de quien la completa, Y1); sin economía. `requisitos.misiones`: las que hay que haber
completado antes. Hasta 16 pasos, 16 misiones activas por jugador.

**La recompensa, apuntada una sola vez (U14 (6)).** Al completar una misión con `recompensas`, el servidor apunta en el
almacén de `misiones` (S4: `datos/misiones.json` + `.jsonl` del mundo) **una** concesión por jugador y misión, en la clave
`c:<misión>:<id del jugador>`: `{ "jugador": "<id>", "nombre": "Invitado IJKL", "mision": "vuelo-del-maestro",
"recompensas": ["sello-artifice"], "instante": "2026-10-17T03:41:12.345Z", "estado": "concedida" }` (el instante en ISO 8601,
UTC; unos 250 bytes, del tope de 4.096). Se escribe solo si no está y nunca se sobrescribe: pulsar otra vez, reconectar,
dos pestañas del mismo invitado o dos jugadores a la vez dejan una por jugador. Una misión `repetible` guarda solo la
**primera** vez (su instante). **Sin identidad (I1) no hay concesión**: una página que no dice quién es (un robot, un agente
sin billete) completa la misión en su libro de memoria y no queda apuntada; una IA con identidad sí (su nombre acaba en
« · IA»). No depende de ninguna cartera: si un día se emite un NFT, será un paso aparte que lea estas concesiones. Código:
`features/misiones/concesion.ts`; `estado` hoy siempre es «concedida».

Para quien organiza: `npm run concesiones -- <carpeta del mundo> [misión]` (o `node packages/server/src/concesiones.ts …`;
sin carpeta, la de MOTOR_MUNDO; vale también una DATOS_DIR como `.run/datos`) escribe en CSV `jugador,nombre,mision,
recompensas,instante,estado`, de la más antigua a la más nueva (varias recompensas en una celda, separadas por «;»; un
nombre que empezaría por `=` `+` `-` `@` lleva delante un apóstrofo, para que la hoja de cálculo no lo tome por una
fórmula), y por la salida de errores cuántas hay. Solo lee: funciona con el servidor en marcha (lee la foto y el diario del
mismo momento, como la copia del mundo; lo de la última fracción de segundo sale la vez siguiente). Va dentro del motor
instalado y de la imagen: `docker exec <contenedor> /opt/numinia-engine/node/bin/node packages/server/src/concesiones.ts /mundo
> concesiones.csv`.

```
$ npm run -s concesiones -- mundo vuelo-del-maestro > concesiones.csv
2 concesiones de «vuelo-del-maestro» en …/mundo/datos
$ cat concesiones.csv
jugador,nombre,mision,recompensas,instante,estado
abcdefghijkl,Invitado IJKL,vuelo-del-maestro,sello-artifice,2026-10-17T03:41:12.345Z,concedida
mnopqrstuvwx,Invitado UVWX,vuelo-del-maestro,sello-artifice,2026-10-17T03:44:58.020Z,concedida
```

Quien completa una misión ve en el centro de arriba, unos 4 s, el cartel **«Misión completada»** con su título y la
insignia (`apps/plaza/misiones.ts`: con el aire del mundo, la letra de los títulos de su `tema`; no quita ni el teclado ni el
ratón; es una región `aria-live` y el aviso general de `completada` no se repite) y un acorde corto tras las tres notas del
paso. La insignia queda en su ficha (I) y en su libro.

**`pnj@1`** — una persona: dónde está y un **árbol de diálogo determinista** que depende de tus misiones:

```json
{ "formato": "pnj@1", "id": "bruno", "nombre": "Bruno", "oficio": "Farolero", "descripcion": "Cuida de los faroles.",
  "posicion": { "x": 10, "z": 8 }, "giro": -90, "radio": 3, "apariencia": { "modelo": "<sha256 de un .glb>", "escala": 1 },
  "dialogo": {
    "entradas": [
      { "si": { "mision": "primeros-pasos", "estado": "activa", "paso": "bruno" }, "nodo": "recado" },
      { "nodo": "hola" }
    ],
    "nodos": {
      "hola": { "texto": "Buenas. Cuido de los faroles.", "opciones": [{ "texto": "Adiós.", "accion": { "tipo": "despedir" } }] },
      "recado": { "texto": "¿Te manda Alma? He perdido mi caja.", "opciones": [
        { "texto": "Yo te la busco.", "accion": { "tipo": "avanzar_paso", "mision": "primeros-pasos" }, "ir": "gracias" },
        { "texto": "Ahora no puedo.", "accion": { "tipo": "despedir" } } ] },
      "gracias": { "texto": "¡Gracias!", "opciones": [{ "texto": "Voy.", "accion": { "tipo": "despedir" } }] }
    } } }
```

- Al hablarle, el servidor abre el primer nodo de `entradas` cuyo `si` se cumple; **la última normalmente no lleva `si`**
  (lo que dice cuando nada más aplica). Si la última **sí** lleva `si` y no se cumple ninguna (P3), esa persona **no tiene nada que
  decirle a ese jugador ahora**: no sale «E: hablar con…», el servidor rechaza la charla («<Nombre> no tiene nada que decirle
  ahora.») y hablarle no cuenta ningún paso. Sirve para gente que solo está en una fase de la aventura (un cabo que solo habla
  mientras la misión está en su paso). Sin esa `si` final, todo sigue exactamente como antes.
- Condiciones (`si`, una o una lista: todas deben cumplirse): `{ "mision", "estado" }` con estado `sin_empezar`,
  `disponible` (sin empezar y con los requisitos hechos), `activa` (y si quieres `"paso": "<id de un paso que toca ahora>"`
  —en un grupo, uno que aún no has hecho: deja de cumplirse al hacerlo— o `"tiene": "<cosa>"`) o `hecha`. Una respuesta
  con `si` que no se cumple no se ve.
- Cada nodo: `texto` y hasta 4 respuestas (teclas 1-4). Una respuesta lleva `ir` (otro nodo), `accion` o las dos:
  `dar_mision` (la acepta, si puede), `avanzar_paso` (completa su paso `habla_con` o `recibe` con esta persona),
  `entregar` (completa su `entrega` a esta persona), `despedir`. Sin `ir`, la conversación termina.
- `apariencia.modelo` vacío = el robot de la casa; `apariencia.vrm` queda reservado (avatares VRM).
- `radio`: a cuántos metros se le habla (1-8, 3). La conversación se cierra si te alejas 4 m más.
- Opcional `posicion.y` (0–30 m): la planta en la que está (una torre); se dibuja a esa altura y solo se le habla desde
  menos de 2,5 m de ella (desde la planta de abajo ni sale «E: hablar con…» ni el servidor lo admite). Sin `y`, el suelo.
- Opcional `oficio` (1–40 bytes, U14 (4)): a qué se dedica («Carpintero», «Tejedora»). Sale en una segunda línea, más
  pequeña, bajo el nombre que flota sobre la persona; junto al nombre en el título de la conversación, y en la lista del
  mapa («Cosimo (Carpintero)»). Con oficio, deja el nombre corto: «Cosimo», no «Cosimo, el carpintero». Sin él, una línea.
- Opcional `voz` (`hombre-joven` o `mujer-mayor`): cómo suena la persona al empezar y al acabar la conversación (un
  saludo y una despedida cortos, sin palabras; las líneas no suenan). Sin `voz`, una de las dos elegida por su id:
  siempre la misma, pero puede no pegarle; dila si importa. Las tomas son CC0 (`features/sonido/catalogo.json`,
  `pnj-saludo-<voz>` y `pnj-despedida-<voz>`); una voz nueva entra por la biblioteca de sonido y por `VOCES_PNJ`
  (`features/misiones/formato.ts`).
- **Personas vivas (P2)** — una persona no es una estatua; se nota en tu página, sin que escribas nada:
  - **Reposo.** Respira (hasta un 1,5 % más alta, cada 3,5–5 s) y cambia el peso de pie (hasta 2° de lado, cada 6–9 s),
    cada una con su propio compás sacado de su `id` (nunca van a la vez). Si su modelo trae una animación que se llame
    `idle`, `reposo` o `respira`, suena esa en vez del movimiento de la casa. Más lejos de 25 m, o a tu espalda, se queda
    quieta. `"reposo": false` la deja quieta del todo.
  - **Gestos con sus propias animaciones.** Si, además del reposo, el modelo trae una animación que se llame `talk`,
    `habla` o `gesto` (p. ej. `Idle_Talking_Loop`: un nombre así **no** cuenta como reposo), suena mientras hablas con esa
    persona (conversación abierta con ella); y si trae una `walk`, `camina` o `andar`, suena mientras camina a su sitio
    nuevo. El paso de una a otra es un fundido de 0,3 s; sin la animación de un gesto, sigue con la que suena. Los modelos
    de personas **miran a +z** (glTF); un VRM 0.x mira a −z: gíralo 180° en el fichero (nodo raíz) o te dará la espalda al
    girarse hacia ti.
  - **Se vuelve hacia ti.** Cuando estás a menos de su `radio` + 1 m, el cuerpo gira hacia ti en medio segundo con un giro
    suave (solo el cuerpo; la cámara no se toca, ni en gafas) y mientras hablas con ella te sigue mirando; al alejarte
    vuelve a su `giro` en un segundo. `"mira": false` la deja mirando siempre a su `giro`.
  - **Sitio por fase.** `posiciones` (1–8) dice dónde está **para quien cumple cada `si`** (la misma gramática que
    `dialogo.entradas[].si`: una condición o una lista); vale la primera que se cumple *para ese jugador*, y si ninguna,
    su `posicion` y su `giro`. `giro` es opcional (sin él, el de la persona); `posicion.y`, como arriba. Una entrada sin
    `si` vale siempre: solo puede ser la última. Cada `posicion` a 30 m o menos de la de la persona (la página solo sabe
    de ella cerca). El servidor decide y se lo dice a cada jugador por su canal (evento `sitio`, solo a él y a sus
    pestañas, al entrar y cuando cambia): dos jugadores en fases distintas ven a la misma persona en sitios distintos, «E:
    hablar con…», el alcance del servidor, el mapa y la baliza usan **el sitio de ese jugador**, y la marca «!» la lleva
    sobre su cabeza allí. Si cambia de sitio mientras la miras, **camina** hasta él a 1,4 m/s (hasta 10 m; si es más lejos
    o no la tenías delante, aparece ya allí). Un mundo sin `posiciones` no manda ningún `sitio`.
  ```json
  { "formato": "pnj@1", "id": "sanitario", "nombre": "Sanitario", "posicion": { "x": 4, "z": 6 }, "giro": 180, "radio": 3,
    "posiciones": [
      { "si": { "mision": "inspeccion", "estado": "hecha" }, "posicion": { "x": 12, "z": 6 }, "giro": -90 },
      { "si": { "mision": "inspeccion", "estado": "activa", "paso": "datos" }, "posicion": { "x": 8, "z": 4 } } ],
    "reposo": true, "mira": true, "dialogo": { "entradas": [{ "nodo": "hola" }], "nodos": { "hola": { "texto": "Aquí estoy.", "opciones": [{ "texto": "Adiós.", "accion": { "tipo": "despedir" } }] } } } }
  ```
  Una página que no conozca `sitio` ve a la persona en su `posicion` de siempre (el estado compartido no cambia).
  - **Ronda (P16).** En vez de quedarse quieta, una entrada de `posiciones` puede hacer que la persona **ande por la casa**
    mientras su `si` valga: `"ronda": { "puntos": [...], "velocidad": 1,1, "modo": "vuelta" }`. `puntos` (2–8) son los sitios que
    visita, en orden; cada uno lleva `x`, `z` (a 30 m o menos de la `posicion` de la persona), `y` (opcional, como `posicion.y`: sin
    ella, pisa el suelo), `giro` (opcional, grados: hacia dónde mira mientras está parada; sin él, mira hacia donde venía) y
    `pausa` (segundos que se queda parada, 0–60; sin ella, 0 = pasa de largo). Va de un punto al siguiente **en línea recta**, con su
    clip de caminar, y en cada parada se queda con su reposo. `velocidad` en m/s (0,3–1,4; sin ella, 1,1). `modo`: `"vuelta"` (sin
    él; del último punto vuelve al primero) o `"ida_y_vuelta"` (del último vuelve por los mismos puntos). Una entrada con `ronda`
    puede no llevar `posicion`: vale el primer punto (y es la que usa la flecha del mapa antes de que ande). Sin `ronda`, todo es
    como antes, byte a byte.
    - **Todos calculan lo mismo.** Dónde está la persona a los *t* ms de empezar la ronda es una función pura
      (`rondaEn`, `features/misiones/ronda.ts`) que usan el servidor y la página con los mismos números (centímetros, décimas de
      grado y de segundo). El servidor fija el instante de inicio **cuando ese `si` empieza a valer para ese jugador** (un reloj por
      jugador y persona; dos jugadores no ven a la persona en el mismo punto de su ronda) y manda un solo evento `ronda` justo
      después del `sitio` (`pnj`, `puntos` = `x,z,y,giro,pausa;…`, `vel`, `ida`, `rt` = segundos de ronda transcurridos, `quieta`,
      `giro`); la página anda por su cuenta, sin más mensajes mientras camina. «E: hablar con…», el alcance del servidor
      (`api.within`), el mapa y la baliza usan **el punto de la ronda en ese instante**; si anda mientras se acerca, el aviso la
      sigue (la página avisa de su sitio cada ~0,4 m).
    - **Al hablar con ella se para.** Al abrir la conversación el servidor congela el reloj de esa persona *para ese jugador*
      (`quieta: true`, `rt` = dónde iba) y la página la deja donde estaba, mirándole; al cerrarla, el servidor **suma al inicio el
      tiempo que estuvo parada** (el reloj sigue donde se quedó) y manda otro `ronda` con `quieta: false`. Si dos pestañas del
      mismo jugador hablan con ella, sigue parada hasta que cierren las dos. La conversación de un jugador no detiene a la
      persona de otro.
    - **Los tramos son rectos y no se validan contra paredes**: el motor no tiene colisión barata para esto. Trace los
      puntos de modo que ninguna recta cruce un muro (en una casa: un punto en cada puerta). Los puntos son absolutos: si el
      suelo cambia de altura entre dos puntos, ponga la `y` de cada uno.
    - **Coste**: nada por cuadro para una persona sin `ronda`, ni para una parada (la página no vuelve a calcular hasta que
      acaba la pausa) ni para una lejana (la página solo conoce a la persona cerca). Mientras anda, un cálculo de ~1 µs y
      moverla; sin `ronda` el reloj ni existe. El reloj de la ronda vive en la memoria del servidor: tras reiniciarlo, cada
      ronda empieza de nuevo por su primer punto.
  ```json
  { "formato": "pnj@1", "id": "cabo", "nombre": "Cabo", "posicion": { "x": 10, "z": 0 }, "giro": 0, "radio": 3,
    "posiciones": [
      { "si": { "mision": "inspeccion", "estado": "activa" },
        "ronda": { "velocidad": 1, "modo": "vuelta", "puntos": [
          { "x": 10, "z": 0, "pausa": 8 },
          { "x": 14, "z": 0 },
          { "x": 14, "z": 6, "giro": 90, "pausa": 10 },
          { "x": 6, "z": 6, "pausa": 5 } ] } } ],
    "dialogo": { "entradas": [{ "nodo": "hola" }], "nodos": { "hola": { "texto": "Buenas.", "opciones": [{ "texto": "Adiós.", "accion": { "tipo": "despedir" } }] } } } }
  ```

**Marcas sobre las personas y las cosas («!» y «✓», U14 (4))** — las decide el servidor para cada jugador, con su
progreso, y le llegan **solo a él** (a todas sus pestañas) tras cada libro (evento `marcas`). La aventura no escribe
nada: salen de sus misiones.
- **«!»** (un signo grande en ámbar sobre el nombre) = tiene algo para ti **ahora**: te ofrece una misión que puedes
  coger ya (sin empezar o repetible, con sus requisitos hechos), o es la persona de un paso tuyo que toca ahora
  (`habla_con`, `recibe`, `entrega` del bloque en curso; en un `grupo`, todas las que faltan). Una **cosa** de misión
  lleva «!» cuando un paso que toca ahora es cogerla o usarla (`coge`, `usa`); solo entonces tiene nombre flotando.
- **«✓»** (verde) = ya hiciste lo suyo: te dio una misión que tienes o terminaste, o fue la persona de un paso hecho, y
  no te queda **nada** pendiente con ella (ni un paso más adelante en la misión, ni una misión que ofrecerte).
- Nada, en otro caso: los artesanos de la TRG26 no llevan «!» hasta que aceptas la misión de Pietro, y quien ya
  terminó contigo nunca vuelve a llevarla (salvo que te ofrezca otra misión).
- El minimapa y el mapa grande dibujan a esas personas con su marca (disco ámbar con «!», disco verde con «✓»; la
  estrella del objetivo sigue debajo). Cada lista de ids va en ≤ 256 bytes (≈ 25 ids cortos): si no cabe, se quedan
  fuera las del final (primero van los pasos de ahora, luego las ofertas; primero las misiones activas, luego las
  terminadas, la más nueva antes). La regla es una función pura, `marcas(progreso, aventura)` en
  `features/misiones/maquina.ts`.
- Coste: un sprite por persona cercana (como antes) y uno por cosa marcada; un rótulo se vuelve a pintar solo cuando
  cambia su texto o su marca (parado, ninguno).

**`cosa@1`** — `{ "formato": "cosa@1", "id": "caja-de-bruno", "nombre": "Caja de herramientas", "posicion": { "x": 4, "z": 14 },
"radio": 2, "aviso": "coger la caja", "apariencia": { "escala": 0.45 } }`. Sale «E: coger la caja» solo a quien tiene ahora
un paso `coge`/`usa` con ella; la cosa sigue en el mundo para los demás (cada uno coge «la suya»). Lo que da una persona
(`recibe`) también es una `cosa@1`: ponla donde la tiene esa persona (en su mesa); no sale «E» para cogerla.
Opcionales (J10): `posicion.y` (0–30 m: a la altura de la mano, para cogerla con la mano en VR, o en una planta alta; se
usa solo desde menos de 2,5 m de esa altura) y `apariencia.color`
(«#rrggbb»: el modelo pintado de ese color, para que dos cosas se distingan). Lo cogido en un paso `coge` se dibuja en la
mano que lo cogió (al lado de tu avatar en pantalla) hasta que la misión termina; luego vuelve a su sitio (lo recibido en
un `recibe`, todavía no: se queda en su sitio).

**Una cosa que se inspecciona (`dialogo`, P3).** `cosa@1` admite un `dialogo` opcional: el **mismo árbol** que el de `pnj@1`
(`entradas` con `si`, `nodos`, hasta 4 respuestas, `ir`; `accion` solo `avanzar_paso` o `despedir`: una cosa no da misiones
ni recibe entregas). Con él, la cosa ofrece «E: <aviso>» (p. ej. `"aviso": "inspeccionar la mancha"`) siempre que alguna
`entrada` valga para ese jugador —no solo cuando un paso `coge`/`usa` la señala— y abre el mismo panel de conversación (el
título es el `nombre` de la cosa). Así las cosas que no cuentan (la ventana, el cenicero) se pueden inspeccionar igual que las
que sí, y el juego no delata cuál importa. Un paso `usa` sobre una cosa con `dialogo` **se cumple con una respuesta
`{ "accion": { "tipo": "avanzar_paso", "mision": "<id>" } }` de ese diálogo** (como `habla_con` con una persona); inspeccionar
sin elegirla no cuenta, ni la de otra cosa, ni la de otra misión. Si la cosa tiene un paso `coge` pendiente, «E» la coge como
siempre. Como en las personas, si la **última** entrada lleva `si` y ninguna vale, la cosa no ofrece «E» y el servidor lo
rechaza («Ahora no hay nada que inspeccionar en <Nombre>.»). El servidor decide el alcance (`api.within`) como hasta ahora.
`node tools/aventura.ts <mundo>` comprueba el árbol y que cada `avanzar_paso` tenga su paso `usa` con esa cosa (y cada paso
`usa` sobre una cosa con diálogo, su respuesta). Plugs: misiones **v9** (estado de la cosa `dialogo`, evento `marcas` con
`callan`, `mision` con `pistas`, evento `abrirLibro`).

```json
{ "formato": "cosa@1", "id": "mancha", "nombre": "Mancha", "posicion": { "x": 12, "z": 12 }, "aviso": "inspeccionar la mancha",
  "dialogo": { "entradas": [{ "nodo": "ver" }],
    "nodos": { "ver": { "texto": "Una mancha oscura, seca.",
      "opciones": [{ "texto": "Tomar nota.", "accion": { "tipo": "avanzar_paso", "mision": "caso" } },
                   { "texto": "Seguir.", "accion": { "tipo": "despedir" } }] } } } }
```

**Una cosa que se marca como indicio (`marcable`, P4).** `cosa@1` admite `"marcable": true` (o un objeto con textos propios, ≤ 40
bytes cada uno, y `offset`): `{ "marcar": "Marcar", "desechar": "Desechar", "desmarcar": "Desmarcar", "dejar": "Dejar marcado",
"offset": { "x": 0, "y": 0.6, "z": 0 } }` (todo opcional; `offset` en metros, de −5 a 5, donde flota el marcador sobre la cosa).
Mientras **un paso `marca` suyo es el que toca**, la ficha de la cosa (su `dialogo`, o, sin él, una ficha mínima con su
`nombre` y su `descripcion`) termina con dos botones que añade el servidor a cada nodo: «Marcar» / «Desechar», o
«Desmarcar» / «Dejar marcado» si ya la marcó. «Desechar» y «Dejar marcado» solo cierran la ficha. Fuera de ese paso no salen
(ni «E» en una cosa sin `dialogo`). Como los botones suman dos a las respuestas del nodo y caben cuatro, **cada nodo de una
cosa marcable lleva como mucho 2 opciones** (`node tools/aventura.ts` lo dice con su ruta).

La lista de lo marcado es **por jugador** (máximo 16 cosas, en orden) y se guarda con su progreso: sobrevive a reconectar y a
reiniciar el servidor. El **número** de cada indicio es su puesto en la lista (desde 1); al desmarcar uno, los siguientes suben
(marcar A y B → 1 y 2; desmarcar A → B pasa a ser 1). Cada uno lo ve **solo en su página**: una placa amarilla con el número
en negro, siempre de cara, que se lee desde 2 m a la altura de los ojos (C-24 del estándar de cámara de las aventuras). Un solo
atlas de números (4×4) y un solo `Sprite` por indicio: el coste es una placa por cosa marcada. Las placas siguen puestas cuando el
paso termina; un intento nuevo de una misión que marca (repetible) empieza sin nada marcado y con los contadores a cero.

```json
{ "formato": "cosa@1", "id": "vaso", "nombre": "Vaso", "descripcion": "Un vaso con restos.", "posicion": { "x": 25, "z": 20 },
  "aviso": "inspeccionar el vaso", "marcable": true }
```

**`marca`: marcar los indicios que son (P4).** `{ "id", "tipo": "marca", "texto", "cosas": ["pisada", "vaso", "movil"] }`
(1 a 16 ids de cosas **marcables**, sin repetir). El paso se cumple cuando el conjunto de lo que el jugador tiene marcado es
**exactamente** `cosas` (el orden da igual): tres acertadas y una de más **no** lo cumplen, y se cumple en cuanto se quita la
de más. El libro no dice cuándo una está bien marcada: el paso no pone baliza ni marca en el mapa, y el aviso de cada cosa es
el mismo sea relevante o no. Con el paso en marcha se puede marcar cualquier cosa marcable (todas pueden quedar marcadas, sin tope
más que 16). El resto del libro no cambia.

**Contadores para evaluar (P4).** Por jugador y misión que tiene un paso `marca` (sin nota ni aprobado: solo se cuenta), en el
progreso (`cuenta`, hasta 8 misiones) y en `window.__numinia.misiones.libro()[i].cuenta`:
`marcas` (cada vez que marcó algo), `marcas_erroneas` (cada marca de una cosa que el paso no pide) y `desmarcados` (cada vez que
desmarcó). Una marca rechazada no cuenta; desechar tampoco. Se quedan al terminar la misión, para que una ficha de evaluación
posterior los lea. Plugs: misiones **v10** (estado de la cosa `marcable`, `mox`, `moy`, `moz`; evento `marcados` con `ids`,
separados por comas y en orden; `mision` con `marcas`, `erroneas`, `desmarcados`). Para agentes y páginas:
`misiones.marcados()` (los ids, en orden) y `misiones.numeroDe(id)` (0 = sin marcar). Sin ningún campo nuevo en los ficheros
de la aventura, nada cambia: ni el estado, ni los eventos, ni lo que se guarda.

**`foto`: sacar una foto con la cámara del motor (P10).** `{ "id", "tipo": "foto", "texto": "Foto", "grupo": "Foto", "objetivo": { "x": 5, "y": 0.5, "z": -8.3, "radio": 1 }, "distancia": 8 }`.
`objetivo` es una esfera (metros; `radio` de 0,1 a 20) sobre el rincón que hay que fotografiar (el cadáver, una ventana, una
puerta); `distancia` (1 a 60, opcional, **8** si falta) es lo más lejos de la cámara que puede estar su centro. El jugador abre
la cámara de fotos de siempre (`apps/plaza/foto.ts`, también la de VR) y la saca él: **no se crea otra cámara** y entrar en una
zona no hace nada. El paso no pone baliza, flecha, «!» ni marca en el mapa, ni hace parpadear el botón de la cámara; usa `grupo`
para que dos rincones sean un bloque que se cumple en cualquier orden. Reglas (las decide **el servidor**, `features/misiones/foto.ts`
y `maquina.ts` `fotografiar`):
- «Sale en el encuadre» = el **centro** del objetivo está dentro del frustum de la foto (con su fov vertical y su aspecto reales),
  delante de la cámara, a ≤ `distancia`, y sin pared entre el jugador y ese centro.
- Una foto cumple **como mucho un** paso `foto` de cada misión: de los objetivos pendientes del bloque en curso que salen, **el más
  cercano a la cámara** (empate: el primero del fichero). Un objetivo ya cumplido no vuelve a contar. Dos misiones con pasos
  `foto` pendientes reciben cada una su veredicto de la misma foto.
- Mientras haya un paso `foto` pendiente en el bloque en curso, una foto que no cumple ninguno suma **`fotos_erroneas`** a esa
  misión (junto a los contadores de `marca`: progreso, `libro()[i].cuenta`, que ya trae `fotos_erroneas` aunque valga 0). No se le
  dice nada al jugador. Fuera de un bloque con pasos `foto` las fotos no cuentan nada. Un intento nuevo de la misión los pone a cero.
- Al cumplirse, los avisos de paso de siempre (sonido, «Foto» marcado en el libro). La foto se guarda y se comparte como hoy.

Cómo llega al servidor: la página, al sacar una foto (plana o de VR) y **solo si algún paso suyo pide una foto ahora**, manda el
intento `foto` con la pose de la cámara: `x`, `y`, `z` (dónde estaba), `fx`, `fy`, `fz` (hacia dónde miraba, vector unidad), `fov`
(vertical, grados) y `aspecto` (ancho / alto). El servidor no se fía de ella más que lo justo: rechaza una pose imposible, exige
que la cámara esté a ≤ **28 m** del ojo del jugador según la posición **que él tiene** (correa del modo foto: el pivote a
`CAMARA.foto.alcance` = 12 m del ojo + la cámara hasta `CAMARA.foto.lejos` = 14 m detrás + 2 m de margen; `test/misiones-foto.test.ts` ata
estos números a `CAMARA`), mira como mucho **una foto por segundo** y el intento tiene su cubo (2/s, ráfaga 3). Para la pared usa
`api.rayo` (la malla de colisión del mundo, la misma del movimiento): el rayo sale del **ojo del jugador** hacia el centro del
objetivo, no de la cámara. **Límite conocido:** una cámara de foto que quede al otro lado de una pared que el jugador no tiene
entre sí y el rincón puede ver el rincón a través de ella, y un mundo sin malla de colisión (ni terreno) no tiene paredes que
cuenten; `api.rayo` además gasta del cubo del jugador (4/s, ráfaga 8), y si se agota la foto cuenta como sin pared. **Accesible:**
el verbo `foto` (`spoken`: «hacer una foto para una misión»); `pideFoto(misiones.libro())` (`features/misiones/foto.ts`) dice si algún paso lo pide ahora y
`misiones.foto(pose)` manda una pose (un agente puede hacer «una foto desde donde estoy mirando» con la suya); el cumplimiento
sale por los avisos del paso. Plugs: misiones **v11** (intento `foto`; en el evento `mision`, `fotos`, el contador de fotos
erróneas). Un mundo sin pasos `foto` no cambia: ni el estado, ni los eventos, ni lo que se guarda.

```json
{ "id": "ventana", "tipo": "foto", "texto": "Foto", "grupo": "Foto", "objetivo": { "x": 12.5, "y": 1.4, "z": -3, "radio": 1 }, "distancia": 10 }
```

**Evaluación al terminar una misión (P13).** Un campo opcional de `mision@1`, `evaluacion`, hace que al completar esa misión la
página enseñe una tarjeta con el **tiempo** de toda la misión (desde aceptarla hasta terminarla) y el de cada fase (cada bloque de
pasos), los **contadores** que el autor elija y una **puntuación**. Sin el campo, no cambia nada: ni el estado, ni los eventos, ni
lo que se guarda.

```json
"evaluacion": { "titulo": "Evaluación de la inspección", "base": 100, "minimo": 0,
  "resta": { "fotos_erroneas": 5, "marcas_erroneas": 10, "desmarcados_correctos": 10 },
  "tiempo": { "referencia_min": 20, "resta_por_minuto": 1 },
  "muestra": ["tiempo", "fotos_erroneas", "marcas_erroneas", "desmarcados_correctos"],
  "etiquetas": { "fotos_erroneas": "Fotos que no valían" } }
```

Todo es opcional. Puntos = `base` − (cada contador × su peso en `resta`) − (`resta_por_minuto` por cada minuto **entero** que pase
de `referencia_min`), siempre entre `minimo` (0 si no se dice) y `base` (100). Pesos y minutos son enteros: no hay fórmulas. Un
**contador** es cualquier nombre en minúsculas, cifras y «_» (`marcas`, `marcas_erroneas`, `desmarcados`, `desmarcados_correctos`,
`fotos_erroneas` de la historia P10…): el que no existe en el progreso del jugador vale 0, así que un contador que otra pieza
añada mañana ya funciona. `muestra` es la lista de filas, en orden (`"tiempo"` o un contador); si falta, sale el tiempo (si hay
`tiempo`) y cada contador de `resta`. Lo que resta puntos tiene que estar en `muestra` (el formato lo exige: la nota no esconde nada).
Cada fila lleva una etiqueta en castellano, de usted: la de la casa (`tiempo` «Tiempo de la misión», `marcas` «Marcas hechas»,
`marcas_erroneas` «Marcas erróneas», `desmarcados` «Marcas retiradas», `desmarcados_correctos` «Indicios correctos desmarcados»,
`fotos_erroneas` «Fotos no relevantes») o la que el autor ponga en `etiquetas` (hasta 40 bytes; obligada para un contador que el
motor no conoce). Los contadores de las marcas (`marcas`, `marcas_erroneas`, `desmarcados`, `desmarcados_correctos`) solo los hay en
una misión con un paso `marca`; el formato rechaza pedirlos si no lo tiene.

`desmarcados_correctos` (nuevo en la lógica de `marca`) cuenta cada vez que el jugador desmarca una cosa que el paso **sí** pide;
marcar una irrelevante ya suma en `marcas_erroneas` y desmarcarla después no suma nada más (solo `desmarcados`). Se guarda en
`cuenta` solo cuando ocurre.

**El tiempo lo mide el servidor**, con su reloj (ms): en el progreso de cada misión activa quedan `t0` (aceptada) y `tb` (el
momento en que se cerró cada bloque; un grupo de pasos es un solo bloque y su pausa de 2 s no cuenta), así que sobrevive a
reconectar y a reiniciar, y el tiempo con el servidor apagado cuenta. Al completarse la misión, el servidor calcula la tarjeta
(`features/misiones/evaluacion.ts`, funciones puras), la guarda en el progreso (`evaluaciones`, las 4 últimas) y la manda con el libro
(eventos `evaluacion` y `evaluacionFila`, solo a su dueño); detrás de ese libro llega `abrirEvaluacion`, que es también el anuncio
para lectores de pantalla y agentes («Evaluación de la inspección: 79 puntos. Tiempo de la misión: 2 min 05 s; …»). Una misión
aceptada antes de que el mundo tuviera `evaluacion` no tiene reloj: su tarjeta sale sin la fila del tiempo. Plugs: misiones **v12**.

**Fases con nombre (`evaluacion.fases`).** Una misión con muchos bloques (la del crimen tiene 8) no quiere una fila por bloque, sino el
tiempo de toda la misión y el de unas pocas **fases** con nombre. `fases` es opcional (1–8) y cada fase dice dónde acaba:

```json
"fases": [
  { "nombre": "Fase 1 · Datos preliminares", "hasta": "recoger-cuaderno" },
  { "nombre": "Fase 2 · La escena",          "hasta": "marcar-indicios" },
  { "nombre": "Fase 3 · El informe",         "hasta": "informar-sargento" }
]
```

Cada fase va desde el final de la anterior (la primera, desde que se acepta la misión) hasta que se cumple el paso `hasta`; si ese
paso está en un `grupo`, hasta que se cierra el bloque entero. La tarjeta enseña entonces la fila del tiempo total y **estas** filas
(`tipo: "fase"`; el nombre, de hasta 60 bytes, sale tal como se escribe, sin «Fase n:» añadido) en vez de una por
bloque. Sin `fases`, lo de siempre. El formato exige que `hasta` sea el id de un paso de la misión, que las fases vayan en el orden
de los pasos y que dos no acaben en el mismo bloque; el tiempo que pase después de la última fase cuenta en el total pero en
ninguna fase (acabe la última en el último paso para que las fases sumen el total). Una tarjeta guardada con otro número de fases que
el actual (el autor cambió la misión después) enseña solo el tiempo total, nunca una fila equivocada. Las filas de fase no restan
puntos y no entran en el resumen de una línea.

En la página, la tarjeta (`#evaluacion`, `apps/plaza/misiones.ts`) se abre sola al terminar la misión sin quitar el teclado (nunca
en VR), se cierra con «Cerrar» o Escape y se vuelve a abrir con «Ver evaluación» en la lista de misiones hechas del libro (J). Para
agentes y páginas: `misiones.evaluacion(id)` (o `misiones.libro()[i].evaluacion`) devuelve
`{ titulo, puntos, base, minimo, resumen, filas: [{ tipo: "tiempo"|"fase"|"contador", clave, etiqueta, texto, valor, resta }] }`, o
`null` mientras la misión no esté hecha o no lleve `evaluacion`. Queda fuera: el informe para el instructor (la misma tarjeta, de
todos los alumnos).
**Una cosa que se ve usada para ti (`apariencia.usada`, U14 (6)).** `"apariencia": { "modelo": "<sha256 del cofre
cerrado>", "escala": 1, "usada": { "modelo": "<sha256 del cofre abierto>", "escala": 1 } }`: cómo se ve la cosa para **quien
ya hizo el paso que la usa** (`usa` o `coge`) en una misión que lleva o que terminó. Los demás la siguen viendo como antes,
y cada uno abre «el suyo». `escala` es opcional (sin ella, la de la cosa); `modelo`, el sha256 de un `.glb` del mundo
(`datos/activos/<sha256>.glb`) o de la biblioteca. Lo decide la página de cada jugador con **su** libro (los pasos hechos
y su `que`: `usadasDe` y `aspectoCosa` en `features/misiones/client.ts`); el servidor solo manda los dos aspectos en el
estado de la cosa (`modeloUsada`, `escalaUsada`: misiones v5). Se recalcula cuando el libro ha llegado entero (no parpadea
mientras llega) y solo se vuelve a dibujar la cosa cuyo aspecto cambia. El libro trae las 20 misiones terminadas más
nuevas: una cosa usada en una más vieja vuelve a verse como antes. En la TRG26, el cofre cerrado y, al abrirlo, abierto e
iluminado solo para quien lo abrió.

Lo que pasa en el servidor (`features/misiones/server.ts`) y no se puede saltar desde la página:
- distancias (`api.within`: el radio y, si la persona o la cosa tiene `y`, menos de 2,5 m de altura —
  `ALCANCE_ALTURA_M`—), posiciones (`api.position`, con `y`, cada 0,2 s y solo de quien espera llegar a un sitio) y los
  pasos que tocan; hablar de lejos, coger algo que no toca o elegir sin conversación se rechaza diciendo por qué;
- el progreso es **por invitado** (I1) en el almacén (S4, `p:<id>`): sobrevive a los reinicios y llega **solo a su dueño**
  (eventos `libro`, `mision`, `paso`, `aceptada`, `avance`, `completada`, `marcas`, y U14 (5) `secuencia`, `pista`,
  `clave`); las personas y las cosas llegan con `at` (J9); U14 (5): un paso con `espera` cuenta con el reloj del servidor
  (la máquina no tiene reloj: el servidor le pasa `ahora` en cada suceso y guarda `desde` con el progreso);
- **el texto no lo decide un modelo**: el árbol es la política. Si un día un LLM da voz a una persona (P5), solo
  **redacta** la línea escrita (`Frasear` en `server.ts`) siguiendo STD-050: en sus instrucciones solo el papel de la
  persona y las normas de la casa; el nombre del jugador y lo que alguien escribió van en un bloque `<material>`
  vallado; su respuesta se comprueba y, si falla, se dice la línea escrita. Se llama al hablar, nunca por tick.

Para agentes y páginas: `window.__numinia.misiones` (`libro()`, `objetivos()`, `resumen()`, `dialogo()`, `hablar`,
`elegir`, `adios`, `aceptar`, `abandonar`, `seguir`, `usar`); el mapa lee `objetivos()` → `[{ mision, paso, nombre,
texto, x, z, seguida }]` (uno por paso que toca: en un grupo, todos los que faltan); `resumen().seguida.grupo` =
`{ nombre, hechos, total }` del grupo en curso de la misión seguida, o `null`. U14 (4): `marcas()` → `{ tiene, hecho,
cosas }` (ids: personas con «!», personas con «✓», cosas con «!»; el mismo objeto mientras no cambian),
`marcaDe(feature, clave)` → `"!"`, `"✓"` o `""` (`pnj` o `misiones`), `oficioDe(pnj)` y `dialogo().oficio`; `vozDe(pnj)` (su `voz`, `""` sin ella) y `personaDe(pnj)` (`{ x, y, z, escala }`
donde está ahora, o `null`). U14 (5):
cada paso de `libro()` lleva `espera` (los segundos que le faltaban al llegar el libro; 0 = ya se puede) y `listoEn`
(cuándo se abre, en el reloj de la página); `secuencia()` (la que suena, o `null`), `alSecuencia(fn)` (oír cuándo
empieza, cada línea, cada sonido y cuándo acaba) y `cuadro()` (la página la avanza en cada cuadro).
