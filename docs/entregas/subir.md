# Entrega · rama `wt/subir` · H9 Subir ficheros (arrastrar tu `.glb` al mundo)

- **Proyecto:** numinia-engine · **Para:** quien junta las ramas (y Pablo) · **De:** agente «subir» (Opus, 15-10)
- **Fecha:** 2026-10-15 · **Estado:** hecho y comprobado en local (unidad, puertas, e2e chromium + firefox); sin probar en un servidor real

## Qué

Quien puede construir arrastra un `.glb` desde su escritorio al mundo: se sube por su sha256, aparece donde lo
suelta, lo ven todos al momento y sobrevive a los reinicios. Sin ratón: «Subir modelo…» en el panel de construir lo
pone a 3 m delante. Paridad con el `/api/upload` de Hyperfy2, pero con permiso, topes y comprobación de bytes.

Ficheros nuevos:
- `packages/net/src/ficheros.ts` — puro, lo comparten página y servidor: tipos (`TIPOS`, movido desde `activos.ts`),
  topes (`TOPES_MB`, `SUBIDAS_TOTAL_MB`), `comprobarGlb` / `comprobarFichero` (Result con rutas, nunca lanza),
  `sha256Hex` (para páginas sin `crypto.subtle`).
- `packages/server/src/subidas.ts` — `PUT /a/<sha256>.<ext>` y `OPTIONS` (CORS).
- `apps/plaza/soltar.ts` — la capa «Suelta para subir tu modelo», la línea de estado (`role=status`), el botón.
- `test/subidas.test.ts` (8 pruebas) · `tools/e2e-piernas/subir.mjs` (pierna del e2e, chromium + firefox).
- `docs/entregas/subir.md` (esto).

Ficheros compartidos tocados (para planear la mezcla; todo cambio es local y pequeño):

| Fichero | Dónde | Qué |
|---|---|---|
| `packages/server/src/server.ts` | imports (+2 líneas); `ServerOptions` (`subidas` comentario, +`subir`); la línea `new Instance({…})` (+`activo: …` al final); +12 líneas `new Subidas({…})` justo debajo; en el manejador HTTP, la línea de `/a/` (ahora GET **o HEAD**) +1 línea PUT/OPTIONS | cableado |
| `packages/server/src/activos.ts` | `TIPOS` ahora viene de `ficheros.ts` (re-exportado); `servir(path, res, head)` | HEAD |
| `packages/server/src/main.ts` | la línea `subidas:` (por defecto `DATOS_DIR/activos`) | carpeta |
| `packages/instance/src/index.ts` | `InstanceOptions.activo` (+1) y el host de `ServerRuntime` (+1) | gancho |
| `packages/feature/src/index.ts` | `ServerHost.activo?` (+1), `ServerApi.activo` (+3), su implementación junto a `puede` (+1) | gancho |
| `features/objetos/server.ts` | la línea del `colocar` que comprobaba la biblioteca | acepta lo subido |
| `features/objetos/feature.ts` | el `describe` de `colocar` | texto |
| `packages/render/src/index.ts` | +10 líneas `sueloBajo` tras `beaconCount()` | punto del suelo |
| `apps/plaza/main.ts` | +1 import, +2 líneas tras `montarConstructor(…)` | montaje |
| `limits.json` | +12 entradas `upload_*` tras `objects_join_server_ms_at_max` | topes |
| `deploy/instalar-motor.plantilla.sh` | `Environment=` (+`ACTIVOS_DIR`), +1 comentario; comentario del `handle /a/*` | instalador |
| `tools/deploy-check.mjs` | +4 líneas: HEAD 200 y PUT sin billete 401 | prueba local del instalador |
| `test/deploy.test.ts` | +1 prueba | instalador |
| `docs/FICHA-TECNICA.md`, `docs/EXTENDER.md`, `deploy/README.md`, READMEs de `net`, `server`, `feature`, `render` | secciones o viñetas nuevas, sin tocar lo de antes | documentación |

No toqué `apps/plaza/constructor.ts` ni `apps/plaza/index.html` ni `features/objetos/client.ts`: el botón lo añade
`soltar.ts` al final de `#panel-construir` y el estilo va en un `<style>` propio.

## Decisiones (y por qué)

1. **`PUT /a/<sha256>.<ext>`, el cuerpo son los bytes.** La dirección del contenido es la URL: idempotente, sin
   analizador multipart, y ningún nombre del cliente llega al disco (se guarda como `<sha256 que calcula el
   servidor>.<tipo de la lista>`; si no coincide con la URL, 422). `HEAD` la misma URL: la página pregunta antes y
   no sube lo que ya está. Sin listado: `GET /a/` da 404.
