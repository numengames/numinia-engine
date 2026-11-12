# Pesca (v2): un minijuego que decide el servidor

`features/pesca` es el ejemplo de **minijuego con tiempo**: el servidor lleva el ciclo entero en `api.onTick` (20 Hz) y la
página solo pide tres cosas (`lanzar { sitio }`, `recoger { activo }`, `soltar`) y anima lo que le cuentan.
- **Sitio de pesca** = una cosa del mundo (`state` con `at`, ficha `lugar`, `interact: { intent: "lanzar", prompt: "pescar",
  radius: "radio" }`): «E: pescar» al lado del agua. Por defecto uno («Estanque de la plaza», x 18, z −14, radio 4,
  `SITIOS_DEFECTO` en `server.ts`); un mundo trae los suyos en `MUNDO_DIR/pesca.json` (`{ "sitios": [{ id, nombre, x, y, z,
  radio }] }`, leído en `features/mundo.ts`). Un pescador por sitio (`ocupado`).
- **Que la caña se vea** (MIS-221, 26-10): la caña vive en un soporte junto al pantalán del sitio, y el sitio es lo que trae el mundo. Si el mundo no
  trae `pesca.json`, hereda el estanque de la casa (x 18, z −14), que en un mundo con otro plano cae fuera de vista (en la Torre, a ~43 m de la
  aparición, detrás de los muros: de ahí el «no veo la caña» del vídeo del 17-10). Un mundo que quiera pescar pone en `pesca.json` un sitio **a la vista
  de la aparición**, con el estanque (radio) y el pantalán fuera de sus sólidos. Comprobado 26-10 con la Torre (sitio «Estanque del vestíbulo», x 5,4 z 20,6
  radio 2): desde la aparición se ven el pantalán, el soporte con la caña y el estanque. En VR el soporte se coge con el agarre; el rayo solo se posa en lo
  que está al alcance (lote 5). No verificado: pescar entero con las gafas (lanzar, recoger); el 17-10 `vr.ts`, `manos.ts` y `xr.ts` no nombraban la pesca y aquí no se ha probado con un casco.
- **Ciclo** (números en `feature.ts`, de bridge-mind/tideline, MIT): espera 3–12 s → quizá un `mordisqueo` al 45 % → `picada`
  con ventana 1,2 s (× rareza) → `recoger { activo: true }` a tiempo engancha → `pelea`: recogiendo sube la tensión (+26 %/s ×
  fuerza) y el progreso (+13,5 %/s ÷ peso); descansando bajan (−21, −5,5 × fuerza); arrancadas avisadas 0,75 s antes
  (`tension.arrancada`: no | aviso | si); tensión 100 = `escape rota`, progreso 0 = `escapa`, 55 s = `agotado`, alejarse =
  `lejos`; progreso 100 = `captura { pez, cm, rareza, total }` («Has pescado: Carpa de 23,1 cm.», sonido `exito`).
  El estado de la pelea llega a 10 Hz solo al pescador (`tension`). Quien está a 40 m ve el flotador (`lanzado` / `fin`).
