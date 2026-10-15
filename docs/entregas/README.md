# Entregas de ramas en paralelo

Cuando varias ramas se construyen a la vez (sesión Opus del 15-10: cámara, constructor, subir ficheros,
salto, avatares, chat), ninguna toca `docs/BACKLOG.md`, `docs/RUNLOG.md`, `docs/SABER.md`, `docs/MAPA.md` ni
`llms.txt`: chocarían al juntarlas. Cada rama deja aquí `docs/entregas/<rama>.md` con:

- **Qué**: lo construido, ficheros nuevos y tocados.
- **Decisiones**: cada una con su porqué (las que cambien `docs/SABER.md`, marcadas).
- **Números**: pruebas, puertas, e2e, pesos (kB), tiempos; de una ejecución, no de memoria.
- **Sin comprobar** y **lo que falta**: lo que queda para otra fila.
- **Para el BACKLOG**: el estado que propone para su fila y las filas nuevas, si las hay.
- **Dependencias nuevas**: nombre, versión exacta, licencia.

Quien junta las ramas en `main` pasa esto al BACKLOG, al diario y al SABER, y borra el fichero.
