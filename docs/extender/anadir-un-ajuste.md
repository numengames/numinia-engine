# Añadir un ajuste (N2)

Un ajuste es **un dato**; el menú (tecla O o el engranaje) lo pinta solo, con su etiqueta, su descripción para el
lector de pantalla, el control que toca (casilla, deslizador, desplegable o tecla) y el aviso cuando cambia. Los agentes
leen y cambian lo mismo con `window.__numinia.ajustes` (`lista()`, `get(id)`, `set(id, valor)`, `restablecer(id?)`,
`abrir()`, `cerrar()`, `capacidades()`). Formato y validación: `packages/feature/src/ajustes.ts`; el registro (valores,
guardado, valores por defecto según el aparato): `packages/client/src/ajustes.ts`.

```ts
{ id: "sombras", tipo: "eleccion", nombre: "Sombras", describe: "Sombras del sol…",   // lo que dice el lector
  opciones: [{ valor: "no", nombre: "Sin sombras" }, { valor: "alta", nombre: "Alta" }],
  defecto: { valor: "no", nivel: { A: "alta" }, si: [{ requiere: ["memoriaGB<=2"], valor: "no" }] },
  requiere: ["entorno.sombras"],          // sin esa capacidad, ni se ve ni se aplica
  nota: "Llega con H4" }                  // opcional: lo que aún no funciona, dicho claro
```

- **Tipos:** `bool`, `numero` (`min`, `max`, `paso`, `unidad`), `eleccion` (`opciones`, hasta 16; `preajuste` para que una
  opción cambie otros ajustes, como «Calidad»), `tecla` (`soloVer: true` hasta que se puedan cambiar las teclas).
- **Valor por defecto según el aparato:** el primer `si` cuyas capacidades se cumplen gana; si no, el del nivel (`A`
  escritorio, `B` visor, `C` móvil, `D` móvil viejo); si no, `valor`. Así entran las preferencias del sistema antes del
  primer cuadro: `si: [{ requiere: ["menosMovimiento"], valor: true }]`.
- **`requiere`:** nombres de capacidades: `"webgpu"`, `"!tactil"`, `"memoriaGB>=4"`, `"nivel=A"`.
- **Del motor:** una entrada en `packages/client/src/ajustes-motor.ts` y lo que hace en la página, una línea en
  `apps/plaza/menu-ajustes.ts`: `a.alAplicar("graficos.sombras", (valor, ajustes) => …)`. Se aplica antes del primer
  cuadro y cada vez que cambia; si la función falla, se apunta una vez y lo demás sigue.
- **De una función de juego:** `ajustes: [ … ]` en `defineFeature` (hasta 16; si uno está mal, la función no se carga y
  el error dice dónde). Van en un grupo propio con el id de la función, y la parte de la página los lee cuando los
  necesita: `api.view.ajuste?.("<función>.<id>")`. Ejemplo: `features/despertar` («Columna de luz»).
- **De un mundo o una aventura:** un fichero `apps/<mundo>/mundo.ajustes.json` (esquema `numinia-engine/ajustes-mundo@1`)
  con `defectos` (cambia el valor por defecto de cualquier ajuste, también por nivel), `ocultar` (ajustes del motor que en
  ese mundo no tienen sentido) y `ajustes` (los suyos, en su grupo o en uno del motor). Todo o nada: si algo está mal no se
  aplica nada y se dice dónde. Ejemplo: `apps/plaza/mundo.ajustes.json`. Con M16 el manifiesto de la zona traerá lo mismo.
- **Guardado:** solo lo que la persona elige; lo demás sigue al aparato. Los del motor valen para todo el aparato, los de
  funciones y mundos para ese mundo (`alcance` lo cambia). Con versión y migraciones; lo viejo que ya no vale se tira.
  Con I1/V8 los de accesibilidad irán con la persona.
