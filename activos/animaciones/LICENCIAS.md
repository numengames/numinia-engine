# Animaciones de la casa (.vrma) — licencias (J1)

Todas salen de **Quaternius — Universal Animation Library (UAL1, «Standard»)**, CC0:
- <https://quaternius.com/packs/universalanimationlibrary.html>: «License: CC0» y «Free to use in personal,
  educational and commercial projects (CC0 License)» (página leída el 2026-10-15; copia en
  `work/movimientos/raw/quaternius/ual1.html`).
- <https://quaternius.itch.io/universal-animation-library> (licencia del recurso CC0).

Original: `work/movimientos/raw/quaternius/UAL1_Standard.fbx` (24.908.124 bytes, sha256 en `conversion.json`).
Un original → dos construcciones: estos `.vrma` para este motor (`tools/vrma/convertir.mjs`) y los `.glb` para Hyperfy
(`work/movimientos/conversion/`). Nunca se edita una construcción a mano: se vuelve a lanzar el conversor.

| Fichero | Clip de UAL1 | Para qué |
|---|---|---|
| `quieto.vrma` | `Idle_Loop` | de pie, respirando |
| `andar.vrma` | `Walk_Loop` | andar (paso natural 0,80 alturas de cadera por segundo) |
| `trotar.vrma` | `Jog_Fwd_Loop` | andar deprisa / trotar (5,18 alturas de cadera por segundo) |
| `correr.vrma` | `Sprint_Loop` | correr, más de 5 m/s (7,77 alturas de cadera por segundo) |
| `saltar.vrma` | `Jump_Loop` | en el aire |

Los sha256 y bytes de cada uno están en `activos/avatares/catalogo.json`; la conversión (duraciones, pasos medidos,
huesos) en `conversion.json`.
