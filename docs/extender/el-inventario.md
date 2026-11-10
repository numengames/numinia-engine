# El Inventario (Y1): dar objetos a una persona desde tu función

El inventario (`features/inventario`) guarda por invitado lo que posee (`api.store`, clave `i:<quien.id>`, S4) y se
lo manda entero solo a él (`lista` + un `objeto` por cada uno). El canon manda los límites: **1 arma** contigo, **3
reliquias** contigo, el resto en la Reserva; los **tokens** (Semillas del Conocimiento por color) apilan y no se portan.

Tu función no importa el inventario ni él a ti: declaras en tus `events` uno tuyo, p. ej.

```ts
otorga: { describe: "Solo en el servidor: doy un objeto a quien (entidad).", announce: "silent",
  fields: { quien: { kind: "int", min: 0, max: 65535 }, tipo: { kind: "enum", values: ["arma", "reliquia", "token"] },
            clase: { kind: "text", maxBytes: 32 }, nombre: { kind: "text", maxBytes: 40 },
            color: { kind: "enum", values: ["", "verde", "azul", "plateada", "dorada", "roja"] }, n: { kind: "int", min: 1, max: 999, default: 1 } } }
```

y lo emites con `api.emit("otorga", { quien: e, tipo: "token", clase: "semilla", nombre: "Semilla verde", color: "verde", n: 1 }, "server")`:
ninguna página lo recibe; el inventario lo oye (`api.listen`, lista `DONANTES` en `features/inventario/server.ts`: añade
tu `[id, "otorga"]`) y se lo da a esa persona, que oye «Recibes Semilla verde». Lo que una misión da va en su
`recompensas` (arriba). Reglas puras para probar sin red: `features/inventario/reglas.ts` (`dar`, `quitar`, `equipar`,
`desequipar`, `leerInventario`). Panel de la página: `apps/plaza/inventario.ts` (R); resumen en la ficha (I, sección «Reserva»).

**Armas y reliquias de tu aventura (Y3, `objeto@1`).** Un fichero por objeto en `aventura/objetos/<id>.json`:

```json
{ "formato": "objeto@1", "id": "lira-de-nyx", "tipo": "reliquia", "clase": "lira", "nombre": "Lira de Nyx",
  "competencia": "Tecnomancia", "propiedad": "Resonancia Memorística",
  "factorRiesgo": { "nombre": "Desfase Armónico", "consecuencia": "Si se obtiene un Fracaso, …" },
  "modelo": "<sha256 de un .glb, solo armas>", "valor": 3 }
```

Canon: la propiedad de una reliquia va siempre con una **Competencia** y toda reliquia lleva un **Factor de Riesgo**
(el arma lleva la Competencia; el Factor es opcional). `node tools/aventura.ts aventuras/<x>` lo comprueba y dice, por
fichero, todo lo que está mal; el servidor, al arrancar, lo repite en su registro y no carga lo inválido. Para entregarlo,
añade a tu `otorga` un campo `objeto: { kind: "text", maxBytes: 32, default: "" }` y emite
`api.emit("otorga", { quien: e, tipo: "arma", clase: "x", nombre: "x", objeto: "lira-de-nyx" }, "server")`: se da lo que
la aventura definió (el resto del evento se ignora); un id que la aventura no define no da nada y queda en el registro.
`misiones` ya trae ese campo (v8).

**El arma en la mano (Y2).** Un arma con `modelo` que la persona lleva (`equipar`) se dibuja en su mano derecha en todas
las páginas (estado compartido `a:<entidad>` de `inventario`, vista `lleva(entidad, p, "arma")`); al desequiparla, soltarla
o irse, se quita. Si este servidor no tiene el modelo (`api.activo`), el arma se lleva pero no se dibuja. Un bien de
`bienes` en la mano espera mientras haya un arma en ella.

**El Graboso (Y1).** Un mundo cuyo `objetos/` define una reliquia `clase: "graboso"` da el botón, la tecla K y la fila
«Grabar» del reloj VR solo a quien la lleva; un mundo que no la define deja el Graboso a todos, como antes.


Lo que el dueño hace en el chat con `/agente añadir|quitar` lo hace también el panel de numinia.com por HTTP, con el mismo
código (`roles-mundo.ts`, `agentes`) y el mismo fichero (`aventura/agentes/<id>.json`):

| Ruta | Hace | Respuesta |
|---|---|---|
| `GET /agentes` | lista | `{ agentes: [{ id, nombre, rol, permisos, presente }] }` (`presente` = conectado ahora) |
| `POST /agentes` | añade; cuerpo `{ id, nombre, clave, rol? }` | 201 `{ ok, texto, agente }`; 400 datos que no valen, 409 ya existe o es un habitante |
| `DELETE /agentes/<id>` | quita; si está dentro lo avisa y lo cierra con 4003 | 200 `{ ok, texto }`; 404 no existe |

Entra solo con el pase de numinia.com (H3b): `Authorization: Bearer <pase>`, verificado como en el WebSocket (`aud` = este
mundo) y con el permiso `manage-organization` o dueño. 401 = sin pase o pase malo (`{ error, texto }`, el `texto` en
español del verificador), 403 = pase bueno sin permiso, 404 `agentes-desactivado` = el mundo no tiene `MOTOR_PASE_CLAVE`
(cerrado, nunca abierto). CORS: solo `https://numinia.com` (responde al `OPTIONS` y pone `Access-Control-Allow-Origin`;
a otro origen no le pone ninguna cabecera CORS; nunca `*`). El instalador deja pasar `/agentes*` por Caddy.
