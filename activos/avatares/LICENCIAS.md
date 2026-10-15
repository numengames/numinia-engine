# Avatares VRM de la casa — licencias (J1)

Comprobado el 2026-10-15 (UTC). Los tres ficheros son **los mismos bytes** que el repositorio oficial: el «blob» de
git de cada uno coincide con el del árbol de `PolygonalMind/100Avatars` en el commit `ff07c2ad0017819c4e5366656ee1e5bcc4029bd4`
(rama `master`, 2024-02-07). No se ha cambiado nada dentro.

## La licencia, en los dos sitios

**Dentro de cada fichero** (metadatos VRM 0.x, `extensions.VRM.meta`, leídos con `packages/server/src/vrm.ts`):
`licenseName: "CC0"`, `commercialUssageName: "Allow"`, `allowedUserName: "Everyone"`, `violentUssageName: "Allow"`,
`sexualUssageName: "Allow"`, `author: "Polygonal Mind"`, `contactInformation: "www.polygonalmind.com"`.

**En la fuente oficial:**
- Publicación v24.02.1 del repositorio (2024-02-14), <https://github.com/PolygonalMind/100Avatars/releases>: «It
  doesn't matter if you are an individual a non-profit organization or business, the avatars are licensed under the
  CC0 License model».
- El registro Open Source Avatars de ToxSam (Daniel García, CEO de Polygonal Mind, firma el README de 100Avatars),
  <https://github.com/ToxSam/open-source-avatars> → `data/projects.json`: colecciones `100avatars-r1` y `-r2` con
  `"license": "CC0"`; su README: «100Avatars Series — Our own free avatars, no attribution needed».

## Lo que conviene saber (no cambia la licencia)
- El README de 2020 del repositorio pide «not to sell this avatars without any major modification». Es una petición,
  no una condición de CC0; aquí no se venden: se usan como avatares del motor.
- El mismo README dice que los riggearon «using Mixamo» (el auto-rigger, sobre sus propias mallas). Dentro no hay
  ningún personaje ni animación de la biblioteca de Mixamo; las animaciones que usa el motor son de Quaternius (CC0,
  `activos/animaciones/LICENCIAS.md`). Se apunta por la regla «nada de Mixamo» de `docs/SABER.md` §3.3: que Pablo lo
  confirme si quiere otra lectura.
- El repositorio no tiene fichero LICENSE (la API de GitHub dice `license: null`); la licencia está en los metadatos
  de cada VRM y en la publicación. polygonalmind.com y 100avatars.com ya no responden (comprobado el 2026-10-15).

## Ficheros

| Fichero | Avatar | sha256 | Bytes | Triángulos | Fuente |
|---|---|---|---|---|---|
| `100Avatars_027_Astrodisco.vrm` | Astrodisco (nº 27, ronda 1) | `6385ea72c79699a441a2d4590b7308170b46e140474003ee11055e0f0ba9e834` | 1.033.356 | 2.724 | <https://github.com/PolygonalMind/100Avatars/blob/ff07c2ad0017819c4e5366656ee1e5bcc4029bd4/100Avatars_027/100Avatars_027_Astrodisco.vrm> |
| `100Avatars_029_Skelly.vrm` | Skelly (nº 29, ronda 1) | `3b789306ad0e22845a3668398f7d71c93fd8f99b0a2ee6116311270655dda06c` | 1.169.152 | 2.880 | <https://github.com/PolygonalMind/100Avatars/blob/ff07c2ad0017819c4e5366656ee1e5bcc4029bd4/100Avatars_029/100Avatars_029_Skelly.vrm> |
| `100Avatars_051_Polybot.vrm` | Polybot (nº 51, ronda 1) | `e255bace0d7de8b5fc90756efc83e167080e6db97692f23623fec5f1c67c423d` | 997.048 | 2.130 | <https://github.com/PolygonalMind/100Avatars/blob/ff07c2ad0017819c4e5366656ee1e5bcc4029bd4/100Avatars_051/100Avatars_051_Polybot.vrm> |

Los tres: VRM 0.x (exportador de Blender de saturday06 2.4.8), una malla, un material MToon, una textura PNG,
16 formas (visemas y parpadeo), 52 huesos humanoides (Polybot 31: sin dedos). Unas tres cuartas partes de los bytes
son esas 16 formas: un VRM sin ellas pesaría ~250 kB (pendiente: no se usan todavía).

Para añadir otro: copia el `.vrm` aquí, escribe su fila con la fuente, y `node tools/avatares-catalogo.ts` (rechaza lo
que no diga CC0 dentro o pase de 10.000 triángulos); `test/avatares.test.ts` lo comprueba.
