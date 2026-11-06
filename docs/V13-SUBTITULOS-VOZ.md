# V13 · Subtítulos de voz: quién habla, desde dónde y qué dice

Pautas de diseño para construir V13 (`docs/BACKLOG.md`, fila V13) sin decidir diseño al construirlo.
Autora: Galatea (diseño y UX), 2026-10-30 18:10 UTC. Para: doulos (la tarea de construir, MIS-209).
Maqueta que se puede abrir: `docs/diseno/v13-subtitulos-voz.html` (`?estado=2`, `?movil=1`, `?alto=1`, `?grande=1`).
Capturas (el repositorio no guarda PNG): se rehacen abriendo la maqueta a 1280 × 720 (`?` y `?estado=2&alto=1&grande=1`) y
a 390 × 844 (`?movil=1&estado=2`); van adjuntas al PR y a la tarea.

Parte de lo que ya existe: el tope de 8 voces por oyente y el modo escenario (M17, D-024, PR #294 todavía sin
fusionar: `elegirVoces`, `VOZ_TOPE`, `VOZ_ESCENARIO`), el bus `voz-gente` con su control «Voz de las personas»
(`apps/plaza/voz.ts`), el silenciar y el bloqueo personal (F1a), los ajustes «Texto grande», «Alto contraste» y
«Menos movimiento» y los colores del sistema de diseño (`apps/plaza/tema.css`).

**Qué es una decisión y qué no.** Todo lo de §1–§7 está decidido: se construye así. §8 recoge lo que NO decide este
documento (y quién lo decide). Lo marcado *sin probar* no lo he podido ver funcionando.

## 1. La regla de oro: subtitulas lo que oyes, y nada más

Un oyente recibe el texto de **exactamente las mismas voces que oye**: las que `elegirVoces` le da (las 8 más
cercanas que han hablado en el último segundo, dentro de 30 m) más las del escenario. Quien está fuera del tope no
se oye y no se subtitula. Quien está silenciado (por ti o por moderación) no se oye y **no aparece en ningún sitio**:
ni caja, ni historial, ni lector. Así nunca se ve algo que no se oye ni se oye algo que no se ve, y los subtítulos no
abren una puerta para saltarse un silencio.

Al revés no: bajar a 0 «Voz de las personas» o el volumen general **no** quita los subtítulos. Esa es justo la
persona que los necesita.

## 2. Dónde y cómo se ven

Es HTML de verdad (no un dibujo en el lienzo): lo lee el lector de pantalla, crece con «Tamaño de la interfaz» y
sigue al tema del mundo. Una columna de cajas, centrada abajo, `pointer-events: none` (no tapa ningún clic).

| | Escritorio | Móvil vertical | Móvil horizontal |
|---|---|---|---|
| Ancho | `min(42ch + 32px, 100vw − 24px)` | `100vw − 24px − márgenes seguros` | `min(34ch + 32px, 46vw)` |
| Borde inferior de la columna | 96 px sobre el borde | `var(--sb) + 246px` (encima del chat, el joystick y «Acción») | `var(--sb) + 10px + alto del chat + 8px` |
| Letra del texto | 18 px | 16 px | 16 px |
| Letra con «Texto grande» | 24 px, ancho 32ch | 20 px, ancho 28ch | 20 px |
| Cajas a la vez | 3 | 2 | 2 |

- **Regla de choque (manda sobre la tabla):** la columna nunca se monta encima de `#chat`, `#accion`, `#joy-fantasma`,
  `#dialogo`, `#interactuar` ni `#hoja-msg`. Si una de esas está abierta y sube más que la columna, la columna se
  apoya encima de ella (8 px de aire). La e2e lo comprueba con los rectángulos (§9).
- **Caja:** fondo `--sub-caja` = `rgba(20,17,15,.88)` (el fondo nocturno de la casa casi opaco), radio 8 px (el de los
  marcos), relleno 6 px 12 px 8 px, borde izquierdo de 4 px (§4). Sin desenfoque (calienta el móvil) y sin sombra.
