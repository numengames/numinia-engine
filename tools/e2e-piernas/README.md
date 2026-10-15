# Piernas del e2e, una por área

`tools/auto.sh e2e` ejecuta cada `tools/e2e-piernas/*.mjs` después de las piernas de siempre, con:

- `BASE`: la página (`http://127.0.0.1:<vite>/?webgl2&server=ws://127.0.0.1:<servidor>`),
- `SERVER_HTTP`: el lado HTTP del servidor (`http://127.0.0.1:<servidor>`).

Una pierna abre sus pestañas (copia `open()` de `tools/e2e.mjs`), comprueba lo suyo, deja el mundo como lo
encontró (borra lo que coloca), imprime en JSON lo que vio y sale con 0 solo si todo está bien.
Un fichero por área: así el trabajo en paralelo no choca en `tools/e2e.mjs` ni en `tools/auto.sh`.
