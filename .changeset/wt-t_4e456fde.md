---
"numinia-engine": patch
---

## 2026-11-11 21:07 · biblioteca · Moñoni en blanco y negro registrado en la biblioteca (bolita-bn) · hecho
- Qué: el moñoni B/N queda como modelo de la biblioteca (`id` `bolita-bn`, «Moñoni B/N») para que los habitantes de Hermes puedan usarlo como apariencia. El fichero, `activos/bolitas/bolita-bn.glb` (combinado cuerpo + sonrisa), se copia de `hermes-mundo/mononi/modelos/`.
- Números: sha256 `ddc3df9a…c9de02a` igual al del fichero y al de `hermes-mundo/mononi/bolita-bn.json`; 1.410 triángulos, 3 materiales (medidos en el .glb). `node --test test/objetos.test.ts`: 20 de 20 en verde. Los demás modelos de la biblioteca no cambian.
- Consumo: sin medir · claude-haiku-5-5.
- Cambio: patch. Commit: branch `wt/t_4e456fde`, PR pendiente de abrir.
- Siguiente: ninguno.
