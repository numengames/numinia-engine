# Móvil frío (P2)

Qué hace el cliente para que el móvil no se caliente. Código: `packages/render/src/power.ts`
(política pura, probada en `test/power.test.ts`) y el bucle de `apps/plaza/main.ts`.
Se decide por capacidad (`pointer: coarse`, `deviceMemory ≤ 4`, `saveData`), nunca por nombre de navegador.

| Situación | Tope | Pixel ratio |
|---|---|---|
| Escritorio | 60 fps (30 si no se mueve nada) | ≤ 2 |
| Móvil | 30 fps (`?fps=60` lo sube) · 12 fps parado | ≤ 1,25 · `powerPreference: low-power` · sin antialias |
| Modo batería (`?bateria`, tecla B, o `saveData`) | 24 fps · 8 parado | 1 |
| Calidad «baja» (menú de ajustes, N2) | 30 fps · 12 parado | ≤ 1 |
| Calidad «media» | 60 fps · 20 parado | ≤ 1,5 |
| Calidad «alta» | 60 fps · 30 parado | ≤ 2 |
| Pestaña oculta | 0: no se dibuja | – |

Ajustes (N2): «Automática» es lo de las dos primeras filas según el aparato; «Resolución» (50–100 %) multiplica el pixel
ratio; «Cuadros por segundo, máximo» fija el tope (en automático manda `?fps=` si está); el modo batería manda sobre
todo. La resolución dinámica sigue bajando el ratio si el cuadro cuesta demasiado, sea cual sea la calidad elegida.

«Parado» = ninguna tecla/toque y nadie se mueve en 600 ms. Los pasos de la simulación (20 Hz) no se saltan nunca.
Resolución dinámica: si el coste del cuadro supera el 70 % del presupuesto durante 2 s seguidos, el pixel
ratio baja ×0,85 (mínimo 0,5); si queda por debajo del 35 % durante 6 s, sube.

## Puerta de coste por cuadro (sin pantalla)
`tools/e2e.mjs` lee `__numinia.cost()` (llamadas de dibujo y triángulos de three, CPU ms) y falla si
supera el nivel D de `limits.json` (`draw_calls`, primer número de `triangles_on_screen`).

## Protocolo: temperatura y batería en un Android real (10 min)
1. Móvil cargado al 80–100 %, brillo al 50 %, modo avión apagado, misma wifi que el PC (`npm run dev:lan`).
2. `adb shell dumpsys battery | grep -E "level|temperature"` → anota nivel y temperatura (décimas de °C).
3. Abre la plaza, déjala 10 min moviéndote 1 min sí, 1 min no. Repite con `?bateria`.
4. Cada 2 min repite el comando del paso 2. `adb shell dumpsys thermalservice | grep -i status` da el estado térmico.
5. Anota en `limits.json` (`measured`, test = este archivo) la subida de °C y el % de batería por 10 min.
**Estado: sin medir en un móvil real** (X1).
