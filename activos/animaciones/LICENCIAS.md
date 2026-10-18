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

### La rueda de movimientos (J7b)

Los movimientos que un jugador elige en la rueda (`features/gestos/movimientos.ts`), del mismo original y con el mismo
conversor. Se descargan uno a uno, la primera vez que alguien cerca hace ese movimiento; nunca al entrar.
Fuera a propósito (12 de los 45 clips de UAL1): `A_TPose` (la pose de referencia), los ciclos que necesitan desplazarse
(`Walk_Formal_Loop`, `Crouch_Fwd_Loop`, `Swim_Fwd_Loop`, `Jump_Start`, `Jump_Land`), los gemelos con desplazamiento de
raíz `Roll_RM` y `Sword_Attack_RM` (la cadera se sale de la cápsula), dos poses de un solo fotograma (`Pistol_Aim_Down`,
`Pistol_Aim_Neutral`) y dos salidas (`Sitting_Exit`, `Spell_Simple_Exit`: andar termina el movimiento al momento).

| Fichero | Clip de UAL1 | Para qué |
|---|---|---|
| `saludar.vrma` | `Idle_Loop + saludo` | saludar con la mano (UAL1 gratis no trae saludo: el cuerpo de `Idle_Loop` y el brazo derecho escrito en `tools/vrma/convertir.js`; obra derivada, también CC0) |
| `hablar.vrma` | `Idle_Talking_Loop` | hablar con las manos |
| `antorcha.vrma` | `Idle_Torch_Loop` | alzar una antorcha |
| `bailar.vrma` | `Dance_Loop` | bailar |
| `agachado.vrma` | `Crouch_Idle_Loop` | en cuclillas |
| `caer-muerto.vrma` | `Death01` | caer y quedarse en el suelo |
| `conducir.vrma` | `Driving_Loop` | hacer que conduce (sentado en el aire) |
| `arreglar.vrma` | `Fixing_Kneeling` | arrodillarse y arreglar algo |
| `golpe-pecho.vrma` | `Hit_Chest` | encajar un golpe en el pecho |
| `golpe-cabeza.vrma` | `Hit_Head` | un golpe en la cabeza («¡Ay!») |
| `usar.vrma` | `Interact` | tocar algo delante |
| `coger.vrma` | `PickUp_Table` | coger algo de una mesa |
| `pistola-arriba.vrma` | `Pistol_Aim_Up` | manos arriba (se queda en la última pose) |
| `pistola-guardia.vrma` | `Pistol_Idle_Loop` | apuntar con las dos manos |
| `pistola-recargar.vrma` | `Pistol_Reload` | recargar |
| `pistola-disparar.vrma` | `Pistol_Shoot` | disparar |
| `directo.vrma` | `Punch_Cross` | golpe fuerte |
| `jab.vrma` | `Punch_Jab` | golpe rápido |
| `empujar.vrma` | `Push_Loop` | empujar algo pesado |
| `rodar.vrma` | `Roll` | voltereta en el sitio |
| `sentarse.vrma` | `Sitting_Enter` | sentarse (entrada) |
| `sentado.vrma` | `Sitting_Idle_Loop` | sentado |
| `sentado-hablar.vrma` | `Sitting_Talking_Loop` | sentado hablando |
| `hechizo-preparar.vrma` | `Spell_Simple_Enter` | preparar un hechizo (entrada) |
| `hechizo-sostener.vrma` | `Spell_Simple_Idle_Loop` | sostener el hechizo |
| `hechizo-lanzar.vrma` | `Spell_Simple_Shoot` | lanzar un hechizo |
| `flotar.vrma` | `Swim_Idle_Loop` | nadar en el sitio |
| `espada-tajo.vrma` | `Sword_Attack` | golpe de espada |
| `espada-guardia.vrma` | `Sword_Idle` | espada en guardia |

Los sha256 y bytes de cada uno están en `activos/avatares/catalogo.json`; la conversión (duraciones, pasos medidos,
huesos) en `conversion.json`.
