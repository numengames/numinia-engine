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

## Qué hay en la plaza de casa y para qué (MIS-224)

Cada objeto con un sentido; lo que no lo tenía se quitó. Las cosas de aquí llevan su propósito en `notas`; los pilares, en
`packages/render/src/hitos-plaza.ts` (`proposito`), y un test (`test/plaza-con-sentido.test.ts`) lo exige.

| Qué | Dónde | Para qué |
|---|---|---|
| Pilar dorado | (18, 0) | meta del primer paso de «Primeros pasos» |
| Pilar rojo | (0, 18) | la seña de Bruno: su caja está junto a él |
| Caja de herramientas | (4, 14) | lo que Bruno perdió (cierra «Primeros pasos») |
| Regadera azul, Saco de semillas | (−14, 4), (−9, −3) | lo que Teo pide en «Manos a la obra»; a la altura de la mano |
| Estanque, Diana, Holograma de Asimov | funciones `pesca`, `dardos`, `ancestros` | pescar, lanzar dardos, hablar con el holograma |

Quitados: 22 de los 24 pilares de colores del motor (cajas de 1×3×1 m en tres anillos «para que se note el movimiento»):
el suelo de hierba ya da la referencia y ninguna misión los nombraba. Un mundo que quiera pilares propios los pone como
objetos suyos; `hitos: false` en el entorno quita también estos dos.
