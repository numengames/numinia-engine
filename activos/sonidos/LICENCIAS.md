# Licencias de los sonidos de la casa (S6)

Todo lo de `activos/sonidos/` es **CC0 1.0 Universal** (dominio público), de **Kenney.nl** y de
**OpenGameArt filtrando por CC0**, verificado fuente a fuente al construir la biblioteca
(`work/motor-ar/sonido/biblioteca/THIRD_PARTY_AUDIO.md` tiene la tabla completa, fichero a fichero, con el
sha256 del original descargado; aquí van solo las filas de lo que entra al repo), **más el colchón de ambiente
`ambiente-numinia`**, que no sale de esa biblioteca: lo hizo un amigo de Numinia a propósito para Numinia y lo
cedió en CC0 (dicho por Pablo el 2026-10-19). **TODO: falta el nombre de su autor**, pendiente de que Pablo lo
diga; en cuanto esté se pone en `COLCHON.autor` (`tools/sonidos-catalogo.ts`) y vuelve a salir aquí. CC0 no
obliga a citar; lo citamos igual.

**6 ids del catálogo no tienen fichero** (`dano`, `moneda`, `pesca-picada`, `salto`, `ui-abrir`, `ui-cerrar`): los hace el
motor con una receta de `packages/render/src/audio/sintesis.ts`, que es código nuestro bajo la licencia del
repo. No hay nada de nadie que licenciar en ellos, así que no tienen fila en esta tabla. Cuando uno de esos ids
consiga un fichero CC0, entra por la biblioteca y **el fichero gana**: la receta se queda de respaldo.

**28 ids · 90 variantes · 180 ficheros** (90 `.opus` = 1.022.250 B y
90 `.m4a` de respaldo para Safari = 1.232.218 B; **2.254.468 B** en total).
Los sirve `GET /a/<sha256>.opus` (`packages/server/src/activos.ts`); la lista con el sha256 de cada fichero
está en `features/sonido/catalogo.json` y `test/sonidos.test.ts` comprueba que cada sha256 es el de su fichero
y que ninguna licencia deja de ser CC0.

**Cambio nuestro**: los ficheros son derivados (recorte del silencio de cabeza y cola, ganancia a RMS −18 dBFS
con techo de pico en −2 dBFS, recodificación a Opus 40 kbps VBR mono 48 kHz y a AAC 48 kbps), lo que CC0
permite sin condiciones. Se rehacen con `python3 construir.py` dentro de la biblioteca y se traen aquí con
`node tools/sonidos-catalogo.ts`.

Autores: Fantozzi (subido por qubodup), Kenney Vleugels (kenney.nl), Peludo, Thimras, TinyWorlds, artisticdude, pendiente (Pablo lo dirá), pyranostudios, rubberduck.

