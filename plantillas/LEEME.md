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
- `entorno/` — `espacio-base.json` (nace en el espacio base, de noche), `naturaleza.json` apagada, `disparadores.json`
  con el cable de muestra «Botón rojo» (que enseña el farolillo que pone la misión 2), y `pesca`, `dardos` (sin enlace de
  AR a la Torre), `lucha` y `ancestros` **vacíos**: sin ellos el motor pondría el estanque, la diana, la criatura y el
  Salón de los Ancestros de la casa. Para tenerlos, el dueño los rellena o los enciende en Construir → Entorno.

Comprobación: `node tools/aventura.ts plantillas/taller/aventura`; pruebas: `test/mundo-nuevo-taller.test.ts`
(archivos y misiones de un mundo recién nacido, un mundo existente intacto) y `tools/e2e-piernas/mundo-nuevo-taller.mjs`
(las 11 misiones jugadas en el navegador hasta la insignia, sobre un mundo recién nacido).

La aventura de ejemplo (`aventuras/ejemplo`) sigue en el motor para quien la pida (`AVENTURA_DIR=aventuras/ejemplo`) y
para un mundo antiguo con datos pero sin `aventura/`.
