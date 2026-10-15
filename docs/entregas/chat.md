# Entrega J3 — chat cercano y de la zona, bocadillos y nombres sobre la cabeza (rama `wt/chat`)

Proyecto: numinia-engine · Para: quien junta las ramas (y Pablo) · De: Ursa (sesión Opus, agente «chat») ·
Fecha: 2026-10-15 · Estado: hecho en la rama, pendiente de juntar en `main`.

## Qué

Paridad con el chat de Hyperfy2 (y algo más): hablar a quien está cerca (20 m) con bocadillo sobre la cabeza, un canal
de toda la zona con su propio límite, los 50 últimos mensajes de la zona al entrar, nombres sobre las cabezas, órdenes
con `/` que llegan a las funciones y una caja de chat accesible en la plaza.

- **`features/chat/`** (función nueva, por el enchufe; ningún mensaje nuevo del núcleo):
  - `feature.ts`: intentos `decir` (cerca) y `decirZona` (zona), cada uno con su ritmo; eventos `dicho`, `zona`,
    `historial`, `nombre`, `aviso`, `orden`; todos los números de J3 como constantes.
  - `server.ts`: el servidor decide y limita. Cercano → `{ near, radius: 20 }`. Zona → toda la instancia (la zona es
    la instancia hasta M16), con límite por persona **y** para toda la zona; guarda los 50 últimos y los manda a quien
    entra. `/…` nunca se publica: evento `orden` con alcance `"server"`; `/ayuda` la contesta el chat; una orden que
    ninguna función atiende se le dice a quien la escribió. Nombres: cada página recibe los de quien dibuja (su área de
    interés) a menos de 24 m, los más cercanos primero (8 nuevos cada 0,5 s, 64 a la vez como mucho) y se le dice que los
    olvide pasados 30 m o cuando esa persona se va (el número de entidad se reutiliza).
  - `texto.ts`: limpieza del texto no fiable (una línea, sin caracteres de control C0/C1/DEL ni marcas de dirección
    bidi, espacios juntos, recortado, ≤ 200 bytes UTF-8 sin partir un carácter) y el cubo de ritmo de la zona.
  - `client.ts`: bocadillos y nombres por los ganchos de la vista, la conversación (30 líneas) que lee la caja o un
    agente, y `decir(texto, canal)`, que dice «demasiado largo» o «espera» antes de enviar (el servidor decide igual).
- **Enchufe (`packages/feature`), genérico y pequeño:** `api.listen(función, evento, fn)` (oír en el servidor un evento
  de otra función; devuelve `true` si lo atendió; cadenas de más de 4 se cortan; un oyente que falla no para nada),
  alcance `"server"` (ningún navegador lo recibe), `api.visible(entidad)` (a quién dibuja la página de ese jugador:
  el último snapshot), ganchos de vista `nameTag` y `bubble`, y `{ to }` sin recorrer la lista de jugadores.
- **Instancia:** cada conexión guarda lo que llevó su último snapshot (para `api.visible`). Tres líneas.
- **Render (`packages/render/src/nombres.ts`, nuevo):** placas de texto en lienzo que miran a la cámara (rotación del
  mundo, también en VR), que crecen con la distancia a partir de 8 m (hasta ×3) para seguir legibles; los 32 nombres
  más cercanos a menos de 24 m, nunca el tuyo; bocadillo blanco de 6 s, hasta 6 líneas, el último sustituye al
  anterior; las etiquetas de los gestos se ponen encima. **Un único ancla:** `view.setHeadTop((t, avatar) => y)`.
- **Plaza:** `apps/plaza/chat.ts` (caja: Enter abre, Enter envía y cierra, Escape cierra, «/» abre con la barra; lista de
  30 con `role="log"` y `aria-live="polite"`; botón «Cerca / Zona»; botón «Chat» en pantallas táctiles; solo
  `textContent`), `apps/plaza/escribiendo.ts` (escribir nunca mueve).
- **Pruebas:** `test/chat.test.ts` (13), `tools/e2e-piernas/chat.mjs` (17 comprobaciones), 8 límites en `limits.json`.
- **Docs:** `docs/EXTENDER.md` (sección J3), `docs/JUGADOR.md` (tres filas ✔), README de feature, instance y render.

### Ficheros compartidos tocados (para juntar)

