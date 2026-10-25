# Dardos en VR: el gesto del lanzador profesional (v14)

Proyecto: Numinia · motor web 3D — dardos en VR
Para: Pablo
De: Ursa (agente)
Fecha: 2026-10-22
Estado: implementado en la rama `vr/v14-lanzar-dardo`, sin push ni PR. Umbrales sin calibrar en el casco.

## Qué pidió Pablo
Grabación del 22-10 (`motor-vr/grabaciones/manos-20261022-1010Z`, 01:33–01:47): «tendrías que estudiar los movimientos de dardos de los
lanzadores profesionales, y cuanto más te acerques a un movimiento de dardos de un lanzador profesional, más fácil es que se meta en la diana».

## Qué dicen las fuentes (todas leídas; texto en `work/motor-vr/v14-dardos/raw/`)
| Hallazgo | Fuente leída |
|---|---|
| Cinco fases: preparación, **retroceso** (el dardo hacia la cara; el brazo queda quieto y solo trabaja el antebrazo), **aceleración** (fluida y recta; lo lateral pasa directo al dardo y da dispersión horizontal), **suelta** (codo ~150–160°; antes sube, después baja; es el punto más sensible) y remate (brazo hacia la diana). | mydart.app, «The Five Phases of a Dart Throw» (2026-06-22) — web divulgativa, no revisada por pares |
| El lanzamiento dura menos de 200 ms. Un profesional (top 60 PDC) regula mejor que un recreativo la aceleración máxima del brazo, su velocidad máxima (desv. típica 0,1 vs 0,2 m/s, tal como sale impreso) y el tiempo del lanzamiento (0,15 s vs 0,67 s). Una sola persona profesional + dos recreativas, 150 tiros. | BJSM 45(15):A10.1, resumen de congreso (Cork) |
| Los expertos usan dos estrategias: soltar en una ventana de tiempo más larga gracias a una trayectoria de la mano que compensa el error de tiempo, o clavar el instante de la suelta (error ~1 ms). Los novatos no hacen ninguna. 8 expertos y 8 novatos, 60 tiros, 480 Hz. | Nasu, Matsuo, Kadota 2014, PLOS ONE 9(2):e88536 (PMC3922883) |
| En expertos, la velocidad del dardo y la aceleración angular de la muñeca **en la suelta** se correlacionan con la anchura de la ventana de suelta que acierta. 8 expertos, 42 tiros, 200 Hz. | Tran, Yano, Kondo 2019, PLOS ONE 14(10):e0223837 |
| Un grupo de expertos suelta con el codo más bajo y más flexión del codo durante el golpe, lo que alarga esa ventana. | Nasu & Matsuo 2015, Taiikugaku Kenkyu (resumen en inglés) |
| La velocidad de suelta depende sobre todo de la flexo-extensión del antebrazo (modelo de 3 segmentos, 1 sujeto, 10 tiros). | Omar et al. 2020, doi 10.1007/978-981-15-3270-2_17 |
| El modelo de lanzamiento preciso da como más exacto el tiro por encima del hombro a unos **5,5 m/s** con radio de curvatura 0,8 m. Es un modelo, no una medición. | «Optimal strategies for throwing accurately», PMC5414278, §5.1 |
| Distancia reglamentaria 2,37 m; la suelta real ocurre a unos 2,07 m de la diana de media (225 tiros, 19 aficionados hábiles). | James & Potts 2018, Sports Engineering 21:347 (SHURA) |

No leídos del todo (solo cabecera o sin texto): la Konstanz CPA 5743 (título), IEEE 6127278 (resumen), JHSE (resumen), `cce2016` (descarga vacía),
Smeets et al. 2002 (ficha). No se citan para nada que dependa de su cuerpo.

## Lo que el casco puede ver y lo que no
Un mando o una mano rastreada dan **la posición de la mano**, no el brazo. Se puntúa lo que se ve: recta, aceleración, velocidad, retroceso.
No se puntúa el brazo quieto ni el ángulo del codo.

