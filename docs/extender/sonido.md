# Sonido (S6): el catálogo de la casa, con ficheros de verdad y su texto

La pieza `sonido@1` (`features/sonido`) es el catálogo de sonidos del motor: **27 ids, 89 variantes, 178 ficheros**
(`.opus` + respaldo `.m4a`), **todo CC0 1.0** (Kenney y OpenGameArt), en `activos/sonidos/`. Antes de S6 los siete
avisos de la casa eran osciladores: pitidos sintetizados. Ahora son sonidos.

- **El servidor manda** (R-1 y D-041): nadie elige un sonido en su página. El servidor dice **qué id**, **dónde** y
  con **qué semilla**; cada página calcula con esa semilla la misma variante y la misma pizca de tono y volumen
  (`azarDe(semilla, id)`, xorshift32 con mezclador de murmur3, en `packages/render/src/audio/voces.ts`). Dos personas
  en el mismo sitio oyen **el mismo golpe de madera**, no dos distintos.
- **Cómo lo pide un mundo:** el receptor `suena` del cable (`{ "accion": "suena", "sonido": "golpe-madera" }`). Vale el
  id del catálogo o el nombre del aviso de la casa (`campana`, `exito`, `error`, `aviso`, `suave`, `paso`, `magia`,
  `completada`), que el motor traduce a su id. Un nombre que no está **no rompe nada**: el registro lo dice y el
  mundo sigue.
- **Cómo lo pide otra función del motor:** `crearSonido({ alArrancar: (suena) => … })` te da `suena(id, { donde, quien,
  volumen })`; `donde: null` = en la cabeza (sin panner), `donde: {x,y,z}` = en el mundo, y solo lo oye quien esté a
  `OYE_M`.
- **Accesibilidad (XAUR, WCAG 2.2):** cada sonido del catálogo trae su **texto** y viaja en el evento; la página lo
  lleva a la región de avisos (`anunciar`). Ningún sonido sin texto, y el aviso de la casa no se solapa con el
  fichero (`announce: "silent"`: el sonido del evento *es* el fichero).
- **El peso:** ni un `.opus` entra en el paquete de arranque. La página pide **una** tabla (`GET /sonidos.json`, media
  hora de caché, ~9 kB) con id → variantes por su sha256, bus, prioridad, cooldown y texto; los ficheros se piden
  luego a `/a/<sha256>.opus` (un año, inmutable), y solo los que hagan falta.
- **Si falta un fichero:** al arrancar, la pieza compara el catálogo con lo que hay en disco (ids repetidos, sha256
  que no cuadra, fichero que no está) y **avisa en el registro sin tirar el motor**; quien entra recibe `faltan`.
- **Rehacer el catálogo:** `node tools/sonidos-catalogo.ts --biblioteca <carpeta>` copia los lotes `nucleo` y
  `funcion` de la biblioteca verificada, recalcula el sha256 de cada fichero y reescribe `features/sonido/catalogo.json`
  y `activos/sonidos/LICENCIAS.md`. Es idempotente: si nada cambió, no toca nada.
