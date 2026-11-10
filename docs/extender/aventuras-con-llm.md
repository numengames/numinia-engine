# Writing an adventure with an LLM (J16)

An adventure is a folder of JSON files (`docs/extender/misiones-y-personas-pnj.md` is the full reference). An LLM can write
one well if you give it a closed brief and a checker to argue with. The checker is `node tools/aventura.ts <folder>`: it
reads the folder like a server would, prints every problem with its file and path, and exits 1 if there is any. No server,
no network, no API key. The loop is: **brief → draft → check → paste the errors back → check again → a person plays it**.

This page is tested: `test/aventuras-con-llm.test.ts` takes the files printed below *from this page*, writes them to a
folder, runs the checker on it and plays the quest to the end through the real server plug. If the formats change and
this page does not, that test fails.

## 1. The brief (copy, fill the `<…>`, send)

> You write an adventure for the numinia-engine as plain JSON files, nothing else. Reply with one fenced block per file,
> its path in the line before it. Rules:
> 1. Folders: `ficha.json`, `misiones/<id>.json`, `pnj/<id>.json`, `cosas/<id>.json`. Ids are lowercase `a-z0-9-` and equal the file name.
> 2. Every file has `"formato"`: `ficha@1`, `mision@1`, `pnj@1` or `cosa@1`. Keys stay as in the examples (they are Spanish: `pasos`, `tipo`, `texto`, `dialogo`…); the words players read are in <language>.
> 3. A quest has 2–5 steps in order. Step types you may use: `coge` (`cosa`: id of a thing), `llega_a` (`x`, `z`, `radio`, `lugar`), `habla_con` (`pnj`: id of a person). Nothing else.
> 4. Every id a step or dialogue names must exist as a file. Every person who gives a quest has an option with `{"tipo":"dar_mision","mision":"<id>"}`. A person a `habla_con` step names has, in the entry for that step, an option with `{"tipo":"avanzar_paso","mision":"<id>"}`.
> 5. A dialogue has `entradas` (first match wins; the last one has no `si`) and `nodos`; each node has `texto` and 1–4 `opciones`; every `ir` names a node of the same person; every conversation can end with `{"tipo":"despedir"}`.
> 6. Put everything inside x and z between -30 and 30, things and people at least 8 m apart, and a `radio` of 2–4.
> 7. Add a `"notas"` string to each file saying why it is there.
>
> The story: <two or three sentences: who asks, what they need, where, what the player gets>.
> Here is a working adventure for the shape. Copy its structure, not its words: <paste the files of §3>.

Why these rules: they keep the model on the subset of the format that is checked and playable. Rule 6 is not enforced by
the checker (see §4).

## 2. The loop

1. Save the model's files into a folder, for example `mi-aventura/`.
2. `node tools/aventura.ts mi-aventura`
3. If it prints `Todo en orden.` go to §4. If not, paste the `✗` lines to the model, exactly as printed, and say:
   "Fix only these; return the complete corrected files." Each line starts with the file and the JSON path, so the
   model can find the field. Two or three rounds are normal.
4. Do not let it "fix" the checker's complaint by deleting the step or the dialogue: diff the files between rounds.

A typical mistake and what the checker says. The model names a person who has no file:

```
$ node tools/aventura.ts mi-aventura
  ✗ misiones/relight-the-lamp: pasos[2].pnj: no hay ningún pnj «marta» (hay: ninguna)
1 problema(s): lo que los tiene no se carga.
```