## Lo que hace el código
- `features/dardos/gesto.ts` (puro): `valorarGesto` da 0–1 con cuatro partes y pesos 0,35 recta · 0,25 aceleración · 0,25 velocidad · 0,15 retroceso.
  - **recta**: ángulo lateral de la velocidad frente al eje de la diana (≤5° pleno, ≥25° nada) y desvío lateral eficaz de los últimos 200 ms (≤1 cm / ≥5 cm).
  - **aceleración**: velocidad al soltar ÷ pico del golpe (≥0,9 pleno, ≤0,5 nada): la mano aún acelera al soltar.
  - **velocidad**: banda de 4 a 6,5 m/s plena (el 5,5 del modelo en medio), nada por debajo de 1,5 ni por encima de 9,5.
  - **retroceso**: la mano se alejó de la diana ≥12 cm antes del golpe.
  - `ayudaDe(puntos) = 0,6 × puntos`: crece de forma lineal con el gesto y **nunca llega al 100 %** (parcial, nunca total).
- `lanzamiento(cara, p, v, ayuda)`: la ayuda acerca el punto apuntado al centro con peso (ρ/1)² (casi no toca un tiro al centro; mete en la diana uno que se iría fuera) y la fuerza hacia `FUERZA_IDEAL`.
  La lectura de la mano queda en `crudo`; el servidor sigue doblando y esparciendo lo que recibe (`aterrizaje`).
- `apps/plaza/dardos-vr.ts`: guarda 700 ms de muestras (antes 300), puntúa en la suelta, pasa la ayuda, vibra más cuanto mejor el gesto y dice una frase
  sobre la peor parte («Lleva el dardo atrás…») o «¡Gesto de profesional!» a partir de 0,8.

## Verificado
- `node --test test/dardos-gesto.test.ts test/dardos-vr.test.ts test/dardos.test.ts`: 32 pruebas. Los gestos sintéticos siguen la forma de la tabla y
  se comprueba: un gesto de profesional puntúa ≥0,85, cada defecto baja su parte, la ayuda crece con la puntuación y no pasa de 0,6, `ayuda 0` es el
  comportamiento anterior, y pasando por `aterrizaje` del servidor el tiro con ayuda cae más cerca del centro.
- `tools/e2e-piernas/dardos-vr.mjs` (IWER Quest 3): 6 de 6 pasadas verdes (una de ellas necesitó el segundo intento del propio leg, que reintenta por la carga de la máquina); las comprobaciones de dirección y distancia ahora leen `crudo` y hay dos nuevas (la ayuda sale de la puntuación y es ≤ 60 %; lo enviado está más cerca del centro y de la fuerza ideal que lo crudo).
- `npm test` 2022/2022, `npm run gates` en verde, `npm run build` bien.

## Límites y siguiente paso
- Los umbrales son decisiones de diseño tuneadas a mano alrededor de los hallazgos, no constantes medidas. Hay que **calibrarlos con Pablo en el casco**
  (y con los datos de `rastro()` de varios tiros: `ultimo()` ya trae `gesto`).
- La ayuda acerca al **centro**, no a donde apunta la persona: ayuda a meter el dardo en la diana, pero empuja un triple 20 hacia el interior. Alternativa: ayudar
  hacia donde señala el mando al empezar el golpe. Es decisión de producto.
- La velocidad de suelta se sigue leyendo con una ventana de 120 ms (existente) y en un golpe que acelera durante ~150 ms la lee ~60 ms tarde (más floja que la real); la
  puntuación usa 60 ms. Unificar las dos lecturas cambiaría la fuerza de todos los tiros: no se ha tocado.
- La ayuda se calcula en el cliente. No abre una puerta nueva: el servidor ya acepta cualquier `(x, y, fuerza)` que mande un cliente.