- **Peces**: `features/pesca/peces.json` (1–3 entradas; talla con `azar^1,8`, la fuerza crece con la talla). **Un mundo trae los
  suyos** en `MUNDO_DIR/pesca.json`, clave `peces` (opcional): **sustituyen** la tabla de la casa en ese mundo; sin `peces`
  todo sigue como antes. Cada pez: `id` (1–32, minúsculas, cifras y guion; único), `nombre` (≤ 32 caracteres y ≤ 40 bytes: lo
  que lee quien lo pesca), `rareza` (`comun`, `rara`, `legendaria`), `peso` (0,01–1000; más = más común), `cm` (`[mín, máx]`,
  1–500) y, si se quiere, `color` (`"#RRGGBB"`: el cuerpo del pez en la mano y un punto junto al nombre en «¡Pescado!») más los
  números de la pelea (`fuerza` 0,1–2,5 · `heft` 0,2–4 · `aguante` 3–50 s · `arrancadas` `[mín, máx]` s); lo que no diga lo toma
  del pez de la casa de su rareza (Carpa, Trucha, Lucio). Hasta 40 peces. Se lee **estricto** (`leerPeces` en
  `features/pesca/esquema.ts`, como `naturaleza.json`): una clave desconocida —también a nivel del fichero, que con `peces` solo
  admite `schema`, `sitios`, `peces` y `notas` (un texto para quien edite; no se lee)—, un valor fuera de rango, un nombre largo, un id repetido o una lista vacía hacen que **no
  se use el `pesca.json` entero** (el mundo se queda con el estanque y los peces de la casa) y el servidor lo cuenta en el log con
  la ruta de cada fallo (`[mundo] pesca.json no se usa …: pesca.peces[2].nombre: como mucho 32 caracteres`). Con `peces` y sin
  `sitios` vale el estanque de la casa. Para probarlo basta ese fichero: ningún código. `captura` y `fin` llevan el `color`
  (`""` = pez de la casa, la página usa el suyo). Ejemplo:
  `{ "schema": "numinia-engine/pesca@1", "sitios": [{ "id": "lago", "nombre": "Lago", "x": 10, "z": 0, "radio": 4 }], "peces": [{ "id": "pez-merlin", "nombre": "Pez Merlín", "rareza": "comun", "peso": 6, "cm": [30, 50], "color": "#3758E9" }] }`. Azar con el
  PRNG del motor (`rngNext`, estado propio de la función, semilla mezclada con el tick del lanzamiento: reproducible, nunca
  `Math.random`). Lo pescado se guarda por invitado en el almacén (`c:<id>`: cuántos y el mayor) y vuelve como `cesta`.
- **Página**: `features/pesca/client.ts` da el controlador (`window.__numinia.pesca`: `estado()`, `sitios()`, `flotadores()`,
  `capturas()`, `lanzar`, `recoger(activo)`, `pulsar`, `soltar`, `alCambiar`); nada más va en el arranque. Con el primer sitio
  llegan, perezosos, `apps/plaza/pesca.ts` (HUD: botón grande «Recoger» —mantener = recoger, soltar = descansar—, «Soltar»,
  barras de tensión y progreso, F / X en teclado, `navigator.vibrate` en picada, arrancada y captura; al acabar, 4 s de panel
  «¡Pescado!» —pez, cm, rareza, «En tu cesta: N», dos notas de Web Audio al volumen de efectos, vibración larga— o «Se ha
  escapado» con el motivo) y `packages/render/src/pesca.ts` (3D, `view.pesca`).
- **Sitio que se ve** (v2, `packages/render/src/pesca.ts`, 7 draw calls por sitio): estanque de radio `radio × 0,85` con
  **agua de un solo draw call** (el agua estilizada del motor, `agua-estilo.ts`, ver «Agua» más abajo, con dos anillos de
  ondas pálidos —uniformes `vec4(x, z, t0, fuerza)`— al caer el flotador, al mordisqueo, a la picada, en cada arrancada y al saltar el
  pez; sin render-target de reflexión: vale en móvil), orilla de tierra (lathe), 14 piedras y 3 matas de juncos (geometrías
  fundidas, azar determinista), **pantalán de tablas** hacia el centro de la plaza (`trazaDeSitio`: dirección sitio → origen;
  `view.pesca.sitio(id).pantalan` = dónde ponerse, dentro del radio) y cartel «Pesca» (lienzo). Caña, sedal y flotador como
  en v1, pero la caña sale de la **mano derecha del avatar** (`avatares.mano`, hueso `rightHand` del VRM; cápsula = al lado)
  y el cuerpo **mira al agua** mientras pesca (`avatares.orientar`, solo quieto).
- **El pez sale y va a la mano** (v2): `fin` lleva `pez, cm, rareza` a quien está a 40 m; el cliente guarda la captura
  (`capturas()`, `EN_MANO_MS` = 7 s, `olvidar`) y etiqueta al pescador «🐟 Carpa · 23,1 cm»; el 3D hace un pez low-poly
  (`geometriaDePez`: cuerpo, vientre, cola, aleta dorsal, pectorales, ojos; colores por especie Carpa / Trucha / Lucio;
  1 draw call; escala = cm / 100) que salta del flotador en arco hasta la mano (`SALTO_MS` 1,3 s) y cuelga de ella, cabeza
  arriba, hasta que pasan los 7 s o el pescador anda más de `PASO_SUELTA_M` (0,6 m). Lo ven todos los cercanos.
