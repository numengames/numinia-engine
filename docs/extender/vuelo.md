# Vuelo (v1): volar con permiso

`features/vuelo` (H2): `/volar` te levanta del suelo (sin gravedad: Espacio sube, Ctrl baja) y `/aterrizar` te devuelve a pie. Quien decide es el servidor, nunca la página.
- **Mundo**: `entorno.json` → `"vuelo": "nadie" | "constructores" | "todos"`. Sin la clave, **nadie** vuela. `constructores` = quien puede construir aquí (`puede(…, "construir")`). Una clave mal escrita se avisa en el registro y se queda en «nadie».
- **Concesión por pieza**: otra pieza puede dar el vuelo a una persona con `instancia.concederVuelo(entidad, true|false)` (por ejemplo un objeto o un rol), también en un mundo que dice «nadie». Aterrizar siempre se permite.
- **Cómo**: la intención `volar { activa }` o el chat piden `api.ordenar(e, { volar })`; la instancia lo comprueba (`puedeVolar`), lo graba entre las órdenes de la simulación (misma huella al repetir) y, si no hay permiso, lo registra y la persona oye por qué. Una página que mande `volar` por su cuenta no consigue nada.
- Ctrl (BAJAR) lo envía la página en cada tick; a pie, la simulación lo ignora.
