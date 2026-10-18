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
| `100Avatars_027_Astrodisco.vrm` | Astrodisco (nº 27, ronda 1) | `3b48bbbbfa5c49183e924e78c21acc10dff286cea973993c42d04a768d8c847a` | 189.080 | 2.724 | <https://github.com/PolygonalMind/100Avatars/blob/ff07c2ad0017819c4e5366656ee1e5bcc4029bd4/100Avatars_027/100Avatars_027_Astrodisco.vrm> |
| `100Avatars_029_Skelly.vrm` | Skelly (nº 29, ronda 1) | `9839eebf009b3eb7bfb76b2a167255bd95c84a2aa3d67c38e1da238dc45896ae` | 250.228 | 2.880 | <https://github.com/PolygonalMind/100Avatars/blob/ff07c2ad0017819c4e5366656ee1e5bcc4029bd4/100Avatars_029/100Avatars_029_Skelly.vrm> |
| `100Avatars_051_Polybot.vrm` | Polybot (nº 51, ronda 1) | `bb6f0f1bad0ad504684c185e377fd3909d45b61d28bb0545c94a49fedfe70675` | 235.824 | 2.130 | <https://github.com/PolygonalMind/100Avatars/blob/ff07c2ad0017819c4e5366656ee1e5bcc4029bd4/100Avatars_051/100Avatars_051_Polybot.vrm> |

Los tres: VRM 0.x (exportador de Blender de saturday06 2.4.8), una malla, un material MToon, una textura,
16 formas (visemas y parpadeo), 52 huesos humanoides (Polybot 31: sin dedos).

**E3 (2026-10-18): aligerados sin cambiar lo que se ve** con `node tools/aligerar-activos.ts` (meshoptimizer MIT,
@jsquash Apache-2.0). Los originales de la fuente pesaban 1.033.356 / 1.169.152 / 997.048 B con sha256
`6385ea72…`, `3b789306…`, `e255bace…` (los de la fuente, enlace de arriba). Cambia solo cómo se guardan los bytes:
textura PNG → WebP sin pérdida (mismos píxeles; se quita su nota de color «GIMP built-in sRGB», que es sRGB),
las 16 formas → accesores dispersos (solo los vértices que se mueven; el resto llevaba restos de redondeo ≤ 0,24 µm),
y cada búfer con `EXT_meshopt_compression` sin filtro (sin pérdida). El JSON (metadatos VRM con la licencia CC0,
huesos, materiales, formas) es el mismo campo a campo; la herramienta lo comprueba y compara cada accesor.

Para añadir otro: copia el `.vrm` aquí, escribe su fila con la fuente, y `node tools/avatares-catalogo.ts` (rechaza lo
que no diga CC0 dentro o pase de 10.000 triángulos); `test/avatares.test.ts` lo comprueba.
