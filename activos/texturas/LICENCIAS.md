# Licencias de las texturas y cielos (H4)

Todo lo de `activos/texturas/` y `activos/cielos/` es **CC0 1.0** (dominio público) de **Poly Haven**.
Comprobado el 2026-10-15 (14:26 UTC) en dos sitios: la página de licencia de Poly Haven
(<https://polyhaven.com/license>: «Our assets are all licensed as CC0») y **la página de cada activo**, cuyos
metadatos dicen `"copyrightNotice":"CC0 1.0 Universal - public domain dedication"` con
`licensePage: https://polyhaven.com/license`. CC0 no obliga a citar; lo citamos igual.

Bajado con la API pública (`https://api.polyhaven.com/files/<activo>`), versión JPG de 1k; el md5 de cada descarga
coincide con el que publica la API. **Cambio nuestro**: recodificado a WebP con ffmpeg (color: 1024 px, calidad 78;
relieve/normal: reducido a 512 px, calidad 85) para que pese ~4 veces menos. Los ficheros se sirven por su sha256
(`/a/<sha256>.webp`, `features/entorno/suelos.json`; `test/entorno.test.ts` comprueba cada sha256).

| Fichero | Activo (página) | Autor | Original (bytes, md5) | Aquí (bytes) |
|---|---|---|---|---|
| `texturas/hierba-color.webp` | [Leafy Grass](https://polyhaven.com/a/leafy_grass), 2 m | Charlotte Baglioni | diff 1k jpg, 1.195.394, `0dbc071e…` | 305.752 |
| `texturas/hierba-normal.webp` | ídem | Charlotte Baglioni | nor_gl 1k jpg, 1.466.049, `8279e096…` | 120.330 |
| `texturas/tierra-color.webp` | [Brown Mud Dry](https://polyhaven.com/a/brown_mud_dry), 1,3 m | Rob Tuytel | diff 1k jpg, 920.456, `0c0ad82f…` | 375.478 |
| `texturas/tierra-normal.webp` | ídem | Rob Tuytel | nor_gl 1k jpg, 1.539.092, `a842517b…` | 133.790 |
| `texturas/arena-color.webp` | [Sand 01](https://polyhaven.com/a/sand_01), 1,5 m | Rob Tuytel | diff 1k jpg, 485.088, `c914c8ed…` | 119.352 |
| `texturas/arena-normal.webp` | ídem | Rob Tuytel | nor_gl 1k jpg, 877.821, `369b82aa…` | 74.910 |
| `texturas/roca-color.webp` | [Aerial Rocks 02](https://polyhaven.com/a/aerial_rocks_02), 50 m | Rob Tuytel | diff 1k jpg, 785.923, `b5795e9b…` | 247.148 |
| `texturas/roca-normal.webp` | ídem | Rob Tuytel | nor_gl 1k jpg, 1.177.932, `66fcad0f…` | 92.192 |
| `texturas/nieve-color.webp` | [Snow 02](https://polyhaven.com/a/snow_02), 2 m | Rob Tuytel | diff 1k jpg, 325.497, `fc54766c…` | 52.374 |
| `texturas/nieve-normal.webp` | ídem | Rob Tuytel | nor_gl 1k jpg, 1.081.858, `f16b5701…` | 74.884 |
| `cielos/kloofendal_48d_partly_cloudy_puresky_1k.hdr` | [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | Greg Zaal (original), Jarod Guest (cielo) | 1k hdr, 1.435.119, `c6949868…` | igual (sin tocar) |

El mapa de relieve del **agua** no es un fichero: lo calcula `packages/render/src/elementos.ts` (suma de ondas;
obra propia). Las partículas (fuego, humo, chispas, polvo) tampoco usan imágenes: discos suaves en el shader.
