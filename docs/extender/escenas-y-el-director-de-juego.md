# Escenas y el Director de juego (N6)

Quien **dirige** una aventura o un evento (el Director de Juego, DJ, del manual: presenta escenas y da voz al mundo,
no decide por nadie) es quien tiene el permiso de la organización **«Gestionar rituales»** (`manage-rituals`, STD-052;
en la plantilla «Comunidad», Moderación; los dueños y Administración, también). El motor lo llama la acción `dirigir`
(`packages/server/src/roles.ts`). Una IA no dirige en este corte (`PERMISOS_IA`).

Una aventura trae sus escenas en `escenas/<id>.json` (el id es el nombre del fichero: minúsculas, cifras y guiones):

```json
{ "schema": "numinia-engine/escena@1", "nombre": "La taberna", "preset": "atardecer",
  "entorno": { "niebla": { "cerca": 8, "lejos": 60, "color": "#3a2a20", "delCielo": false } },
  "narracion": "Huele a vino especiado.", "ambiente": "ambiente-numinia", "ambiente_ganancia": 0.1 }
```

- `nombre` (1–40 bytes) es lo que ve quien dirige. Hace falta `preset` (uno de la casa) o `entorno` (un `entorno@1`
  parcial, sin `suelo`, `aparicion` ni `mapa`, que son del mundo; caben 512 bytes en JSON compacto), o los dos.
- Al ponerla: el entorno del mundo, luego el preset y luego lo que cambia la escena. Pasar de una escena a otra no
  deja restos. Si hay `narracion` (≤ 280 bytes), todos la ven en el cartel del narrador.
- **Sonido de la escena**: `ambiente` es el id de una fila del catálogo con fichero y «bucle» (la misma que acepta
  `ficha.json` → `audio.ambiente`); mientras la escena está puesta suena **esa** cama en lugar de la del mundo, con
  `ambiente_ganancia` (×0–4, solo junto a `ambiente`). `"ambiente": ""` deja esa escena en silencio. Una escena sin
  `ambiente` devuelve la cama del mundo. Las camas sintetizadas del mundo no cambian. Quien entra con una escena
  puesta la oye también. Las escenas de la casa no traen sonido.
- **Mapa de la escena** (la mesa de rol): `"mapa": { "obra": "<sha256>.png", "titulo": "La cripta", "hueco": "El mapa de la mesa" }`.
  Al poner la escena, esa imagen (ya subida al servidor: `.png`, `.jpg` o `.webp`, hasta 4096 px) entra en un **hueco** que
  alguien que construye hizo (objetos `hueco`), con el mismo encaje que a mano (entera, centrada, sin deformar); `titulo` es
  su nombre. `hueco` es el id o el nombre exacto; sin él vale el único hueco de la zona (si hay varios o ninguno, no se
  adivina: queda dicho en el registro). `"obra": ""` vacía el hueco y vuelve su cartel. Una escena sin `mapa` no toca el
  mapa; una escena puede ser solo un `mapa`. No hay paso de «deshacer»: no lo construyó nadie. Nada más cambia: el hueco es
  de quien construye, la escena solo lo llena.
- Los entornos de la casa también son escenas: `/escena noche` vale en cualquier mundo.
- Quien dirige tiene el botón «Dirigir» (tecla K): escenas, luz y niebla en directo, narrar y «Convocar aquí». En el
  chat: `/escenas`, `/escena <nombre o número>`, `/narrar <texto>` y `/convocar [texto]`.
- **Convocar no mueve a nadie**: cada persona recibe «Ir / Ahora no». «Ir» enciende una baliza en el sitio y quien
  convocó ve cuántas vienen.
- `node tools/aventura.ts <carpeta>` comprueba las escenas; una mal escrita no se carga y el registro dice por qué.
