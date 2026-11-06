---
"numinia-engine": patch
---

## 2026-11-05 23:00 · mundo-hermes · Endurecer el origen del modo embed (M9) · hecho
- Qué: con `embed.activa: true` el WebSocket solo admite `Origin` ausente, `null` o el del propio mundo (otro: 403) y `/status` solo lleva CORS `*` para esos mismos (una auditoría externa de #307 vio que cualquier página del navegador podía conectar al mundo local como invitado y leer sus zonas); `MOTOR_SALIR_SI_STDIN_CIERRA=1` hace que el motor salga (cierre limpio, código 0) cuando se cierra su entrada estándar, para que Hermes no lo deje huérfano. Con embed apagado o sin `espejo.json` nada cambia. Contrato en `docs/EXTENDER.md` («Embed (v1)»).
- Números: ver la descripción del PR (pruebas nuevas, puertas, e2e, página, identidad sin espejo).
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: patch. Commit: rama `hermes/endurecer-origen`.
- Siguiente: el plugin arranca el motor con la tubería y la variable.
