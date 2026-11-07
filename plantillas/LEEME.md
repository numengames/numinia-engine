# plantillas/

Con qué nace un mundo. Cada carpeta es una plantilla que el motor copia **una sola vez**, cuando la carpeta del mundo
(`MOTOR_MUNDO`) está recién creada: sin `aventura/`, `entorno/`, `datos/` ni `mundo.json`
(`esMundoNuevo` en `packages/server/src/mundo-carpeta.ts`; el instalador `instalar-motor.sh` hace lo mismo con
`/var/lib/numinia-motor`). Desde entonces los ficheros son del mundo y editables: el motor nunca los vuelve a tocar.
Un mundo que ya existe no cambia.

## taller/

El onboarding de quien llega a un mundo nuevo, y nada más:

- `aventura/` — `ficha.json` («Mundo nuevo»), `pnj/lumen.json` (la guía) y las 11 misiones encadenadas de «cómo se
  construye un mundo» (`misiones/01-abre-el-taller.json` … `11-tu-mini-mision.json`; usan los pasos `hace` y `senala`).
  Recompensa final: la insignia «Constructor». Sin misiones de ejemplo, sin otras personas, sin habitantes.
- `aventura/LEEME-IA.md` — la nota del mundo para las IAs que entran (qué pueden construir, estilo, qué no tocar): el modelo de todo
  LEEME-IA (`## Lo que puedes construir`, `## Estilo`, `## Lo que no debes tocar`). Pública, hasta 12 KiB; el dueño la reescribe.
  El puente MCP se la entrega a la IA (`leeme_ia`); lo comprueba `node tools/aventura.ts`.
- `entorno/` — `espacio-base.json` (nace en el espacio base, de noche), `naturaleza.json` apagada, `disparadores.json`
  con el cable de muestra «Botón rojo» (que enseña el farolillo que pone la misión 2), y `pesca`, `dardos` (sin enlace de
  AR a la Torre), `lucha` y `ancestros` **vacíos**: sin ellos el motor pondría el estanque, la diana, la criatura y el
  Salón de los Ancestros de la casa. Para tenerlos, el dueño los rellena o los enciende en Construir → Entorno.

Comprobación: `node tools/aventura.ts plantillas/taller/aventura`; pruebas: `test/mundo-nuevo-taller.test.ts`
(archivos y misiones de un mundo recién nacido, un mundo existente intacto) y `tools/e2e-piernas/mundo-nuevo-taller.mjs`
(las 11 misiones jugadas en el navegador hasta la insignia, sobre un mundo recién nacido).

## hermes/

Un **tipo de mundo** cerrado: el mundo que representa la aplicación de escritorio de Hermes (no una función que otros mundos
enciendan). Se elige con `MOTOR_PLANTILLA=hermes` al crear un mundo nuevo (sin la variable, `taller`; un nombre que no existe
detiene el arranque y dice cuáles hay). Hoy es el esqueleto: `aventura/ficha.json` («Hermes»), `aventura/LEEME-IA.md` (una IA
solo mira y habla) y un `entorno/` con espacio base, naturaleza, pesca, dardos, lucha y ancestros apagados o vacíos. Las zonas, el
espejo (`entorno/espejo.json`) y el enlace con el plugin llegan en las historias siguientes. Pruebas:
`test/mundo-nuevo-hermes.test.ts`.

La aventura de ejemplo (`aventuras/ejemplo`) sigue en el motor para quien la pida (`AVENTURA_DIR=aventuras/ejemplo`) y
para un mundo antiguo con datos pero sin `aventura/`.

## art-gallery/

A **world type**: the Art Gallery («Art Gallery», public, CC0; formerly the «Galería Stoa»). Chosen with `MOTOR_PLANTILLA=art-gallery` when a new
world is created. Unlike the others it also ships `datos/`: the built gallery (a Mediterranean stoa with a courtyard and fountain, 21 empty
frame slots that a builder fills by clicking them, two pedestals, the facade sign) and its 30 files in `datos/activos/` (named by their sha256);
a new world gets them copied whole. `aventura/` has the curator, the critic, three standing visitors (Ana, Teo, Iris), three missions, five postcards, three scenes and the
guide and three visiting AIs (Lía, Pau and Nora); every word is English, the Spanish translation is in `aventura/idiomas/es.*`.
`aventura/ficha.json` carries the name, the semantic `version`, the creator (Numen Games) and the owner (`pending`); `aventura/LICENSE.md`
is the CC0 licence file (marks excluded, see `TRADEMARKS.md`); the world sheet is `docs/FICHA-MUNDO-ART-GALLERY.md`.
Tests: `test/mundo-nuevo-art-gallery.test.ts`.
