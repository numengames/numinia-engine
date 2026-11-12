# Keymap v1: one key, one function

`apps/plaza/teclas.ts` is the ONE table of the keys of the world. Every listener of the page asks it
(`teclas.es(event, "bolsa")`), Settings → Controls draws it in two columns and F1 and the bar's key badges read the key
in effect from it. Pure module: tests build their own with `crearTeclas(new Map-backed store)`.

| Key | Function | | Key | Function |
|---|---|---|---|---|
| W A S D / arrows, Shift, Space | walk, run, jump | | I | bag |
| E | main action: talk, take, sit, accept, reel in | | C | character sheet |
| Q | opposite: drop, decline, let the line go | | B | build |
| V | microphone, hold to talk (Settings: press to toggle) | | Tab | people |
| Ctrl+H | hide / show the whole interface | | M J N O P K G H U ` | unchanged |

- **Default / Yours.** A player's choice is saved per browser (`numinia.teclas`); empty = the default. A key somebody else
  has says who and asks swap or cancel (`asignar` refuses, `intercambiar` swaps); «Reset all» empties Yours.
- **Adding an action:** add a row to `ACCIONES` (a test fails if two actions share a default key), call `teclas.es` in the
  listener, show `teclas.etiqueta(id)` wherever the key is named.
- **Microphone privacy:** never opens by itself; push-to-talk by default; while open a fixed red «Your microphone is on».
- Build mode, photo mode and the dart board keep their own keyboard while open (`OTROS_MODOS`).
