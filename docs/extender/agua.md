# Agua (N2): estilizada, de color plano, un solo draw call

`packages/render/src/agua-estilo.ts` es el agua de todo el motor: el elemento `agua` (estanques, fuentes, los mares de las
plantillas) y el estanque de la pesca. Material de nodos TSL (vale en WebGPU y en WebGL2), **sin textura, sin render-target
y sin pasada extra de escena**: un draw call por agua en todos los niveles; lo que cuesta es ALU por píxel. Iluminada por la
escena (Lambert), así que de noche se oscurece sola.

- **Siempre** (también en D): bandas planas de color (orilla turquesa · el color del constructor · hondo), espuma de orilla
  blanca y fresnel escalonado hacia el color del horizonte (`entorno.aguaLuz.cielo`: el de la niebla o el del cielo).
- **Por nivel** (`calidad.ts` → `DETALLE_AGUA`, `detalleAgua(nivel, agua)`):

| Nivel | olas (celdas máx.) | espuma viva | líneas de luz | cáusticas | destellos |
|---|---|---|---|---|---|
| A sencilla / con destellos | 48 / 96 | sí | sí | sí | no / sí |
| B (Quest en XR) | 32 | sí | sí | no | no |
| C (móvil) | 24 | sí | sí | no | no |
| D (móvil viejo) | 0 (un quad) | no | no | no | no |

- Las **olas** son de vértice (baratas: vértices, no píxeles), solo en agua de ≥ `OLAS_DESDE_M` (12 m) de lado corto, se
  apagan hacia la orilla para que el borde no se mueva y solo suben (nunca se hunden bajo el suelo).
- La opción «Agua» del menú: «Sencilla» / «Con destellos»; ya no hay `WaterMesh` reflectante (`view.elementos.contar().reflejos`
  queda en 0; `aguaDetalle` dice qué dibuja el agua en este nivel).
- Pruebas: `test/agua.test.ts`.
