# Bienes digitales: un objeto que es tuyo (N10)

Al acabar una aventura, un cofre puede dar un **objeto** que es del jugador: el mundo firma un **recibo de propiedad**
(Ed25519, sin cadena ni cartera ni dinero) y el objeto queda en su **Inventario** (ficha, tecla I), guardado por invitado.

- **En la misión** (`misiones/<id>.json`), una recompensa más:
  `{ "tipo": "objeto", "id": "farolillo-de-bruno", "nombre": "Farolillo de Bruno", "descripcion": "…", "modelo": "<sha256 de un .glb de activos/>", "licencia": "CC0-1.0" }`.
  `descripcion`, `modelo` y `licencia` son opcionales. La licencia (SPDX o similar) dice qué derechos tiene el arte:
  tener el objeto no da los derechos de autor de su obra.
- **Una vez por misión e invitado**: la concesión (U14, `c:<mision>:<invitado>`, `npm run concesiones`) dispara el evento
  solo-servidor `misiones.concedido`; la función `bienes` firma el recibo con `api.recibo(…)`, lo guarda (`b:<id>`) y
  avisa «Es tuyo: …» a todas las pestañas del dueño.
- **Sin `MOTOR_SECRET` no hay recibos**, así que no hay bienes (la concesión sí se apunta y el registro lo dice). La
  clave Ed25519 sale del secreto (HKDF), no hay fichero nuevo que guardar; al arrancar, el registro dice
  `[bienes] los recibos de este mundo los firma ed25519:…`.
- **El recibo viaja**: «Descargar recibo» baja `recibo-<objeto>-<id>.json`. Cualquiera lo comprueba con la clave que
  lleva dentro: la propia página (`features/bienes/comprobar.ts`, WebCrypto), otro mundo o una herramienta
  (`POST /bienes/comprobar`, que dice qué bien es y si lo firmó este mundo, nunca de quién es) y
  `npm run bienes -- verificar <fichero>`.
- **Listar y auditar**: `npm run bienes -- <carpeta del mundo>` da un CSV con cada bien y vuelve a comprobar cada firma
  (un registro tocado a mano sale `MAL`).
- **Cadena, todavía no**: `packages/server/src/cadena.ts` convierte un recibo en metadatos ERC-721 y en el vale EIP-712
  sin firmar de una acuñación perezosa (`npm run bienes -- metadatos <recibo>`). No crea claves ni toca ninguna red: qué
  cadena, quién custodia y quién paga lo decide Pablo. A la cadena nunca va nada de la persona (ni id de invitado, ni
  nombre, ni hashes de ellos; EDPB 02/2025 v2.0).

### Corte 2 (N18): verlo, llevarlo puesto, inventario rápido y recibos de otros mundos

- **Verlo en 3D.** Un bien con `modelo` (el sha256 de un `.glb` que este servidor tiene en `activos/`) trae `verse: true`
  y en la ficha sale **«Ver en 3D»**: el modelo gira en un lienzo propio (`packages/render/src/vitrina.ts`, un segundo
  WebGPURenderer vivo solo mientras se ve); se gira arrastrando (ratón o dedo) o con las flechas. Sin el fichero, la
  ficha dice que aquí no se puede ver ni llevar.
- **Llevarlo puesto.** Intent `llevar{id, donde}` (`mano` | `cabeza`; `donde: ""` = quitárselo). El servidor comprueba
  que el bien es tuyo y que tiene modelo, y lo publica en el estado compartido `p:<entidad>` `{ent, modelo, donde,
  nombre}`: **todas** las páginas lo dibujan (`view.lleva` → `view.vestir`, `packages/render/src/puestos.ts`): en el
  hueso de la mano derecha / encima de la cabeza del VRM, o junto a / encima de la cápsula. Cualquier modelo se escala a
  0,30 m en la mano (colgado por arriba) y 0,26 m en la cabeza (apoyado por la base). Se guarda por invitado
  (`l:<invitado>`): vuelve a ponérselo al entrar, en todas sus pestañas; al irse, desaparece de su avatar.
- **Inventario rápido.** Índice por dueño en el almacén: `d:<invitado>` (y `d:<invitado>~2`… de 100 en 100) lista las
  claves de sus bienes; entrar cuesta tus bienes, no los del mundo. Un mundo de antes del índice se indexa **una vez** al
  arrancar (`i` = versión del índice; el registro dice `índice por dueño: N bienes indexados (una vez)`).
- **Traer un recibo de otro mundo.** En la ficha, «Traer un recibo de otro mundo» (el `recibo-….json` descargado allí o
  el `nb1.…` pelado). La página lo comprueba (WebCrypto) y, si es de fuera, lo manda al servidor en trozos (intent
  `traer{parte, partes, t}`, 480 caracteres cada uno), que lo vuelve a comprobar y contesta con `traido{ok, nombre,
  mundo, confia, dado, motivo}`:
  - **Este mundo no confía en quien lo firmó** (lo normal): se ve como **«De otro mundo · no es tuyo aquí»** (lo recuerda
    ese navegador; «Olvidar» lo quita). No se da nada.
  - **Confía**: pasa a ser tuyo aquí también (`f:<24 hex de la huella del recibo>`, `ajeno: true`, sello «De otro
    mundo»); se ve y se lleva como cualquier bien. **Un recibo, una persona**: el primero que lo trae lo tiene; otro
    invitado con el mismo fichero recibe «ya lo trajo otra persona».
  - **La lista de confianza es un fichero del mundo**: `<aventura>/bienes/confianza.json`
    `{ "formato": "confianza@1", "emisores": [{ "emisor": "ed25519:<43>", "nombre": "…", "nota": "…" }] }`, **vacía por
    defecto** (`aventuras/ejemplo` la trae vacía). El `emisor` es la clave pública del otro mundo (la que dice su registro
    al arrancar o `POST /bienes/comprobar`). Se lee en cada `traer`: cambiarla no pide reiniciar.
  - `POST /bienes/comprobar` dice además `confiado` (si este mundo confía en su firmante). `npm run bienes` lista también
    los `f:` y comprueba su firma.
- **Modelo de ejemplo**: el Farolillo de Bruno ya tiene modelo (`activos/casa/farolillo.glb`, CC0, obra propia,
  `node tools/hacer-farolillo.mjs`, determinista; también en `features/objetos/biblioteca.json`).
- **e2e**: `node tools/e2e-piernas/bienes.mjs` (arranca su propio servidor y página en 8796/5178 con una copia del mundo
  de ejemplo que confía en un «Mundo Vecino»; PC y móvil 390×844 táctil; `SHOTS=<carpeta>` guarda fotos).
