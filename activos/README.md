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
| `robot/RobotExpressive.glb` | Robot animado (464 kB, 14 animaciones) | CC0 (`robot/LICENSE.txt`) | Tomás Laulhé (Quaternius), ejemplos de three.js |
| `avatares/*.vrm` | 3 avatares VRM de jugador (J1; 974–1.142 kB, 2.130–2.880 triángulos) | CC0 dentro del fichero y en la fuente (`avatares/LICENCIAS.md`) | Polygonal Mind, 100Avatars |
| `animaciones/*.vrma` | quieto, andar, trotar, correr, en el aire (J1) | CC0 (`animaciones/LICENCIAS.md`) | Quaternius UAL1 → `tools/vrma/convertir.mjs` |
| `texturas/*.webp` | Suelos (H4): hierba, tierra, arena, roca, nieve; color 1k + relieve 512 px (52–375 kB cada uno) | CC0 (`texturas/LICENCIAS.md`) | Poly Haven, recodificados a WebP; listados en `features/entorno/suelos.json` |
| `cielos/kloofendal_48d_partly_cloudy_puresky_1k.hdr` | Luz de entorno HDR del preset «nublado» (1,4 MB, se baja solo si se usa) | CC0 (`texturas/LICENCIAS.md`) | Poly Haven (Greg Zaal, Jarod Guest) |

Los avatares y animaciones que dibuja la plaza están en `avatares/catalogo.json` (lo escribe
`node tools/avatares-catalogo.ts`, que rechaza lo que no sea CC0 dentro del fichero o pase de 10.000 triángulos).
