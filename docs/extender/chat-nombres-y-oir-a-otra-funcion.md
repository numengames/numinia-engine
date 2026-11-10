# Chat, nombres y oír a otra función (J3)

- `api.listen("chat", "orden", (m) => …)` — oír en el servidor un evento de otra función (o de la tuya). Las órdenes
  del chat (`/algo`, sin la barra en `m.texto`, quién en `m.quien`) llegan así y **nunca** a las páginas; devuelve
  `true` si la atendiste (si nadie la atiende, el chat se lo dice a quien la escribió). El chat cercano llega con
  `listen("chat", "dicho", …)` (el habitante IA, P5). Es texto no fiable: nunca a las instrucciones de un agente.
- `api.emit(evento, msg, "server")` — un evento que solo oyen las funciones del servidor (ninguna página).
- `api.visible(entidad)` — a quién dibuja la página de ese jugador ahora (su último snapshot: el área de interés).
- En la página: `view.nameTag?.(entidad, texto | null)` (nombre sobre la cabeza) y `view.bubble?.(entidad, texto, ms)`
  (bocadillo; el último sustituye al anterior). Dónde se ponen lo decide `view.setHeadTop` (la cápsula hoy; VRM, J1).
- **Escribir nunca mueve.** Toda escucha de teclas de la página pregunta antes `escribiendo(e)`
  (`apps/plaza/escribiendo.ts`): una tecla dentro de una caja de texto es de la caja, no del mundo.
- El ejemplo completo es `features/chat` (cercano a 20 m, canal de la zona con su límite, los 50 últimos al entrar,
  nombres a 24 m de quien ves, órdenes con `/`).