2. **Quién: `Authorization: Bearer <billete de invitado I1>`** (el de `localStorage numinia.invitado`). El servidor
   lo verifica con `verificar()` de I1 y pregunta el mismo permiso que los intentos (`construir`; hoy
   `MOTOR_CONSTRUIR`, con H3 por rol: ya recibe el `who`). Sin billete o falso, 401; sin permiso, 403. Va en
   cabecera, no en cookie: otra web no puede usarlo (sin CSRF), por eso CORS `*` es seguro; Caddy oculta
   `Authorization` en sus registros.
3. **Topes** (MB = 1.048.576 bytes, en `limits.json` y comprobados por `test/subidas.test.ts`): glb y vrm **12**
   (el de fábrica de Hyperfy2, `PUBLIC_MAX_UPLOAD_SIZE=12` en su `.env.example`, que su cliente mira; su servidor
   corta en 100 MB), png/jpg/webp 4, ktx2/hdr/mp3/ogg 8, mp4/webm 32; **1 GB** entre todas (507); **4** a la vez
   (503). Más del tope por tipo: 413 (por `content-length` antes de leer, o al pasarlo mientras llega).
4. **Los bytes se miran**: un `.glb` entero (`glTF`, versión 2, su longitud, trozos que caben, primer trozo JSON
   que se lee, `asset.version` 2.x, BIN segundo); un `.vrm` además con su extensión VRM; el resto por sus primeros
   bytes. Mal: 422 con el motivo en castellano. **La página hace la misma comprobación antes de subir**
   (`ficheros.ts` es puro): un fichero roto se rechaza sin viaje al servidor.
5. **Carpeta**: `ACTIVOS_DIR`, por defecto `DATOS_DIR/activos` (en casa `.run/datos/activos`, ignorada por git;
   instalado `/var/lib/numinia-motor/datos/activos`, escrito en la unidad de systemd, dentro de su
   `StateDirectory`, que es lo único escribible con `ProtectSystem=strict`; el servidor la crea). Así la copia de
   seguridad de `datos/` se lleva también los modelos (un objeto sin su fichero queda roto). Se escribe con nombre
   temporal y se renombra (nunca medio fichero); lo repetido no se escribe.
6. **Quién subió qué** (id de invitado, nombre, cuándo, nombre original del fichero, bytes) en
   `subidas.jsonl` dentro de esa carpeta: nunca se sirve (solo se sirven nombres `<64 hex>.<tipo>`) y nunca va en
   una respuesta. El registro del servidor dice «Invitado XXXX subió …».
7. **Gancho del enchufe `api.activo(sha256, ext = "glb")`**: solo lee (un booleano); lo contesta la composición
   (`server.ts` → `Activos.buscar`). `features/objetos` no importa nada del servidor y `tools/layers.mjs` sigue a 0.
8. **Página**: soltar → `view.sueloBajo(x, y)` (rayo de la cámara al plano y = 0 bajo el puntero; cielo o > 150 m =
   delante de ti, 3 m). Nombre = el del fichero sin extensión (guiones bajos como espacios, ≤ 60 bytes): **no es
   decorado**, lo oye el lector de pantalla y lo leen los agentes. Línea de estado `role=status` con cada paso
   («Leyendo…», «Comprobando si ya está…», «Subiendo… 42 %», «Colocado: «x».» / «Ya estaba en el servidor…» /
   «No se pudo subir «x»: motivo.»). Subida con `XMLHttpRequest` (fetch no da progreso de subida). sha256 con
   `crypto.subtle`; en `http://IP` (sin contexto seguro no existe) con `sha256Hex`, probado contra `node:crypto`.
   Varios ficheros a la vez: uno tras otro, 1,5 m a la derecha cada uno. Hoy **solo se colocan `.glb`**: el servidor
   ya acepta el resto de tipos, pero colocarlos es de otras filas (vrm H10; imagen, sonido, vídeo M22/H2/M18).
9. **Visitantes**: ni capa ni botón; un fichero soltado nunca abre el fichero en lugar del mundo (`preventDefault`
   para todos; `dropEffect = "none"` a quien no construye).
10. **Botón «Subir modelo…»**: un `<button>` de verdad que abre un `<input type=file>` oculto (teclado y lector de
    pantalla); lo pone en la fila de abajo de `#panel-construir`. No añadí atajos de teclado globales.

Formato: todo aditivo (un método HTTP nuevo en una ruta que ya existía, un campo opcional en `ServerHost` /
`InstanceOptions`, una función en `ServerApi`). Ni el protocolo ni la huella cambian (`fa94375e` sigue fijada).

## Números (de ejecuciones de hoy, no de memoria)