- **Pruebas**: `test/pesca-peces-mundo.test.ts` (los peces del mundo: lector estricto, sustituyen la tabla, nombre y color hasta la página, sin `peces` nada cambia, uno malo rechaza el fichero), `test/pesca.test.ts` (sin pantalla: la picada cae en el rango, fuera de ventana se escapa, la tensión sube y baja,
  un pescador sensato captura en 8–25 s, nadie captura sin picada, la simulación no se entera) y la pierna
  `tools/e2e-piernas/pesca.mjs` (navegador real: andar al pantalán, «E: pescar», HUD, chunk 3D, picada, pelea con F, captura,
  panel «¡Pescado!», pez en la mano en A y en B —otro invitado a 10 m—, la mano se vacía sola; B nunca recibe las fases de A).
- **En todas partes (N4)**: el mismo minijuego con cada entrada; todo sigue pasando por el controlador (el servidor decide).
  - **Móvil**: tocar «Pescar», mantener «Recoger». El HUD deja libre la columna de botones de la derecha («Saltar»…;
    `hacerSitio()` mide `#acciones`), con el botón grande ≥ 48 px.
  - **Mando en PC** (`apps/plaza/pesca-vr.ts`, mando estándar): A en el aviso «pescar» lanza; A o RT mantenidos
    recogen; B suelta. La pista del HUD cambia a «Mantén A (o RT)…» cuando hay un mando conectado.
  - **VR**: cada pantalán tiene una **caña en un soporte** (poste + tubo, 2 draw calls). La mano (mando o mano seguida)
    junto al mango la ilumina; con el agarre (o un pellizco) la coges y queda en tu mano real (`view.manos.ancla`).
    **Lanzar** = un golpe de muñeca hacia delante (hacia donde miras); **tirón** = levantar la caña de golpe (engancha en
    la picada; en la pelea da un tirón); el gatillo (o mantener el pellizco) recoge. Los gestos están en
    `features/pesca/gestos.ts`, que es puro: mide la velocidad de un punto de la caña a 1 m de la mano dentro de una
    ventana de 140 ms y exige además 0,3 m de recorrido, así que un pellizco o un salto de las articulaciones no cuenta
    como lance. Sigue funcionando igual con la tasa de cuadros de cualquier visor. La caña **vibra**: un toque cuando
    mordisquean, un golpe fuerte en la picada, un aviso antes de la arrancada, y en la pelea un zumbido que crece con
    la tensión. Encima de la caña hay un **medidor** (lienzo) con la misma frase que el HUD (`consejo()` en
    `client.ts`: «¡Afloja, que se rompe el sedal!»…) y las barras de tensión y pez; el sedal propio se pone rojo
    cuando va a romperse. Para devolver la caña: otra vez el agarre, o pellizcar junto al soporte; también vuelve
    sola si te alejas más de 6 m. La mano que tiene la caña, o que está en el mango, no apunta con el rayo ni «usa»
    cosas (`manos.reglas({ ocupada })`), para que el pellizco con el que coges la caña no lance desde el aviso.
    Si alguien pesca en ese sitio, el soporte se ve vacío.
  - **Pruebas**: `test/pesca-gestos.test.ts` y la pierna `tools/e2e-piernas/pesca-todas.mjs`. La pierna hace tres
    pasadas: móvil 390×844 táctil (tocar, un toque real mantenido, encaje del HUD), PC con un mando emulado y VR con IWER
    (soporte, agarre, lance, tirón, pelea con gatillo, vibración, medidor, devolver; luego con manos seguidas: pellizco
    para coger, lance y pellizco para devolver).
- **Después (v3)**: pantalán sólido (que el avatar suba a las tablas: hoy son un suelo a ras), mochila/cesta visible,
  sedal verlet (river-morning `Rope.ts`, MIT), varios sitios y tablas por hora/clima, sombras de peces,
  cebos y cañas, ficha de colección, paso de misión `pesca`, predicción local de la tensión, AR/VR.