- **Línea de 1,35; dos líneas de texto como mucho** por caja. Lo nuevo empuja lo viejo hacia arriba (se ven las dos
  últimas líneas). Con «Menos movimiento» el cambio es seco; sin él, tampoco se anima el texto (solo aparece).
- **Valores nuevos y su dueña** (Galatea): `--sub-caja`, `--sub-letra`, `--sub-ancho`, `--sub-abajo`. Razón: no hay en
  el sistema de diseño un token para texto encima de una escena 3D que cambia; el resto son tokens de la casa.

**Contraste medido** (cálculo WCAG con la caja al 88 % encima de un fondo blanco, el peor caso, `cielo blanco` en la
maqueta): texto `#F9EBDC` 11,6 : 1; nombre `#A6DAD5` 8,8 : 1; segundo color `#C4B5A6` 6,8 : 1; ámbar 6,5 : 1. Todo
pasa AA y el texto pasa AAA. Con «Alto contraste»: caja `#000` opaca, todo en `#FFF` (21 : 1) y borde blanco de 2 px.

## 3. Cómo se distingue el nombre del texto (sin color)

Cada caja tiene una **línea de cabecera** y debajo el texto. La cabecera lleva, en este orden: la flecha (§4), el
**nombre** en peso 600 y al 78 % del tamaño del texto (nunca menos de 13 px), la marca `escrito` si es texto que habla
(§6) y, empujada a la derecha, la palabra de dirección y distancia. El nombre va en verdemar, pero eso es el cuarto
indicio, no el único: va **en su propia línea, más pequeño y en negrita**. En alto contraste el nombre es blanco y se
distingue igual.

- El nombre es el mismo que ve la lista «Gente» para esa entidad, cortado a 24 caracteres con «…».
- Si la misma persona sigue hablando, sigue en su caja: no se repite el nombre.

## 4. Desde dónde habla (sin depender del color ni del sonido)

Tres indicios a la vez, ninguno de color:

1. **Flecha** (un icono SVG, 1,1 em) que apunta hacia la persona, relativa a hacia dónde miras: 8 sectores de 45°
   (delante, delante a la derecha, derecha, detrás a la derecha, detrás, …). Se calcula solo con el giro horizontal
   (cámara y posición del que habla en el plano), a 4 veces por segundo como mucho, nunca por cuadro; cambia de sector
   solo cuando el ángulo pasa 8° la frontera (que no tiemble). Se gira a saltos: nunca se anima el giro.
2. **Palabra** a la derecha de la cabecera, en el segundo color: `delante`, `delante dcha.`, `derecha`,
   `detrás dcha.`, `detrás`, `detrás izq.`, `izquierda`, `delante izq.`.
3. **El lector** dice la dirección entera: «a tu izquierda», «detrás de ti a la derecha»… (§7).

**Si la ves, no hay flecha ni palabra**: cuando la persona cae dentro del campo de visión horizontal de la cámara
menos 5° a cada lado, la cabecera es solo el nombre, y su avatar lleva el rótulo «habla» que ya existe (así se une el
nombre con el cuerpo). No se comprueba si algo la tapa (cuesta y no aporta).

**Escenario** (M17): no tiene dirección (suena igual en todas partes). En lugar de la flecha, un icono de altavoz y la
palabra `escenario`; su caja va siempre la primera, arriba de la columna, y su borde izquierdo es ámbar. El icono y la
palabra son los indicios; el ámbar es un extra.

## 5. Estados