| Fichero | Qué cambia |
|---|---|
| `packages/feature/src/index.ts` | `ServerHost.visible?`; `Scope` con `"server"` y `LISTEN_DEPTH`; `ServerApi.listen` y `visible`; en `ServerRuntime`: `listeners`, `depth`, `tell()`, dos líneas al principio de `recipients()`, `emit` codifica solo si hay destinatarios y suma los oyentes; `ViewHooks.nameTag?` y `bubble?` |
| `packages/instance/src/index.ts` | `Conn.visible`, `visible` en el host de funciones, `c.visible = visible` en `tick()` |
| `packages/render/src/index.ts` | importa `nombres.ts`; `const nombres = …` tras `meshOf`; las etiquetas en `nombres.above(t, m)`; `nombres.update(now)`; cinco métodos (`nameTag`, `bubble`, `setHeadTop`, `nameTags`, `bubbles`); `busy()` |
| `apps/plaza/main.ts` | 3 imports; ganchos `nameTag` y `bubble`; una línea en `announce` (el chat lo lee su lista); `escribiendo(e)` en las escuchas de acciones, movimiento y batería; `montarChat`; `__numinia.chat` y `cajaChat` |
| `apps/plaza/index.html` | CSS de `#chat`, la sección `#chat`, «Enter para hablar» en la ayuda |
| `apps/plaza/constructor.ts` | import y `escribiendo(e)` en su `keydown` |
| `apps/plaza/vite.config.mjs` | claves del proxy LAN `/e/` y `/a/` (ver decisión 11) |
| `features/servidor.ts`, `features/cliente.ts` | una línea cada uno |
| `limits.json` | 8 entradas tras `feature_event_reach_default` |

## Decisiones

1. **Función, no mensaje del núcleo** (marca para `docs/SABER.md`). El BACKLOG pedía «mensaje nuevo CHAT»; el enchufe
   ya trae intentos con esquema, límite por intento y alcance por cercanía. Lo que faltaba se añadió al enchufe de forma
   genérica (`listen`, `"server"`, `visible`), útil para H3 (órdenes), P5 (habitante IA) y cualquier función.
2. **Alcances.** Cercano 20 m (BACKLOG). Nombres 24 m: algo más que el chat, para que quien te habla ya tenga nombre, y
   solo de quien tu página dibuja (área de interés, K = 50); se olvidan a 30 m (×1,25, como J9).
3. **Límites** (marca para `docs/SABER.md`). Cercano 1/s, ráfaga 3 (como los gestos). Zona: 1 cada 5 s y ráfaga 2 por
   persona, y además 2/s y ráfaga 6 para la zona entera: lo que cada página recibe del canal de la zona queda acotado
   (≤ 2 × ~240 B/s ≈ 4 kbit/s) aunque haya 1.000 personas. Nunca O(N²). A quien se le corta, se le dice por qué.
4. **La zona es la instancia** hasta que M16 traiga zonas (como `objetos`). Historial de 50 en memoria: se pierde al
   reiniciar (Hyperfy igual).
5. **Órdenes.** `/algo` va a `listen("chat", "orden", m => …)` con `m.texto` sin la barra y `m.quien`; ninguna página
   lo recibe, ni la de quien lo escribe (un `/admin <código>` no se filtra). H3 solo tiene que escuchar y devolver `true`.
6. **Nombres** = los de la identidad (I1). Sin identidad tras 1 s = «Robot N» (los robots de medida; una persona se
   identifica antes). Tu nombre no se dibuja sobre ti.
7. **Lectores de pantalla.** La ruta del chat es la lista (`role="log"`, educada); sus anuncios no van también a
   `#avisos` (se oirían dos veces). El historial se ve pero no se lee línea a línea. Las declaraciones siguen diciendo
   la verdad: `dicho`, `zona`, `historial` (importancia 0) y `aviso` tienen anuncio (agentes y la voz V3 los leen);
   `nombre` y `orden` son `silent`.
8. **Texto no fiable.** Se limpia en el servidor; en la página solo `textContent` y `fillText`. `listen` documenta la
   regla STD-050: el chat nunca entra en las instrucciones de un agente (P5 lo llevará en su bloque `<material>`).
9. **La página tiene su copia del ritmo** para decir «espera» al momento; el servidor tiene el suyo y es el que manda.
10. **Escribir nunca mueve.** `escribiendo(e)` en todo `keydown` global; los `keyup` borran siempre (si no, una tecla
    soltada dentro de la caja se quedaría pulsada). **Las escuchas que añadan otras ramas (cámara, constructor, salto,
    avatares) tienen que usarlo también.** Enter sobre un botón con foco pulsa ese botón, no abre el chat.
11. **Proxy LAN de vite.** Las claves `/e` y `/a` son prefijos: se tragaban `/escribiendo.ts` y el e2e https fallaba.
    Ahora `/e/` y `/a/`. **Ojo, avatares y demás:** cualquier módulo de `apps/plaza/` que empiece por «a» o «e» rompía
    el https antes de este arreglo.
12. **Tamaños.** Letra de ~0,17 m en nombres y bocadillos (~1° a 10 m); desde 8 m las placas crecen con la distancia
    (×3 como mucho) para ocupar lo mismo en pantalla. En VR (Quest 3, ~20 px por grado) debería leerse: estimado, sin
    aparato.

## Números (de esta ejecución, PC de desarrollo compartido con otros cinco agentes)

- `npm test`: **105 pruebas** (92 + 13 de chat), todas bien.
- `npm run gates` (en cada commit): unitarias 105 bien / 0 mal · capas 0 · determinismo `e398ea35 = e398ea35` ·
  **ancho de banda K=50: 25,0 kbit/s** · plaza de 1.000: p99 7,8–11,0 ms (≤ 25).
