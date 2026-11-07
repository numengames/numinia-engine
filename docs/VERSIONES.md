# Versiones

El motor lleva una **versión semántica** en `package.json`: tres números, `mayor.menor.parche`, como manda
STD-019 de numinia.org (Semantic Versioning 2.0.0). Es lo único que la página enseña, al pie de los ajustes
(`v0.1.0`), sin marca. El build (`<commit> <fecha>`, el de `/health`, `/status`, el instalador y el zip del mundo)
sigue existiendo para quien ayuda con un fallo: sale al pasar el ratón por encima de la versión.

## Cuándo se mueve cada número

Cada PR que llega a `main` mueve **uno** de los tres, según lo que cambia para quien usa el motor (una
persona que juega, quien construye, un mundo guardado, una IA conectada):

| Cambio | Número | Ejemplo |
|---|---|---|
| Arreglo que no pide nada nuevo | parche: 0.1.0 → 0.1.1 | la cámara ya no atraviesa paredes |
| Algo nuevo que no rompe nada | menor: 0.1.1 → 0.2.0 | ajustes en pestañas, mando que salta |
| Algo que deja de funcionar como ayer | mayor: 1.4.2 → 2.0.0 | un zip de mundo viejo que ya no se abre, un mensaje de red que cambia de forma |

**Antes de 1.0.0** (ahora): el motor está en desarrollo inicial y, como dice Semantic Versioning (punto 4),
cualquier cosa puede cambiar. Mientras tanto, una ruptura sube el **menor** y lo dice en el diario
(`docs/RUNLOG.md`) y en el PR. Pasar a **1.0.0** es una decisión de Pablo: desde ese día, romper sube el mayor.

Se empezó en **0.1.0** el 16-10-2026 (STD-019: «todo empieza en cero punto uno punto cero»).

## Cómo

El número no lo mueve cada PR (todos tocaban las mismas líneas y al entrar uno, los demás quedaban en conflicto):

- Cada PR deja **un fichero propio** `.changeset/<rama-con-guiones>.md`, en el formato de
  [Changesets](https://github.com/changesets/changesets) (sin instalarlo): arriba el paquete y el salto
  (`"numinia-engine": minor`), debajo la entrada del diario. Ejemplo y reglas en `.changeset/README.md`. El PR **no**
  toca `package.json`, `package-lock.json`, `docs/RUNLOG.md` ni `apps/plaza/novedades-datos.ts` (este último ya no está
  en git: se genera).
- El PR dice en su cuerpo qué salto pide («Change kind») y por qué; el número sale al juntar.
- Cuando hay varios PR fusionados, un PR de versión (`chore(release): x.y.z`) corre `npm run cambios:juntar`: toma el
  salto **más alto** de los fragmentos (antes de 1.0.0, «mayor» se aplica como menor), escribe la versión una vez en
  `package.json` y `package-lock.json` (las dos primeras apariciones), pasa los cuerpos a `docs/RUNLOG.md` por la hora
  de su cabecera y borra los fragmentos. `npm run cambios:juntar -- --comprobar` solo valida y dice qué versión saldría.
- La barra de novedades de la página ya cuenta los fragmentos pendientes: una novedad se ve desde que está en `main`.
- `test/version.test.ts` comprueba que la versión es semántica válida y al menos 0.1.0; `test/cambios.test.ts`, que cada
  fragmento es válido y que juntar funciona.

## Dónde publica cada release su versión y sus novedades

Cada release `motor-<corto>` (la crea `tools/publicar-version.sh`, que llama `publicar-motor.yml`) lleva dos ficheros
que una máquina puede leer sin abrir el repositorio:

- `imagen.json`: `{image, commit, build, digest, version}`. `version` es la versión semántica que esa release trae: la
  que sale de los fragmentos de `.changeset/` pendientes (el salto más alto sobre `package.json`) o, sin fragmentos, la
  de `package.json`. Los campos anteriores no cambian; quien lee y no conoce `version` la ignora.
- `novedades.json`: una lista con una entrada por fragmento pendiente (o, sin ninguno, la última entrada del diario):
  `{kind, text, title, date}`; `kind` es `patch`, `minor` o `major`, `text` la línea «Qué» del diario.

```
curl -sL https://github.com/numengames/numinia-engine/releases/latest/download/imagen.json
curl -sL https://github.com/numengames/numinia-engine/releases/latest/download/novedades.json
```

El código está en `tools/novedades-release.mjs` (prueba: `test/novedades-release.test.ts`).