| Estado | Qué se ve | Qué no cambia |
|---|---|---|
| **Cerca** (≤ 15 m, la mitad de `VOZ_RADIO_M`) | caja normal, borde izquierdo continuo | — |
| **Lejos** (> 15 m hasta 30 m; histéresis de 1 m) | la palabra `· lejos` tras la dirección y el borde izquierdo discontinuo | el texto, a pleno contraste y mismo tamaño: lejos se oye menos, pero se lee igual |
| **Habla y aún no hay texto**, o no hay transcripción (servicio apagado o sin cuota) | caja con el nombre, la dirección y `[habla · sin subtítulos]` en el segundo color; nace de la actividad de voz que ya mide `voz.ts` (`nivelBoca > HABLANDO`) | así una persona sorda sabe que alguien le habla y desde dónde, aunque no haya texto |
| **Texto provisional** (el reconocedor aún puede cambiar palabras) | las palabras provisionales en el segundo color; en alto contraste, subrayado punteado | el lector no lo lee hasta que es definitivo |
| **Varios a la vez** | una caja por persona, hasta 3 (escritorio) o 2 (móvil, gafas). El escenario siempre arriba; las demás por orden de llegada, la más reciente abajo, junto a la vista | — |
| **Más de las que caben** | sale la caja cuya última palabra es más vieja; nunca una que lleva menos de 1,5 s en pantalla (si todas son más nuevas, la nueva espera ese rato); lo que no cabe va al historial (§7) | — |
| **Se calla** | la caja se queda `clamp(caracteres / 15, 3, 8)` segundos después de la última palabra (unos 15 caracteres por segundo de lectura), luego se va (200 ms de opacidad; con «Menos movimiento», de golpe) | — |
| **Silenciada por ti o bloqueada** (F1a), **silenciada por moderación**, **micrófono apagado** | nada: ni caja, ni historial, ni lector | — |
| **Fuera del tope de 8** | nada (no la oyes) | — |
| **Tu volumen de voz a 0** | los subtítulos siguen | — |
| **Pestaña oculta** | no se pinta nada; al volver no se repite lo perdido en la columna (está en el historial) | — |
| **Tú hablas** | tu voz no sale en tu columna. Junto al botón del micrófono, una insignia `CC` (con su texto para el lector «Alguien cerca lee subtítulos de tu voz») mientras al menos un oyente que te oye tiene los subtítulos puestos | — |

## 6. Texto que habla (para quien no puede hablar)

- **Dónde se escribe:** en la caja del chat que ya existe. Un botón conmutador al lado de «Enviar», `Decir en voz alta`
  (icono de altavoz, `aria-pressed`, 44 × 44 px en táctil). Encendido, Enter manda la frase **dicha** en vez de al chat;
  apagado, todo es como hoy. Sin tecla nueva: se llega con el teclado como a cualquier botón del chat, y un agente usa
  el mismo camino. El conmutador se recuerda en el aparato.
- **Quién la recibe:** los mismos oyentes que oirían tu voz (§1: `elegirVoces`, tope y escenario incluidos; si estás
  silenciado, nadie). Mismo largo máximo y mismo freno de envíos que el chat.
- **Cómo se ve:** igual que una voz, con la marca `escrito` (un recuadro con el texto, no solo un color) junto al
  nombre: nadie debe creer que es la voz real de la persona. Nunca provisional: llega entera.
- **Cómo suena:** una voz sintética genérica en el idioma del oyente, nunca una voz que imite a una persona real.
  Debe sonar **desde la persona** (pasa por su panner y por el bus `voz-gente`, obedece «Voz de las personas»,
  «Sonido mono», el silenciar y el tope). Ver §8.1: hoy el navegador no deja hacerlo con `speechSynthesis`.
- **Tú, al mandarla:** tu frase sale en tu chat como «Tú (dicho en voz alta): …», para que sepas que salió.

## 7. Lector de pantalla e historial

- Una sola región oculta `#subtitulos-lector`, `role="log"`, `aria-live="polite"`, `aria-relevant="additions"`. Solo
  se escribe en ella **el texto definitivo** (nunca lo provisional), con esta forma:
  `Ana: texto.` · `Leo, escrito, a tu izquierda: texto.` · `Marta, detrás de ti a la izquierda, lejos: habla.` ·
  `Christian, en el escenario: texto.` La dirección va solo si está fuera de la vista.
- Si una persona dice dos frases con menos de 1 s entre ellas, se leen juntas. Si hay más de 3 frases esperando, se
  dice «y N frases más en el historial» y no se leen las demás.
