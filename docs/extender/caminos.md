# Caminos (v1): luz que recorre el suelo hasta cada zona

Un mundo dibuja tiras finas y luminosas en el suelo, con un pulso de luz que avanza por ellas (de la plaza a cada taller). Es una pieza R-1: cualquier mundo la activa con dos claves en su `entorno.json`; sin ellas no se construye nada.

```json
"caminos": [ { "desde": [0, 0], "hasta": [30, 0] }, { "desde": [0, 0], "hasta": [0, -40] } ],
"caminosColor": "#7fe8ff"
```

- `caminos`: lista de `{ desde: [x, z], hasta: [x, z] }` en metros, como mucho 14, cada uno de 0,5 a 2000 m, extremos dentro de ±1960. `caminosColor` es opcional (`#7fe8ff` por defecto). Un error dice la ruta en el fichero (`entorno.caminos[1].desde`) y cómo arreglarlo; un fichero con errores no se usa y el log dice por qué.
- En el estado compartido viajan como un texto plano `caminos` = `"x1,z1,x2,z2;…"` y un entero `caminosColor`. Son **del archivo del mundo**, como `mapaCorte` y la cámara: ningún panel los cambia y el servidor los repone al arrancar.
- Dibujo (`packages/render/src/caminos.ts`, parte pura en `caminos-politica.ts`): **una malla y un draw call** para todos los caminos del mundo; el pulso es una sola animación en el shader (un uniforme de tiempo). Aditivo, sin sombras, sin raycast.
- Por nivel (principio 2): **A** (escritorio) anima el pulso, y solo pide cuadros mientras estás a < 90 m de algún camino; **B** (Quest en XR) y **C** (móvil) dibujan la tira con el pulso parado en una fase fija; **D** una línea simple y más fina. Una página quieta se queda quieta.
- Límite de v1: la tira va plana a 6 cm sobre y = 0; en un mundo con terreno o plataformas no sigue el relieve. `prefers-reduced-motion` aún no la para (los niveles B–D ya van parados).
- Pruebas: `test/caminos.test.ts`.
