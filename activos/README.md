# activos — la biblioteca de la casa

Los ficheros con los que se hacen las cosas del mundo (H1). Solo **CC0 u obra propia**, cada uno con su licencia
al lado (`docs/SABER.md` §3.3: nada de Mixamo, ni bases de VRoid, ni «gratis» que no sea CC0).

- El servidor los sirve **por su contenido**: `GET /a/<sha256>.<ext>` (`packages/server/src/activos.ts`). Al
  arrancar calcula el sha256 de cada fichero de esta carpeta; aquí los nombres pueden ser legibles.
- Lo que se puede colocar está en `features/objetos/biblioteca.json` (nombre, sha256, fichero, licencia, autor,
  fuente). `test/objetos.test.ts` comprueba que cada sha256 es el de su fichero.
- Un fichero nunca cambia bajo su sha256: si cambias uno, cambia su sha256 en la biblioteca (y lo ya colocado con
  el viejo deja de encontrarlo). Para un modelo nuevo, añade fichero + licencia + entrada en la biblioteca.
- Lo que suba la gente (H9) no va aquí: va a `ACTIVOS_DIR`, ya nombrado por su sha256.

| Fichero | Qué es | Licencia | De dónde |
|---|---|---|---|
| `casa/bloque.glb` | Bloque de 1 m apoyado en el suelo, piedra cálida (1,6 kB) | CC0 (obra propia) | `node tools/hacer-bloque.mjs` (siempre los mismos bytes) |
| `graboso/graboso-cabeza.glb` | La cabeza fina del Graboso (M18b, MIS-247): oso electrónico, 1.784 triángulos, un material, tres nodos (`concha`, `rasgos`, `piloto`; 63 kB). La página la pide por su contenido la primera vez que sale la reliquia; sin ella se queda la cabeza sencilla | CC0 (obra propia, `graboso/LICENCIA.txt`) | `node tools/hacer-graboso.mjs` (siempre los mismos bytes) |
| `robot/RobotExpressive.glb` | Robot animado (464 kB, 14 animaciones) | CC0 (`robot/LICENSE.txt`) | Tomás Laulhé (Quaternius), ejemplos de three.js |
| `avatares/*.vrm` | 3 avatares VRM de jugador (J1; 185–245 kB tras E3, 2.130–2.880 triángulos) | CC0 dentro del fichero y en la fuente (`avatares/LICENCIAS.md`) | Polygonal Mind, 100Avatars |
| `animaciones/*.vrma` | quieto, andar, trotar, correr, en el aire (J1) | CC0 (`animaciones/LICENCIAS.md`) | Quaternius UAL1 → `tools/vrma/convertir.mjs` |
| `texturas/*.webp` | Suelos (H4): hierba, tierra, arena, roca, nieve; color 1k + relieve 512 px (52–375 kB cada uno) | CC0 (`texturas/LICENCIAS.md`) | Poly Haven, recodificados a WebP; listados en `features/entorno/suelos.json` |
| `sonidos/<id>/<id>-NN.opus` + `.m4a` | Los sonidos de la casa (S6): 27 ids, 89 variantes, 178 ficheros (479 kB en total; ninguno pasa de 18 kB). El `.m4a` es el respaldo para Safari viejo e iOS | CC0 (`sonidos/LICENCIAS.md`) | Kenney.nl y OpenGameArt (CC0), recortados y recodificados; listados en `features/sonido/catalogo.json` con su sha256 |
| `cielos/kloofendal_48d_partly_cloudy_puresky_1k.hdr` | Luz de entorno HDR del preset «nublado» (1,4 MB, se baja solo si se usa) | CC0 (`texturas/LICENCIAS.md`) | Poly Haven (Greg Zaal, Jarod Guest) |
| `cielos/kloofendal_48d_partly_cloudy_puresky_1k.hdr` | Luz de entorno HDR del preset «nublado» (801 kB tras E3, 466 kB en gzip; se baja solo si se usa) | CC0 (`texturas/LICENCIAS.md`) | Poly Haven (Greg Zaal, Jarod Guest) |

Los avatares y animaciones que dibuja la plaza están en `avatares/catalogo.json` (lo escribe
`node tools/avatares-catalogo.ts`, que rechaza lo que no sea CC0 dentro del fichero o pase de 10.000 triángulos).

Retratos (rediseño v2, «Tú»): cada avatar del catálogo tiene tres renders WebP en `apps/plaza/public/retratos/`
(`<id>-busto.webp` 512×512 para la tarjeta de arriba a la izquierda; `<id>-cuerpo.webp` y `<id>-espalda.webp` 512×768
para la ficha «Tú»), hechos con `node tools/retratos.mjs [id…]` (three + @pixiv/three-vrm + MeshoptDecoder en un
Chromium sin ventana, brazos relajados, fondo transparente; `CHROME=/ruta/a/chrome` si playwright-core no trae el
suyo). Son renders de los mismos VRM CC0 (`avatares/LICENCIAS.md`, «Retratos»). Tras añadir un avatar al catálogo,
vuelve a lanzarlo: `test/tu-logica.test.ts` falla mientras falte un retrato. Un avatar subido por alguien no tiene
retrato: la ficha y la tarjeta dibujan la silueta de la casa.

E3: avatares, animaciones y cielo pasan por `node tools/aligerar-activos.ts` (sin pérdida en VRM/VRMA: el mismo JSON y
los mismos valores; el cielo con 6 de sus 8 bits de mantisa, ≤ 1,6 % por píxel). Tras cambiar uno: `node tools/aligerar-activos.ts && node tools/avatares-catalogo.ts`.