- La columna visible es `aria-hidden="true"` (lo que se lee es la región de arriba: no se lee dos veces).
- **Historial:** cada frase definitiva entra en la lista del chat como una línea de voz (icono de micrófono +
  nombre + texto), para poder releer lo que pasó. Solo con los subtítulos encendidos.

## 8. Lo que este documento no decide (y quién)

1. **Cómo suena el texto que habla desde la persona.** `speechSynthesis` no sale por Web Audio: no se puede panear,
   ni pasar por el bus `voz-gente`, ni silenciar por persona dentro del mezclador. Dos caminos: (a) el servidor
   convierte el texto en voz y lo manda como tramas de voz normales de esa entidad (todo funciona solo: tope, panner,
   silenciar; cuesta dinero y un proveedor); (b) cada oyente lo dice con `speechSynthesis`, sin panear, a volumen
   «Voz de las personas» × general, y la dirección la dan solo los subtítulos. **Pablo decide (a)**: coste y
   proveedor. **Mientras tanto se construye (b)**, que no cuesta nada. Además, V2 aún no sabe si `speechSynthesis`
   habla dentro de una sesión de gafas: *sin probar*.
2. **La transcripción de la voz** (quién la hace, en qué servidor, cuánto cuesta: ~0,7–1,7 céntimos por minuto de quien
   habla, `docs/BACKLOG.md` V13). Decide Pablo. Mientras no haya, cada voz sale como `[habla · sin subtítulos]` (§5).
3. **En gafas** (*sin probar*, esbozo): un panel en el mundo a 1,5 m delante y 0,3 m por debajo de los ojos, 0,9 m de
   ancho, letra de al menos 3,2 cm de alto de mayúscula; 2 cajas; sigue a la cabeza solo cuando el giro pasa 30°
   durante 0,5 s (con «Menos movimiento», salta sin deslizarse). Construir cuando existan los ajustes en VR (N3).

## 9. Ajuste, voces de la función y cómo se comprueba

- **Ajuste nuevo** en Accesibilidad: `subtitulosVoz`, booleano, apagado por defecto. Nombre «Subtítulos de voz».
  Descripción: «Muestra lo que dice la gente que oyes, con su nombre y desde dónde habla. Quien habla verá que alguien
  lee sus palabras.» Va con los demás ajustes del aparato (y con la persona cuando llegue V8). Se lee antes del primer
  cuadro. Tamaño y contraste vienen de «Texto grande», «Alto contraste» y «Tamaño de la interfaz»: no hay ajustes
  propios de tamaño.
- **Orden de construcción** (cada trozo cabe en un PR):
  1. Columna + cabecera + dirección + estados con `[habla · sin subtítulos]` desde la actividad de voz, el ajuste, la
     región del lector y la insignia `CC`. Sin servidor nuevo salvo avisar al que habla de que alguien lee.
  2. Texto que habla por la caja del chat, con el camino (b) de §8.1. Esto ya cumple «una frase de A sale subtitulada
     en B con el nombre; el lector la anuncia» con una frase escrita.
  3. La transcripción de la voz hablada, cuando Pablo decida §8.2.
- **e2e (dos páginas, A y B):** A dice una frase escrita → en B aparece una caja con el nombre de A y la frase, y
  `#subtitulos-lector` la contiene; con B mirando hacia otro lado, la cabecera lleva flecha y palabra y la región dice
  la dirección; B silencia a A → nada nuevo en la columna, el historial ni la región; «Voz de las personas» a 0 → la
  caja sigue saliendo; con «Texto grande» la letra es 24 px; los rectángulos de la columna no cortan los de `#chat`,
  `#accion`, `#joy-fantasma`, `#dialogo` ni `#interactuar` (escritorio, 390 × 844 y 844 × 390).
- **Pruebas puras:** el sector de la flecha (los 8 sectores, la histéresis de 8°, «a la vista»), cerca/lejos con
  histéresis, quién sale cuando hay más cajas que sitio y el tiempo de permanencia.
- **Prueba con lector** (a mano, no es puerta): NVDA + Firefox y VoiceOver + Safari leen la frase con el nombre.
