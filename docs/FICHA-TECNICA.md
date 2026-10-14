# Ficha técnica del motor

Para quien tenga que decidir si monta algo sobre el motor. La versión para máquinas es
[`limits.json`](../limits.json) (esquema `numinia-engine/limits@1`); un test (`test/limits.test.ts`)
comprueba que cada número tiene estado y fuente. **Medido** = lo mide una prueba del repositorio
(se nombra). **Estimado** = viene de estudios y de lo que publican otros; se sustituye por una medida
cuando exista. Versión 1 · 15 de octubre de 2026.

## Qué sale hoy en cada nivel

| Nivel | Qué es | Hoy |
|---|---|---|
| **Base** | funciona en todo navegador con WebGL2 | instancia en servidor, simulación determinista, predicción en el cliente, dibujo WebGL2, enjambre de bots (medido) |
| **Mejorado** | se enciende solo donde la API existe | WebGPU (lo elige three.js; sin prueba propia), XR, voz: **aún no implementados** |
| **Frontera** | opcional, detrás de un interruptor | WebTransport: **aún no implementado** |

Se detecta por capacidad, nunca por nombre de navegador.

## Servidor

| Dato | Valor | Estado |
|---|---|---|
| Paso de simulación / reparto | 20 Hz / 10 Hz | medido (`tools/gates.mjs`) |
| Tráfico por persona (K=50 a 10 Hz) | tope 70 kbit/s; real **25,5 kbit/s** | medido (`tools/gates.mjs`, `tools/swarm.sh`) |
| Plaza de 1.000, un hilo | tick p99 ≤ 25 ms; real 16–23 ms | medido (`tools/gates.mjs`), en el PC de desarrollo |
| Memoria con 1.000 conectados | 169 MB | medido (`tools/swarm.sh`) |
| Conectar 500 bots | ~0,4 s | medido (`tools/swarm.sh`) |
| Personas por instancia, un hilo | PC de desarrollo 1.000 (medido); VPS-1 ~500, VPS-2 ~1.000 (estimado) | medido (`tools/swarm.sh`) y estimado |
| Voz por cercanía | 230 suscripciones por núcleo | estimado (LiveKit) |

Máquinas (OVH, sin IVA): VPS-1 3,81 €, VPS-2 7,21 €, SYS-3 (8 núcleos dedicados) 41,99 €. Hasta
1.000 en una instancia basta un hilo; más allá habría que repartir por regiones.

## Aparato

Todo **estimado** (fuente: estudio de límites, 13-10). La ciudad se diseña al nivel B: lo que entra
en Quest entra en todo.

| | A · escritorio WebGPU | B · Quest 3 / Pico 4 | C · móvil medio | D · móvil viejo |
|---|---|---|---|---|
| Triángulos en pantalla | 2–3 M | 300–500 k por ojo | 300–500 k | 150–250 k |
| Draw calls | ≤ 1.500 | ≤ 150 por ojo | ≤ 150 | ≤ 80 |
| Texturas (KTX2) | ≤ 1 GB | ≤ 256 MB | ≤ 256 MB | ≤ 128 MB |
| Luces | varias + sombras | sol + 2 sin sombra | sol + 1 | sol |
| Avatares completos | 60–100 | 12–25 | 12 | 6 |
| Figuras horneadas | miles | 300–500 | 200 | 100 |
| Fuentes de audio | 32 | 16 | 8 | 4 |
| Descarga por zona | ≤ 60 MB | ≤ 40 MB | ≤ 30 MB | ≤ 15 MB |
| Hasta poder jugar | ≤ 15 MB | ≤ 12 MB | ≤ 10 MB | ≤ 6 MB |
| fps objetivo | 60 | 72 | 30 | 30 |

## Navegador, gráfica y red

| Eje | Estado |
|---|---|
| Chromium | e2e pasa (medido, `tools/e2e.mjs`) |
| Gecko (Firefox) | e2e pasa (medido, `tools/e2e.mjs`) |
| WebKit (Safari) | **sin probar**: Playwright WebKit no corre en la máquina de desarrollo; prueba manual |
| WebGL2 | nivel Base, todos los navegadores objetivo |
| WebGPU | Chromium sí; Firefox en Windows/Mac; Safari 26+ (estimado) |
| WebSocket | transporte actual (medido, `test/server.test.ts`) |
| WebTransport | no implementado |

## Cómo se mantiene

Cambia un número en `limits.json`, no en esta página; cuando una prueba lo mida, pasa a `measured`
con `test` y `date`. El test falla si un valor medido apunta a un archivo que no existe.