(the test provokes this on purpose and checks that the line names the quest file and `pasos[2].pnj`; the wording after the
colon is the engine's and may change.) Note the last line: **a file that has a problem is not loaded**, so a clean run
matters more than a pretty draft.

## 3. A worked example: «The lighthouse lamp»

Written by following §1 with the story *«Marta, the lighthouse keeper, lost the lamp of her light on the dunes. The player
fetches it, climbs to the lighthouse and reports to her.»* The files below are the ones the test reads; each fence is
preceded by its path in the form `file: <path>`.

file: ficha.json
```json
{
  "formato": "ficha@1",
  "nombre": "The lighthouse dunes",
  "descripcion": "Marta keeps the lighthouse. Her lamp is lost in the dunes and the ships are coming.",
  "notas": "Written following docs/extender/aventuras-con-llm.md."
}
```

file: misiones/relight-the-lamp.json
```json
{
  "formato": "mision@1",
  "id": "relight-the-lamp",
  "titulo": "Relight the lamp",
  "descripcion": "Marta lost the lamp of the lighthouse in the dunes. Find it, take it up to the lighthouse and tell her.",
  "pasos": [
    { "id": "lamp", "tipo": "coge", "texto": "Find the brass lamp in the dunes", "cosa": "brass-lamp" },
    { "id": "tower", "tipo": "llega_a", "texto": "Climb to the lighthouse", "x": 20, "z": 0, "radio": 4, "lugar": "Lighthouse" },
    { "id": "marta", "tipo": "habla_con", "texto": "Tell Marta the lamp is back", "pnj": "marta" }
  ],
  "recompensas": [
    { "tipo": "insignia", "id": "keeper-of-the-light", "nombre": "Keeper of the light" }
  ],
  "textos": {
    "aceptada": "It is in your quest book (key J).",
    "completada": "The light is on again."
  },
  "notas": "Three steps, one of each kind. Marta gives it and closes it."
}
```

file: pnj/marta.json
```json
{
  "formato": "pnj@1",
  "id": "marta",
  "nombre": "Marta, the keeper",
  "voz": "mujer-mayor",
  "descripcion": "Keeps the lighthouse. She has lost her lamp.",
  "posicion": { "x": 2, "z": -4 },
  "giro": 0,
  "radio": 3,
  "dialogo": {
    "entradas": [
      { "si": { "mision": "relight-the-lamp", "estado": "hecha" }, "nodo": "thanks" },
      { "si": { "mision": "relight-the-lamp", "estado": "activa", "paso": "marta" }, "nodo": "report" },
      { "si": { "mision": "relight-the-lamp", "estado": "activa" }, "nodo": "waiting" },
      { "nodo": "hello" }
    ],
    "nodos": {
      "hello": {
        "texto": "Ships are coming and my lamp is gone. I dropped it in the dunes. Would you look for it?",
        "opciones": [
          { "texto": "I will find it.", "accion": { "tipo": "dar_mision", "mision": "relight-the-lamp" }, "ir": "go" },
          { "texto": "Not now.", "accion": { "tipo": "despedir" } }
        ]
      },
      "go": {
        "texto": "Thank you. It is a brass lamp, somewhere south-east of here. Bring it up to the lighthouse and tell me.",
        "opciones": [{ "texto": "On my way.", "accion": { "tipo": "despedir" } }]
      },
      "waiting": {
        "texto": "The brass lamp is south-east, in the dunes. Then the lighthouse.",
        "opciones": [{ "texto": "I am on it.", "accion": { "tipo": "despedir" } }]
      },
      "report": {
        "texto": "You were up there? Is the lamp in its place?",
        "opciones": [
          { "texto": "It is lit again.", "accion": { "tipo": "avanzar_paso", "mision": "relight-the-lamp" }, "ir": "thanks" },
          { "texto": "Not yet.", "accion": { "tipo": "despedir" } }
        ]
      },
      "thanks": {
        "texto": "I can see the beam from here. The ships are safe. Thank you.",
        "opciones": [{ "texto": "Glad to help.", "accion": { "tipo": "despedir" } }]
      }
    }
  },
  "notas": "Gives the quest and closes it with an explicit option, like Bruno in aventuras/ejemplo."
}
```

file: cosas/brass-lamp.json
```json
{
  "formato": "cosa@1",
  "id": "brass-lamp",
  "nombre": "Brass lamp",
  "descripcion": "The lamp Marta lost.",
  "posicion": { "x": 10, "z": 8 },
  "radio": 2,
  "aviso": "pick up the lamp",
  "apariencia": { "escala": 0.45 },
  "notas": "What the first step asks for. No model: the house block is drawn, small."
}
```

## 4. What the checker does not tell you (a person reads this)

A clean run means the files are well formed and every reference exists. It does **not** mean the adventure is good.
Before publishing, play it once and read for:

- **Reachable:** coordinates are in the world's walkable area (the checker does not know the terrain); the lamp is not inside a wall.
- **Order:** a thing or person the player needs is not locked behind the step that needs it. The test plays the example in the written order.
- **Dead ends:** each person has a way out (`despedir`) in every node and says something sensible in every quest state (`entradas`).
- **Tone and words:** names, jokes, anything that could offend or that copies someone else's text. A model can reproduce what it was trained on: you are the publisher.
- **No secrets:** nothing in `notas` or `texto` that you would not want on the page.

Then run `node tools/aventura.ts mi-aventura` a last time and start a world on it with `AVENTURA_DIR=mi-aventura`.

## 5. Not covered here

Rewards that are objects, secuencias, AI inhabitants, translations (`idiomas/`) and evaluation cards also pass through the same
checker; add them to the brief once the basic loop works, using `docs/extender/misiones-y-personas-pnj.md` as the reference.