- Ancho de banda **con** chat (prueba propia, K=50, 50 robots, 30 s simulados, nombres + una línea de 60 B por persona
  cada 10 s): **25,0 → 27,0 kbit/s (+1,9)**.
- Nombres con 1.000 personas entrando a la vez, 50 visibles cada una: 48.420 mensajes (866 B por persona) en 3,5 s;
  tick del chat p50 1,7–1,9 ms, p99 3,7 ms (6,7 con la máquina a carga 15); con todos quietos, p50 0,11 ms.
- e2e (`tools/auto.sh e2e` con puertos 8806/5186/5196, núcleos 24-27), cuatro pasadas con la máquina a carga 11-16:
  1. chromium OK · firefox OK · AR OK · VR OK · chat OK · https FALLA: la página no cargaba `/escribiendo.ts` (el proxy
     LAN se lo tragaba, decisión 11) → arreglado; la pierna https sola, después: OK.
  2. chromium OK · firefox OK · AR OK · VR OK · chat OK · https FALLA solo en el paso de andar (`movedZ` −3,2; pide
     < −3,5): el fallo conocido de `tools/e2e.mjs` con GL por software y la máquina cargada (pierde ticks).
  3. chromium FALLA solo en el mismo paso de andar (−3,0) · firefox OK · AR OK · VR OK · chat OK · https OK.
  4. chromium FALLA solo en el paso de andar (−3,39) · firefox OK (−6) · AR OK · VR OK · chat OK · https OK (−5).
  En todas: gestos, objetos, sesiones, correcciones 0 y cero errores de página. Ninguna pasada salió entera en verde
  por ese paso de andar. **No es de esta rama:** la pierna chromium contra `main` de partida (55b0b3a, exportado con
  `git archive`) y contra esta rama, alternando, 7 veces cada una con la máquina a carga 7-16: partida −5,19 −5,0 −5,2
  −4,39 −5,2 **−3,39** −4,61; rama −4,8 **−3,2** −4,2 −5,0 **−3,2** −4,59 −5,2. Las dos caen bajo −3,5 cuando la carga
  pasa de ~15 (GL por software pierde cuadros y la página pierde ticks, como ya avisa `tools/e2e.mjs`).
- e2e chat (17 de 17): dos invitados distintos; B anduvo hasta 12,5 m de A; B dibuja «Invitado 6IGN» sobre A; Enter
  abre la caja con el foco; «hola» + Enter envía y cierra; B ve el bocadillo «hola» y «Invitado 6IGN: hola» en su lista,
  A ve «Tú: hola»; la lista es `role=log` + `aria-live=polite`; escribir «wasd WASD» y mantener W 0,9 s dentro de la
  caja: A se mueve 0,000 m; Escape cierra y vacía; 150 «ñ» (300 bytes): «Demasiado largo: 300 de 200 bytes» y el texto
  se queda; cinco Enter seguidos: pasan 3 y sale «Vas muy deprisa»; 10 directos al cable: el servidor deja pasar 3; la
  zona llega a B y una pestaña nueva la recibe como historial; `/ayuda` solo le contesta a A; con la caja cerrada, W
  mueve a A 2,2 m.

## Sin comprobar

- Una pasada de `tools/auto.sh e2e` entera en verde: con la máquina cargada siempre cayó una pierna en el paso de andar
  (arriba: pasa igual sin esta rama). Repetirla con la máquina tranquila al juntar.
- Lectores de pantalla de verdad (NVDA, VoiceOver, TalkBack) con la lista `role=log`: solo el marcado está comprobado.
- Móvil de verdad (botón «Chat», teclado virtual, `enterkeyhint="send"`) y gafas de verdad (legibilidad; en VR no hay
  forma de escribir todavía: se lee, no se escribe).
- El coste de las placas en un móvil (una llamada de dibujo por nombre visible, 32 como mucho, más los bocadillos).
- Una multitud que habla a la vez: cada página recibe hasta (personas a 20 m) × 1 mensaje/s; no hay tope por oyente.

## Lo que falta (para otra fila)

- Tope por oyente del chat cercano en multitudes; en una multitud apretada, cambiar el nombre más lejano por uno más
  cercano (hoy quedan los 64 primeros).
- Escribir en VR (teclado del sistema o dictado) y revisar los bocadillos en las gafas (X1).
- H3: `/nombre` (el chat ya reenvía el nombre cuando cambia la identidad: falta que el núcleo avise del cambio),
  `/chat borrar`, roles. Silenciar a alguien (F1).
- Fichas de persona (V4/V5): `chat.nombres` (entidad → nombre de quien tienes cerca) ya está en la página.
- Guardar el historial de la zona (`store`) si Pablo lo quiere.

## Para el BACKLOG

- **J3 → hecho** (si al juntar el e2e sigue en verde).
- Filas nuevas propuestas: «J3b — chat en multitud: tope por oyente y nombres más cercanos primero» (`pendiente | sí`)
  y «J3c — escribir en VR (teclado del sistema / dictado)» (junto a J6, con X1).
- Para `docs/SABER.md`: decisiones 1, 3, 10 y 11.

## Dependencias nuevas

Ninguna.
