# Dados (v1): los tira el servidor y todos ven lo mismo

`features/dados` es la tirada de una mesa de rol: **nadie decide un dado en su página**. Pides una tirada y el
servidor saca cada dado, la numera y da los mismos valores a todos los que están cerca.

- **Intención** `tirar {sitio, dados, oculta}`: `dados` es una expresión («2d6+1», «d20», «3d8-2»; de 1 a 10 dados de 2,
  3, 4, 6, 8, 10, 12, 20 o 100 caras, más o menos 0-99). `sitio` = la torre que tienes al lado (vacío = donde estás);
  vacía la expresión, la torre tira sus dados de siempre (o 1d20). `oculta` = una tirada tras la pantalla: los demás
  reciben que tiraste, sin valores.
- **Azar justo:** cada dado sale de `crypto.getRandomValues` (el azar del sistema) con muestreo de rechazo, para que
  2³² % caras no favorezca las caras bajas (`dado()`; el test cuenta 60.000 d6). Los tests pasan su propia fuente.
  Cada tirada lleva el número siguiente del mundo (`n`): «la tirada 41» es la misma para toda la mesa.
- **Evento** `tirada {quien, sitio, n, dados, valores, mod, total, oculta, texto}` a quien esté a `CERCA_M` (30 m):
  el anuncio la dice en palabras («Ana tira 2d6+1: 4 · 3 +1 = 8», «¡crítico!» y «pifia» en un d20) y la página pone
  la carta de dados (`apps/plaza/dados.ts`) y una etiqueta sobre la cabeza de quien tiró (se ve también en VR).
- **Torre de dados** = una cosa del mundo (estado con `at`, ficha e `interact`): «E: tirar los dados» a su lado, una
  fila de botones (d4 … d100, 2d6, «en secreto») y su última tirada a la vista (`ultima`) para quien llega después.
  Un mundo trae las suyas en `MUNDO_DIR/dados.json` (`{ "torres": [{ id, nombre, x, y, z, radio, dados }] }`); sin
  fichero no hay torre, y se tira igual donde estés.
- **Dados 3D en la bandeja** (lote 8, primera historia: d6 y d20, en PC): la tirada que oyes cae en 3D sobre la bandeja de
  la torre y se queda quieta con la cara que sacó **el servidor** hacia arriba (la caída es una función pura de la tirada
  numerada: dos pantallas dibujan lo mismo; `packages/render/src/dados-caida.ts`, `dados-3d.ts` se carga con la primera
  tirada). La bandeja se dice en `dados.json`: `"bandeja": { "dx": 0.4, "dz": 0.62, "alto": 0.89, "ancho": 0.8, "fondo": 0.6 }`
  (dónde está respecto a la torre, y su tamaño en metros; sin ella, un trozo de suelo de 0,8 × 0,6 m en la torre). Una
  bandeja pequeña encoge los dados, no los saca fuera. Sin dibujar todavía: d4, d8, d10, d12, d100 (siguen la carta y la
  etiqueta), tiradas ocultas (los demás no ven valores), móviles y gafas (historia 2).
- **Chat** (cualquier aparato con teclado, VR incluida): `/tirar 2d6+1`, `/tirar d20 oculta`; al lado de una torre,
  la tirada es de la torre.
- **Lo que no hace (todavía):** dados 3D de d4/d8/d10/d12/d100, en móvil y en gafas (la carta y la etiqueta los sustituyen), tiradas con
  ventaja o «quedarse con los mejores», y un diario de tiradas que viaje en el zip.
