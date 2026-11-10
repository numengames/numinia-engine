# Contadores (v1, D-044): temporizador y contador que todos ven

`features/contadores` es la pieza del reloj de la sala de escape, del marcador del equipo y del reloj del mundo:
**el servidor lleva el reloj**, publica el valor **una vez por segundo** (no a 20 Hz) y **solo a quien está en la zona**
(estado con `at`, radio `ALCANCE_M` 60 m, J9). La página nunca cuenta por su cuenta: enseña el último valor que le llegó.

- **Fichero del mundo** `MUNDO_DIR/contadores.json` (`numinia-engine/contadores@1`):
  `{ "contadores": [{ "id": "sala", "nombre": "Sala 1", "tipo": "cuenta_atras", "segundos": 900, "x": 0, "z": 0, "donde": "ambos", "evento": "sala-a-cero", "manda": "todos" }] }`.
  Tipos: `cuenta_atras` (`segundos`, 1 a 86.400), `contador` (`inicio` y `tope`; `tope` 0 = sin tope) y `reloj` (sube
  desde 0, un cronómetro del mundo). `donde` = `panel` (la página), `cartel` (texto en el mundo) o `ambos` (si falta);
  `manda` = `todos` (quien esté al alcance, `radio` 1-16 m, 4 si falta) o `dirige` (si falta: quien dirige, permiso
  «Gestionar rituales» STD-052, desde donde sea). Cada línea mal formada **se deja fuera con su motivo** en el log
  (`[mundo] contadores.json: contadores.contadores[3].tipo: … (esa línea no se usa)`); el resto se usa. Como mucho
  32 por mundo (`limits.json`).
- **Intenciones** (página, móvil, VR, agentes): `arranca {id}`, `para {id}`, `suma {id, cuanto}` (negativo resta; en una
  cuenta atrás da o quita segundos), `reinicia {id}` (vuelve a `inicio`, parado) y `pulsar {id}` (la tecla E al lado: una
  cuenta atrás o un reloj arranca/para; un marcador suma 1).
- **Eventos:** `llegada {id, nombre, tipo, valor, evento, texto}` cuando una cuenta atrás llega a cero o un marcador a su
  tope (se para y lo publica; suena `campana`, importancia 2). **Para el cable (D-041):** en el servidor,
  `api.listen("contadores", "llegada", (m) => m.evento === "sala-a-cero" && …)` — el nombre viaja en `evento`, y los
  oyentes del servidor lo oyen aunque el emit sea a la zona. `hito {id, nombre, texto}` dice en voz alta lo que un lector
  de pantalla debe oír (arranca, parado, «quedan 5 minutos / 1 minuto / 30 s / 10 s», el marcador cambió); el valor del
  panel NO es región viva (no se lee segundo a segundo). `rechazado {motivo}`.
- **Cartel 3D:** la vía más barata que ya había: el rótulo sprite sobre una cosa (`api.view.tag`, un canvas que solo se
  redibuja cuando cambia el texto: una vez por segundo en marcha, nunca parado), a 2,4 m del suelo del contador, con el
  nombre debajo. Se ve también en VR.
- **Panel HTML** (`apps/plaza/contadores.ts`, `#contadores-panel`): un grupo por contador (nombre, valor en `<output>`
  con `aria-live="off"`, estado) y los botones (44 px) solo cuando estás al alcance: Arrancar/Parar y Reiniciar, o +1 / −1
  / Reiniciar en un marcador.
- **Chat:** `/contador sala arranca|para|suma 3|resta 1|reinicia`, `/contadores` (la lista con sus valores).
- **Lo que no hace (todavía):** un contador por persona (hoy solo id y, con `variante: "equipo"`, por equipo), poner o quitar
  contadores desde dentro del mundo (hoy, solo el fichero), y el cable que conecte `llegada` con otra pieza (D-041, otro agente).
- **h3 (persist, variante equipo):** `state.persist: true` (S4) — el valor y si está en marcha sobreviven a un reinicio del
  servidor; al arrancar, un contador recupera lo guardado (no vuelve a `inicio`) y, si no hay nada guardado, usa el fichero.
  Un contador con `"variante": "equipo"` en el fichero deja de ser un solo valor: la orden lleva además `equipo` (1-16 letras
  minúsculas, cifras o guiones — un nombre libre, no una lista que el fichero tenga que declarar) y el servidor crea ese
  equipo la primera vez que se nombra, hasta `EQUIPOS_MAX` (8) equipos por contador; cada equipo vive bajo la clave
  `<id>:<equipo>` (estado, cartel y chat: `/contador marcador:rojo suma`). Sin `equipo` o con uno de más, se rechaza
  («Di el equipo…» / «ya tiene 8 equipos»).
