---
"numinia-engine": patch
---

## 2026-11-04 07:06 · P8 el menú ☰ cabe en la pantalla del móvil · hecho
- Qué: en un móvil de 412 px el menú ☰ iba de x = 286 a 506 (hasta 94 px fuera de la pantalla; 360 px: 234…454). La causa: `menu-barra.ts` ponía `right` en línea, pero `#barra-arriba > * { inset: auto !important }` de `tema.css` le gana, así que el menú de 220 px colgaba del borde IZQUIERDO de una barra que está a 80 px del borde derecho de la pantalla. Ahora, si donde lo pone el CSS no cabe (8 px de margen), se cuelga bajo su botón con `right` en línea `!important` y, si hace falta, se desplaza para quedar dentro (`derechaDelMenu`, puro, en `menu-logica.ts`); el ancho máximo es el de la pantalla menos márgenes. En escritorio ya cabía: no se toca (mismas x que antes). Vale también para «Cámara».
- Números: `test/menu-cabe.test.ts` nuevo (7 pruebas, incluido un barrido de 280 a 1920 px y de 0,8× a 1,5× de zoom). Medido en Chromium (WebGL2) con el mundo v3, menú ☰ abierto: 412×915 286…506 → 110…330; 360×640 234…454 → 58…278; 915×412 855…1075 → 679…899; 640×360 518…738 → 342…562; escritorio 1280×720 909…1129 → 909…1129 (igual). Foto mirada en 412 y 360: el menú cuelga bajo el botón, sin texto cortado.
- Consumo: sin medir · Sonnet 5.5.
- Cambio: patch. Commit: rama `fix/menu-fits-phone`.
- Siguiente: la rueda de «Movimientos» y los demás paneles del móvil, si alguno más se sale.
