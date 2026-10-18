# tools/economia — simulador de economías de juego (herramienta de diseño)

Para decidir si un sistema de recursos está equilibrado **antes** de programarlo en el motor: se escribe el
sistema como datos (un diagrama) y se simula N ticks con el azar sembrado del motor. Salida: números por tick,
no una interfaz. **No está conectado al motor**: nada en `packages/` ni en `features/` lo importa.

El método (en nuestras palabras, con fuentes) y lo que se aprendió de los diseños públicos de la comunidad
está en `../../../mmo-browser-study/MAQUINACIONES-APRENDIZAJE.md`. Léelo antes de modelar algo nuevo.

## Qué hay

| Archivo | Qué es |
|---|---|
| `diagrama.ts` | Los tipos: `Diagrama = { nombre, nodos, estados }` y `validar()` (ids únicos, referencias, números). Sin dependencias. |
| `simular.ts` | `simular(diagrama, { ticks, semilla, hasta? })` → `{ ticks, series, disparos }`; `correr()` para muchas semillas, `primerTick`, `finales`, `resumen` (mín, p50, p95, máx, media). Usa `rngInt` de `packages/core` (mulberry32). |
| `modelos/prestigio.ts` | La Tabla de Prestigio del manual (Semillas verde 1 … roja 5; costes 50/100/200/500/1000), con personas `gastador`/`ahorrador` y un interruptor `escalada` (freno, no canon). |
| `modelos/reliquias.ts` | Cuándo cae una Reliquia: probabilidad base por encuentro + «piedad» (cada fallo sube la probabilidad; al caer, se olvida). |
| `../economia.ts` | Línea de órdenes: `node tools/economia.ts prestigio|reliquias [opciones] [--json]`. |

Tests: `test/economia.test.ts` (los nodos y el determinismo) y `test/economia-numinia.test.ts` (los dos
modelos con sus números fijados).

## Los nodos

- **almacén** `{ tipo: "almacen", id, inicial?, max? }` — guarda un recurso; el estado es la cuenta de los almacenes.
- **fuente** `{ tipo: "fuente", id, salidas: [{ a, tasa? }], probabilidad? (‰), modo? }` — crea recursos.
- **sumidero** `{ tipo: "sumidero", id, de, tasa?, modo? }` — los destruye.
- **conversor** `{ tipo: "conversor", id, entradas, salidas, veces?, modo? }` — todo o nada: si tiene las entradas, las consume y produce las salidas; `veces` por tick.
- **puerta** `{ tipo: "puerta", id, de, tasa?, salidas: [{ a?, peso, dispara? }], reparto?: "azar"|"turnos" }` — cada unidad sale por una salida según peso; sin `a` se pierde; `dispara` lanza un nodo pasivo.
- **registro** `{ tipo: "registro", id, valor }` — un valor calculado que otros leen; no guarda nada.
- **tasa**: `3` · `{ lee: "almacen", por, entre, mas, min, max }` · `{ dado: 6, veces: 2 }` · `{ uniforme: [1, 3] }` · `(leer, azar) => n`. Siempre entero ≥ 0.
- **estados**: `{ tipo: "activador", si, es: "<"|"<="|">"|">="|"=="|"!=", que, activa }` deja disparar un nodo solo si se cumple; `{ tipo: "disparador", cuando, dispara }` lanza un nodo pasivo cuando otro mueve algo.
- `modo: "auto"` (por defecto) dispara cada tick en el orden en que está declarado; `"pasivo"` solo cuando lo disparan.

## Ejemplo

```ts
import { validar } from "./tools/economia/diagrama.ts";
import { simular } from "./tools/economia/simular.ts";

const d = {
  nombre: "pozo",
  nodos: [
    { tipo: "almacen", id: "agua", max: 25 },
    { tipo: "fuente", id: "lluvia", salidas: [{ a: "agua", tasa: { dado: 4 } }] },
    { tipo: "sumidero", id: "sol", de: "agua", tasa: 1 },
  ],
} as const satisfies Diagrama;
if (validar(d).ok) console.log(simular(d, { ticks: 10, semilla: 1 }).series.agua);
```

## Reglas de la capa

- Solo importa `packages/core` (el RNG) y nada de Node ni del DOM: corre igual en un test, en el servidor o en el navegador.
- Enteros siempre: no hay medias Semillas. Si hace falta precisión, se escala (‰).
- Misma semilla y mismo diagrama → misma serie, en cualquier máquina. Los números de un modelo se fijan en un test.
- Vocabulario propio en castellano; no se copia formato, código ni marca de ningún producto.

## Lo que no hace (aún)

Editor visual, gráficas, nodos interactivos de verdad (la «persona» son activadores y el orden de los
conversores), tiempo asíncrono/por turnos, comerciante entre jugadores, varios jugadores en un mismo diagrama.
