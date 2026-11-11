---
"numinia-engine": minor
---

## 2026-11-11 17:15 · ia-presencia · Una IA te mira y se queda contigo cuando entras en su cúpula · hecho
- Qué: la burbuja de acción de toda IA es ahora una cúpula por defecto, y al entrar en ella la IA te mira, deja su paseo y se queda contigo; se marcha 3 s después de quedarse sola. Las marcas de IA (cartel verde, aro, burbuja) ya salen también cuando la IA estaba dentro antes que tú.
- Números: `features/burbuja` v2 con el campo `mira` (la persona con la que está: la primera que entró mientras siga dentro, luego la más cercana; nunca otra IA); pruebas 3269 bien, 0 mal; tick p99 de la plaza de 1.000 5,93 ms; página 646,3 kB gz. Comprobado en un navegador sin GPU contra el playground: al entrar, 1 aro y 1 cúpula dibujados (antes 0 y 0); al acercarse, la IA se para a mitad de ruta (0,00 m en 3 s) y la página la orienta hacia la persona. Sin medir en móvil ni en VR.
- Consumo: sin medir · claude-opus-5-5 (Galatea).
- Cambio: minor. Commit: branch `galatea/ia-presencia`.
- Siguiente: que la página avise y se reconecte cuando el servidor se reinicia (hoy se queda congelada sin decir nada); revisar las demás piezas cuyo `alCambiar` no entrega lo que ya había (asiento, botones, puertas…); campo `burbuja` en `habitante@1`.
