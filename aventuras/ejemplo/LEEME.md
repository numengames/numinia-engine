# Aventura de EJEMPLO del motor

**Esto es contenido de ejemplo**, no la ciudad: sirve para probar los formatos y que la plaza de casa tenga algo con
lo que hablar. Las aventuras de verdad viven en su propio repositorio y el servidor las lee con
`AVENTURA_DIR=/ruta/a/la/aventura` (por defecto, esta carpeta; `AVENTURA_DIR=` sin nada = ninguna).

- `misiones/primeros-pasos.json` (`mision@1`): visitar el pilar dorado del este, hablar con Bruno y coger su caja.
- `pnj/alma.json`, `pnj/bruno.json` (`pnj@1`): la guía que da la misión y el farolero.
- `cosas/caja-de-bruno.json` (`cosa@1`): la caja perdida («E: coger la caja»).
- `misiones/manos-a-la-obra.json`, `pnj/teo.json`, `cosas/regadera.json`, `cosas/semillas.json` (J10): Teo, el
  jardinero, pide dos cosas que están a la altura de la mano (azul y dorada); en VR se cogen con la mano (o el mando) y
  se ven en ella; en pantalla, con E, un clic o el botón.
- `escenas/taberna.json`, `escenas/tormenta.json` (`escena@1`, N6): dos escenas para quien dirige (permiso «Gestionar
  rituales»): el panel «Dirigir» (K) o `/escena taberna` en el chat. Una escena pone cielo, luz y niebla sobre el
  entorno del mundo y puede traer una línea del narrador. `/escenas` las lista, junto a los entornos de la casa.
- `ficha.json` (`ficha@1`): cómo se llama el mundo y de qué va (la página y `/status` lo dicen); `portada` opcional.

Cómo se escribe una aventura (formatos, reglas, errores): `docs/EXTENDER.md`, «Misiones y personas (PNJ)».
Comprobar una carpeta sin arrancar nada: `node tools/aventura.ts aventuras/ejemplo`.
