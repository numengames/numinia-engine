---
"numinia-engine": minor
---

## 2026-11-11 21:00 · cuerpo vivo · an AI's own .glb body breathes, talks and hops · hecho
- Qué: el cuerpo propio de un habitante (`habitante@1 apariencia`, un .glb del mundo) ya no es un modelo quieto: vive como
  una persona del mundo (vida.ts). Toca su clip de reposo (`respira`/`idle`), el de hablar (`habla`/`talk`) mientras se ven
  sus palabras y el de andar (`camina`/`walk`) mientras se mueve; quieto, mira a la persona con la que está. Pablo lo pidió
  para Chispa, un moñoñi: que respire, que bote y que mueva la boca cuando hable.
- Números: 1 fichero de render (+18/−4), 1 función pura (`duracionHabla`) con su prueba; en el navegador el cuerpo de Chispa
  pasa por `habla` al contestar y por `camina` al andar (`view.gestoDe("cuerpo:<id>")`), 0 errores de página.
- Cambio: minor (comportamiento visible nuevo, sin cambio de formato).
