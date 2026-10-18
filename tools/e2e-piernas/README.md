# Piernas del e2e, una por área

`tools/auto.sh e2e` ejecuta cada `tools/e2e-piernas/*.mjs` después de las piernas de siempre, con:

- `BASE`: la página (`http://127.0.0.1:<vite>/?webgl2&server=ws://127.0.0.1:<servidor>`),
- `SERVER_HTTP`: el lado HTTP del servidor (`http://127.0.0.1:<servidor>`).

Una pierna abre sus pestañas (copia `open()` de `tools/e2e.mjs`), comprueba lo suyo, deja el mundo como lo
encontró (borra lo que coloca), imprime en JSON lo que vio y sale con 0 solo si todo está bien.
Un fichero por área: así el trabajo en paralelo no choca en `tools/e2e.mjs` ni en `tools/auto.sh`.

Excepción: `bienes.mjs` (N18) arranca **su propio** servidor y página (8796/5178; `E2E_SERVER_PORT`/`E2E_VITE_PORT`)
porque necesita un mundo que firme (`MOTOR_SECRET`) y una copia de la aventura con `bienes/confianza.json` que confíe
en un mundo de prueba; ignora `BASE` y lo borra todo al salir. Igual `suelo.mjs` (D-045, 8797/5179): un mundo
desechable con `sueloMinimo: 1`, un punto de vuelta y una plataforma sólida a 3 m con un hueco alrededor; nada de
producción.

Lo que una pierna necesita como fixture (p. ej. `datos/pantalla.webm`, un segundo de vídeo de 667 bytes para la pierna
`pantalla`) va en `datos/`: el bucle solo ejecuta `*.mjs`.

**Piernas lentas.** Una pierna cuya primera línea es `// e2e-lenta` tarda minutos (con la máquina cargada, hasta 3) y trae su
propio servidor: `tools/auto.sh e2e` la salta salvo que pongas `E2E_LENTAS=1`. Hoy, `dardos-duelo.mjs` (AR-D5, 8799/5181;
`E2E_SERVER_PORT`/`E2E_VITE_PORT`): el duelo de dardos entero con un PC y una Quest 3 emulada con pared; se corre sola con
`node tools/e2e-piernas/dardos-duelo.mjs`.
