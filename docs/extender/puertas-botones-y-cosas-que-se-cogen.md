# Puertas, botones y cosas que se cogen (J4, v1): tres piezas del motor que decide el servidor

Tres módulos de juego, cada uno en su carpeta (`features/puertas`, `features/botones`, `features/cogibles`), por el
enchufe de siempre: **nadie decide nada en su página**; la página pide (`usar`, `pulsar`, `coger`, `soltar`) y el
servidor comprueba que estás a su alcance (`api.within`), cambia el estado compartido y avisa a quien está cerca
(`CERCA_M = 30`). Son **el mismo gesto en los tres aparatos**: en el ordenador «E: abrir Puerta norte», en el móvil el
botón de acción, en el visor el rayo y el gatillo; para un agente, `features.use(<función>, <clave>)`. Lo dibuja el
bloque de la casa (`features/objetos/biblioteca.json`, CC0) escalado: la hoja de la puerta, la tapa del botón sobre su
poste, la caja en el suelo.

- **Puertas** (`puertas@1`): estado por puerta (`nombre, x, y, z, ry, ancho, alto, radio, abierta, cierraEn, aviso`);
  intención `usar {puerta}` (abre si está cerrada, cierra si está abierta; 2/s, ráfaga 4); evento `cambio` (quién, cuál,
  cómo queda, frase; `quien = 0` si se cerró sola o la abrió un botón) y `rechazado`. `cierraEn` (0-120 s) la cierra sola:
  lo cuenta el servidor en ticks (`api.onTick`). La hoja gira 90° sobre su bisagra (`hoja()` en `client.ts`, pura).
- **Botones** (`botones@1`): estado por botón (`nombre, x, y, z, radio, pulsado, pulsaciones, puerta`); intención
  `pulsar {boton}`; evento `pulsado` (a los cercanos, cuenta `n`) y **`senal`** con alcance `"server"`: solo lo oyen
  las demás funciones del servidor (`api.listen("botones", "senal", …)`), nunca una página. Si `puerta` nombra una
  puerta, `features/puertas` la abre al oír la señal (y si ya estaba abierta, reinicia su cuenta de cierre). Un
  botón queda encendido un segundo (`LUZ_TICKS = 20`).
- **Cogibles** (`cogibles@1`): estado por cosa (`nombre, x, y, z, modelo, escala, radio, portador`); intenciones `coger
  {cosa}` y `soltar {cosa}` (vacío = lo que lleves); evento `cambio` (`que: cogida | soltada`). **Una cosa en la mano
  por persona** (`EN_MANOS_MAX = 1`); mientras alguien la lleva su `radio` es 0 (nadie ve «E: coger» en un suelo vacío)
  y su sitio (`at`) viaja con el portador. Todas las páginas la dibujan en la mano del portador con `view.lleva`
  (el mismo gancho que viste un bien) y la quitan del suelo. «Soltar» = `Q`, el botón de acción de la página, o
  `/soltar` en el chat; al salir del mundo se suelta sola donde estabas. No es una cosa de misión (`cosa@1`,
  `features/misiones`) ni un bien que sea tuyo (`features/bienes`): es una cosa del mundo que cualquiera lleva.
- **Un mundo trae las suyas** en `MUNDO_DIR/interacciones.json` (`numinia-engine/interacciones@1`):
  `{ "puertas": [{ id, nombre, x, y?, z, ry?, ancho?, alto?, radio?, cierraEn?, abierta? }], "botones": [{ id, nombre, x,
  y?, z, radio?, puerta? }], "cosas": [{ id, nombre, x, y?, z, modelo?, escala?, radio? }] }`; los ids son `[a-z0-9-]{1,16}`,
  `modelo` es el sha256 de un `.glb` que el servidor tenga activo (si no, la caja de la casa), y cada línea mal
  formada se deja fuera diciendo por qué en el registro. Sin fichero no hay ninguna, y el resto del motor no cambia
  (la huella de la simulación es la misma con y sin las tres; lo mide `test/interacciones.test.ts`). Un ejemplo
  mínimo: `{ "puertas": [{ "id": "norte", "nombre": "Puerta norte", "x": 6, "z": 0, "cierraEn": 10 }], "botones": [{ "id":
  "rojo", "nombre": "Botón rojo", "x": 12, "z": 0, "puerta": "norte" }], "cosas": [{ "id": "caja", "nombre": "Caja", "x": -6, "z": 0 }] }`.
- **Mantener pulsado (J4, v2):** `card.interact.hold` (segundos; opcional en `Interact`/`Reachable`,
  `packages/feature/src/index.ts`) hace que la página NO use la cosa al instante: E, el botón de acción (móvil) o el
  gatillo en VR deben mantenerse ese tiempo (un anillo de progreso —`--progreso` 0..1— crece en `#interactuar`,
  `apps/plaza/interactuar.ts`) antes de mandar el intent; soltar antes, o que el objetivo cambie, cancela sin mandar
  nada. `puertas`/`botones`/`cogibles` (su `coger`, no su `soltar`) ya lo llevan (`MANTENER_S` en cada `feature.ts`);
  el servidor no sabe nada de esto — solo decide CUÁNDO llega el intent, igual que siempre. En VR, el gatillo emite
  un evento de más al soltar (`gatillo_fin`, `packages/render/src/manos.ts`/`apps/plaza/xr.ts`) para poder cancelar
  un mantener a medias.
- **Lo que no hace (todavía):** paredes que paren a quien no abre la puerta (es dibujo, no colisión: J6), botones
  con otra acción que una puerta (la señal ya existe; que otra función la escuche es una línea), coger con la mano
  física en VR (hoy, rayo y gatillo como el resto; J10 lo hace para las cosas de misión), llevar más de una cosa, y
  un anillo de progreso propio en el panel de muñeca de VR (J13).