- `npm test`: **101 en verde** (eran 92: +8 `test/subidas.test.ts`, +1 `test/deploy.test.ts`).
- `npm run gates`: todas en verde; capas 0; plaza de 1.000 tick p99 **7,6–8,1 ms** (p50 6,2–6,3) en tres pasadas.
- `tools/auto.sh e2e` (puertos 8803/5183/5193, núcleos 12-15), última pasada sobre el commit final: `e2e chromium OK` ·
  `e2e firefox OK` · `e2e AR (IWER) OK` · `e2e VR (IWER) OK` · `e2e subir OK` · `e2e https (wss por /ws del mismo origen) OK`.
  Cinco pasadas en total: la pierna `subir` pasó las cinco; dos pasadas salieron enteras en verde; en las otras tres,
  con la máquina cargada por las otras ramas (carga 13–24), falló **solo** la comprobación de distancia andada de
  `tools/e2e.mjs` en una pierna de base (chromium −3,19 m; https −3,0 y −3,19 m; pide más de 3,5 m): es el fallo ya
  descrito en ese fichero (el GL por software pierde ticks con carga), con todo lo demás de esas piernas en verde.
- Pierna `subir`, en **chromium y firefox**: la capa aparece al arrastrar (y se va al soltar); el objeto cae a
  **≤ 0,01 m** del punto del suelo bajo el puntero (p. ej. soltado en (120, 220) px → (−6,87, −19,28) m, colocado en
  (−6,87, −19,28)); la pestaña B
  lo recibe y **carga su fichero** (`loaded` +1, `failed` 0); `GET /a/<sha>.glb` devuelve los mismos 1.616 bytes; el
  mismo fichero por el botón (foco + Enter → selector de ficheros real) **no se vuelve a subir** (1 PUT, 2 HEAD) y
  cae a 3 m delante; un `roto.glb` lo rechaza la página sin subir nada; se borran los dos; 0 errores de página.
- `subidas.jsonl` del e2e: una línea por fichero nuevo (`quien`, `nombre` «Invitado FSTF», `fichero`, `bytes`).
- Instalador: `npm run deploy` + `node tools/deploy-check.mjs` OK («/health, /metrics, /a/ y subidas OK»: HEAD 200,
  PUT sin billete 401, con el servidor desempaquetado y el Node fijado).
- Peso en la página: `soltar.ts` + `ficheros.ts` = 10,6 kB minificado, **5,3 kB gzip**, para todos.

## Sin comprobar

- En un servidor real: systemd escribiendo en `datos/activos` con `ProtectSystem=strict`, Caddy pasando `PUT` con
  cuerpo grande (no tiene tope por defecto), HTTPS (X3).
- Un arrastre de verdad desde el gestor de ficheros del sistema (el e2e usa un `DataTransfer` sintético y el
  selector de ficheros de Playwright); Safari/WebKit; móvil y gafas (en VR/AR no hay arrastrar).
- Ficheros grandes (12 MB) por una red lenta, y cuánto sube el tick p99 durante una subida (se hace el sha256 por
  trozos según llegan; `Buffer.concat` ≤ 12 MB y el `JSON.parse` del trozo JSON son lo único de un golpe). Sin medir.
- Junto con las otras ramas: la cámara con ratón (camara) y el panel nuevo (constructor). `sueloBajo` usa la cámara
  del momento, así que debería seguir a cualquier cámara; si el panel nuevo vacía `#panel-construir` después de
  montar, el botón desaparece (habría que montarlo en el sitio nuevo: una línea en `soltar.ts`).

## Lo que falta (para otras filas)

- Borrar subidas que nadie usa y un cupo por identidad (hoy solo el tope total; nada se borra).
- Licencia y límites del contenido (triángulos, texturas) antes de usarlo: lo dice la fila, «cuando exista M21».
- Colocar lo que no es `.glb`: `.vrm` → H10; imagen, sonido, vídeo → M22 / H2 / M18; `.hyp` → H11.
- Cargar `soltar.ts` solo para quien construye (ahorra 5,3 kB gzip a los visitantes; hay que dejar el
  `preventDefault` de soltar siempre puesto).
- `/a/` por CDN: M16.

## Para el BACKLOG

- **H9 → hecho** (detalle: lo de arriba; «Hecho cuando» cumplido: subir dos veces guarda uno, visitante 403, tipo no
  permitido 415, e2e soltar un GLB lo coloca donde se suelta y delante de quien usa el botón).
- Propuesta de fila nueva (pendiente, no Opus): **limpieza y cupos de subidas** — borrar ficheros sin objetos que
  los usen pasado un plazo, cupo por identidad (MB/día), y `limits.json` con lo medido; espera a H3 (roles).

## Dependencias nuevas

Ninguna.