| Carpeta | Para qué | Variantes | Lote | Bus | Licencia | Autor | Fuente |
|---|---|---|---|---|---|---|---|
| `sonidos/ambiente-numinia/` | colchon de ambiente del mundo | 1 | nucleo | ambiente | CC0-1.0 | pendiente (Pablo lo dirá) | <cedido por un amigo de Numinia para Numinia (CC0, dicho por Pablo el 2026-10-19)> |
| `sonidos/aterrizaje/` | caida y salto | 3 | nucleo | pasos-propios | CC0-1.0 | Fantozzi (subido por qubodup); rubberduck | <https://opengameart.org/content/100-cc0-sfx> <https://opengameart.org/content/fantozzis-footsteps-grasssand-stone> |
| `sonidos/cerradura/` | acierta o rechaza (D-042) | 2 | funcion | efectos | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/rpg-audio> |
| `sonidos/coger-soltar/` | coger (3) y soltar (3) objeto | 6 | nucleo | efectos | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/interface-sounds> |
| `sonidos/dados/` | agitar (2) y caer (3) | 5 | funcion | efectos | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/casino-audio> |
| `sonidos/dardo-impacto/` | clava en diana o rebota | 4 | funcion | efectos | CC0-1.0 | rubberduck | <https://opengameart.org/content/100-cc0-metal-and-wood-sfx> |
| `sonidos/dardo-lanzar/` | tirar dardo | 3 | funcion | efectos | CC0-1.0 | artisticdude | <https://opengameart.org/content/swishes-sound-pack> |
| `sonidos/golpe-material/` | impacto en piedra, madera o metal | 12 | nucleo | efectos | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/impact-sounds> |
| `sonidos/maquina/` | arranque y parada de mecanismo (D-043) | 2 | funcion | efectos | CC0-1.0 | rubberduck | <https://opengameart.org/content/100-cc0-sfx> |
| `sonidos/pasos-agua/` | borde del estanque | 6 | funcion | pasos-propios | CC0-1.0 | Peludo; rubberduck | <https://opengameart.org/content/100-cc0-sfx> <https://opengameart.org/content/water-splash-and-sand-footsteps> |
| `sonidos/pasos-hierba/` | pasos sobre hierba | 6 | nucleo | pasos-propios | CC0-1.0 | Fantozzi (subido por qubodup) | <https://opengameart.org/content/fantozzis-footsteps-grasssand-stone> |
| `sonidos/pasos-madera/` | pasos sobre madera | 6 | nucleo | pasos-propios | CC0-1.0 | TinyWorlds; rubberduck | <https://opengameart.org/content/100-cc0-sfx-2> <https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud> |
| `sonidos/pasos-metal/` | rejilla o metal | 6 | funcion | pasos-propios | CC0-1.0 | Thimras | <https://opengameart.org/content/metal-footsteps-on-concrete> |
| `sonidos/pasos-piedra/` | pasos sobre piedra | 6 | nucleo | pasos-propios | CC0-1.0 | Fantozzi (subido por qubodup) | <https://opengameart.org/content/fantozzis-footsteps-grasssand-stone> |
| `sonidos/pesca-chapuzon/` | el cebo entra en el agua | 3 | funcion | efectos | CC0-1.0 | Peludo; rubberduck | <https://opengameart.org/content/100-cc0-sfx> <https://opengameart.org/content/water-splash-and-sand-footsteps> |
| `sonidos/pesca-cobrar/` | pez cobrado | 2 | funcion | efectos | CC0-1.0 | rubberduck | <https://opengameart.org/content/50-cc0-retro-synth-sfx> |
| `sonidos/pesca-lanzar/` | lanzar la cana | 2 | funcion | efectos | CC0-1.0 | artisticdude; pyranostudios | <https://opengameart.org/content/air-whoosh> <https://opengameart.org/content/swishes-sound-pack> |
| `sonidos/puerta/` | abrir y cerrar | 2 | funcion | efectos | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/rpg-audio> |
| `sonidos/renacer/` | vuelta a la ultima posicion segura (D-045) | 1 | funcion | efectos | CC0-1.0 | rubberduck | <https://opengameart.org/content/50-cc0-retro-synth-sfx> |
| `sonidos/teleport/` | salida y llegada | 2 | funcion | efectos | CC0-1.0 | rubberduck | <https://opengameart.org/content/50-cc0-sci-fi-sfx> |
| `sonidos/ui-aviso/` | aviso del sistema | 1 | nucleo | interfaz | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/interface-sounds> |
| `sonidos/ui-chat/` | mensaje dirigido a mi | 1 | nucleo | interfaz | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/interface-sounds> |
| `sonidos/ui-confirmar/` | accion aceptada | 1 | nucleo | interfaz | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/interface-sounds> |
| `sonidos/ui-cuenta-atras/` | tic y fin de la cuenta atras (D-044) | 2 | nucleo | interfaz | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/interface-sounds> |
| `sonidos/ui-error/` | accion rechazada | 1 | nucleo | interfaz | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/interface-sounds> |
| `sonidos/ui-gente/` | alguien entra o sale de mi cercania | 2 | nucleo | interfaz | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/interface-sounds> |
| `sonidos/ui-logro/` | mision cumplida | 1 | nucleo | interfaz | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/music-jingles> |
| `sonidos/ui-pulsar/` | pulsacion de boton | 1 | nucleo | interfaz | CC0-1.0 | Kenney Vleugels (kenney.nl) | <https://kenney.nl/assets/interface-sounds> |

Descartado a propósito por licencia, no por calidad: Sonniss #GameAudioGDC (su EULA prohíbe redistribuir los
sonidos dentro de un «asset pack» o un «software development kit», que es exactamente esto), BBC
RemArc (no comercial), Pixabay (licencia revocable, prohíbe distribuir el contenido «standalone»), Zapsplat,
Boom, Artlist, Epidemic, Mixkit, Soundsnap y Soundly (EULA de pago o no transferible). Fuera también CC BY,
CC BY-SA, CC BY-NC y OGA-BY, por preferencia absoluta por CC0.
