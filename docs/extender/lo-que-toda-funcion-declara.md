# Lo que toda función declara (accesibilidad, V1: si falta, la función no se carga)

La accesibilidad va en la declaración, no aparte. `defineFeature` rechaza la función (y el error dice qué
falta) si:
- un **intento** no tiene `spoken`: el verbo como lo diría una persona («saludar», «abrir la puerta»);
- un **evento** no tiene `announce`: lo que alguien **oye y lee** cuando pasa —
  `announce: { text: "Gesto: {gesto}", sound: "suave", importance: 1, who: "quien" }` — o `announce: "silent"`
  si no se ve ni se oye nada. `{campo}` mete el valor de un campo; `sound` es uno de los del motor
  (`SOUNDS`: suave, aviso, exito, error, paso, campana, magia); `importance` 0 ambiente, 1 normal, 2 importante,
  3 seguridad; `at: ["x", "z"]` (dónde, en metros) o `who: "quien"` (sobre qué persona);
- algo que se **pone en el mundo** (`state.set(…, { at })`) no tiene ficha: `state.card` con `role`
  (`ROLES`: persona, puerta, boton, cartel, objeto, lugar, salida, criatura, punto, pantalla, asiento), `name`
  («Puerta {key}»), y si hace falta `description`, `importance`, `actions` (sus intentos) y `at`.

Lo que se anuncia llega a la página por `view.announce` (la plaza lo pone en una región `aria-live`, que leen
NVDA, VoiceOver y TalkBack; la voz propia del motor es V3) y queda en `features.announcements`; las fichas,
en `features.cards()`. Un agente de IA lee lo mismo en el catálogo. Ejemplos: `features/gestos` (anuncio con
`who`) y `features/despertar` (anuncio con `at`). Razones y fuentes: `docs/SABER.md` §3.6.
