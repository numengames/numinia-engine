# deploy/ — montar el motor en un servidor pequeño

Un solo fichero lo instala todo: `instalar-motor.sh`. No está en git (lleva dentro la página construida): se
publica en GitHub como versión `motor-<build>` con `instalar-motor.sh` y `SHA256SUMS` adjuntos, después de pasar
`deploy-check`, con `tools/publicar-version.sh` (solo un commit limpio que ya esté en `main`). Hoy lo corre una
persona o Ursa tras cada fusión; cuando alguien con permiso añada el workflow que lo llama en cada fusión, será solo.

## Instalar desde GitHub (lo normal)

En el servidor (Ubuntu 24.04 o Debian 12, x86_64 o arm64, recién hecho), como root:

```bash
curl -fsSLO https://github.com/numengames/numinia-engine/releases/latest/download/instalar-motor.sh
curl -fsSLO https://github.com/numengames/numinia-engine/releases/latest/download/SHA256SUMS
sha256sum -c SHA256SUMS && bash instalar-motor.sh --dominio motor.ejemplo.com --auto-actualizar
```

`--auto-actualizar` deja un temporizador (`numinia-actualizar.timer`) que cada 10 minutos mira la última versión
publicada y, si es otra, la descarga, comprueba su sha256 (contra `SHA256SUMS` y contra el que da GitHub) y se
reinstala con las mismas opciones (`/opt/numinia-engine/instalacion.env`). Nunca toca `/var/lib/numinia-motor`
(el mundo). Si hay gente dentro espera, hasta 6 h. Si el instalador nuevo falla, vuelve a poner el anterior y no
lo reintenta solo.

```bash
journalctl -u numinia-actualizar                      # qué hizo cada vuelta
sudo bash /opt/numinia-engine/actualizar.sh --ahora     # una vuelta ya, aunque haya gente
sudo touch /opt/numinia-engine/PAUSA                    # en pausa (p. ej. durante una medición); rm para seguir
```

## Construirlo en tu PC (desarrollo)

```bash
npm run deploy                 # construye la página y escribe deploy/instalar-motor.sh (~0,5 MB)
node tools/deploy-check.mjs    # prueba local: lo desempaqueta, arranca su servidor y conecta un cliente
```

En el servidor (Ubuntu 24.04 o Debian 12, x86_64 o arm64, recién hecho):

```bash
scp deploy/instalar-motor.sh root@IP:
ssh root@IP 'bash instalar-motor.sh'                              # pruebas: http://IP/
ssh root@IP 'bash instalar-motor.sh --dominio motor.ejemplo.com'  # HTTPS automático (el DNS ya debe apuntar)
```

Qué deja montado:

| Pieza | Dónde | Notas |
|---|---|---|
| Node LTS oficial | `/opt/numinia-engine/node` | versión y sha256 fijados en `tools/build-deploy.mjs` (`NODE`) |
| Habitantes IA (P4a) | servicio `numinia-habitantes`, mismo `app/` | usuario `numinia-hab`; solo habla con `127.0.0.1:8790` (`IPAddressDeny=any`); `MemoryMax=256M`, `CPUQuota=50%`; secreto de agentes en `/opt/numinia-engine/agentes.env` (lo lee systemd); quitarlos: `systemctl stop numinia-habitantes` o instalar con `--sin-habitantes` |
| Servidor de instancia | `/opt/numinia-engine/app`, servicio `numinia-motor` | escucha solo en `127.0.0.1:8790`; usuario `numinia`; `LimitNOFILE=65536`, `MemoryMax=75%` (cámbialo con `--memoria 1G`) |
| Página | `/opt/numinia-engine/www` | la sirve Caddy |
| Caddy | `/etc/caddy/Caddyfile` | página + `/ws` al servidor, mismo origen; guarda el Caddyfile anterior en `Caddyfile.antes-del-motor` |
| Cortafuegos | ufw | abre el puerto de ssh que esté en uso, 22, 80, 443 (tcp y udp); `--sin-cortafuegos` para no tocarlo |

La página busca su servidor en el mismo sitio desde el que se cargó: `wss://<dominio>/ws` con HTTPS,
`ws://<ip>/ws` sin él. En tu PC (localhost) sigue usando `ws://localhost:8790`. `?server=ws://…` en la
dirección manda siempre.

Volver a instalar (otra versión) es ejecutar el fichero nuevo: sustituye `app/` y `www/` y reinicia.

Comandos útiles en el servidor:

```bash
systemctl status numinia-motor        # ¿está vivo?
journalctl -u numinia-motor -f        # cada 30 s: conectados, tick p99, kbit/s por persona
bash instalar-motor.sh --version      # qué versión lleva el fichero
curl -s localhost:8790/health         # {"ok":true,"version":…,"huella":"93b192c8","conectados":N}
curl -s localhost:8790/metrics        # JSON: conectados, tick p50/p99/peor (últimos 10 s), respuesta del tick, bucle, CPU, steal, memoria, kbit/s por persona…
```

`/health` también se ve desde fuera (`https://<dominio>/health`); `/metrics` solo desde el propio
servidor. Para leerlo desde casa (8790 ya lo usa la plaza de tu PC): `ssh -L 18790:127.0.0.1:8790 root@IP`
y abrir `http://localhost:18790/metrics`; el enjambre lo lee con `--metrics http://localhost:18790/metrics`.

## El mundo en un zip: bajarlo y subirlo

`https://<dominio>/mundo` es una página con dos botones: **Descargar el mundo** (un `.zip`) y **Subir un mundo**
(sustituye el de ahora por el del zip). Pide el código de administración, que el instalador hace una vez y no
enseña nunca: `sudo cat /opt/numinia-engine/admin.env` (hasta que lleguen los roles, H3).

Qué lleva el zip: `mundo.json` (versión del motor, fecha y cada fichero con sus bytes y su sha256) y `datos/`:
lo que guardan las funciones (lo construido, las misiones…) y los modelos subidos (`datos/activos/`). No lleva
quién entró (sesiones), quién subió qué (`subidas.jsonl`) ni el motor (viene de la versión). Al subir, el
servidor lo comprueba entero antes de tocar nada (zip con contraseña, enlaces, rutas con `..`, bombas de zip,
ficheros que no son los que dice `mundo.json`: rechazado con el motivo), guarda el mundo de ahora en
`/var/lib/numinia-motor/datos.antes-<fecha UTC>` (los dos últimos), pone el nuevo y se reinicia (unos segundos).

Por terminal, lo mismo:

```bash
. /opt/numinia-engine/admin.env
curl -fsS -H "Authorization: Bearer $MOTOR_ADMIN" http://127.0.0.1:8790/mundo/zip -o mundo.zip     # bajar
curl -fsS -H "Authorization: Bearer $MOTOR_ADMIN" -T mundo.zip http://127.0.0.1:8790/mundo/zip     # subir
```

## Ver cómo entra cada jugador (T1)

Cada sesión de un navegador se guarda en `/var/lib/numinia-motor/sesiones/sesiones-<día UTC>.jsonl` (14 días,
sin IP). Desde el servidor:

```
curl -s localhost:8790/sesiones                     # quién está dentro ahora y su último pulso (JSON)
cd /opt/numinia-engine/app && SESIONES_DIR=/var/lib/numinia-motor/sesiones ../node/bin/node packages/server/src/sesiones-ver.ts
```

Desde casa, por el túnel (`ssh -L 18790:localhost:8790 …`): `npm run sesiones -- --url http://localhost:18790`.

## Lo que guardan las funciones (S4)

`/var/lib/numinia-motor/datos/<función>.json` + `.jsonl` (texto). Para una copia de seguridad basta copiar esa
carpeta; para empezar de cero, parar el servicio y vaciarla.

## Construir en el mundo (H1)

Por defecto todos construyen en un servidor instalado (personas y habitantes IA), hasta que lleguen los roles (H3).
Para cerrarlo: `sudo bash instalar-motor.sh --construir nadie` (se guarda; `--construir todos` lo vuelve a abrir). Lo construido se guarda en `datos/objetos.json` + `.jsonl`. Los modelos que
se pueden colocar son los de la biblioteca de la casa (`app/activos/`, CC0), servidos en `/a/<sha256>.glb`.

## El cerebro de los habitantes IA (P5a)

Lía (y cualquier habitante con `escalon` 2 o 4) contesta con Claude cuando la llamas por su nombre y, si el mundo
deja construir, pone, mueve, escala y borra objetos. Hace falta la clave de Anthropic, una vez:

```bash
sudo bash instalar-motor.sh --clave-ia          # la pide sin mostrarla, la comprueba y elige modelo (sonnet si hay)
sudo bash instalar-motor.sh --modelo-ia claude-haiku-4-5   # cambiar de modelo · --quitar-clave-ia para quitarla
journalctl -u numinia-habitantes -f              # cada respuesta: modelo, tokens, acciones
```

La clave queda en `/opt/numinia-engine/cerebro.env` (0640, solo el servicio de habitantes; el motor no la lee) y
ese servicio solo puede hablar con el motor de la máquina y con Anthropic (`IPAddressAllow`). Topes: 300 llamadas al
día entre todos (`CEREBRO_DIA_MAX` en ese fichero), 6 por minuto por habitante, 3 por minuto por persona. Sin clave,
pasado un tope o con el proveedor caído, contestan con su guion.

## Subir tus modelos (H9)

Con el mundo abierto a construir, quien construye arrastra un `.glb` desde su ordenador al mundo (o usa «Subir
modelo…» en el panel de construir) y aparece donde lo suelta, para todos. Se guarda por su sha256 en
`/var/lib/numinia-motor/datos/activos/` (lo crea el servidor; `ACTIVOS_DIR` en la unidad de systemd) y quién subió
qué y cuándo, en `datos/activos/subidas.jsonl` (no se sirve nunca). Topes: 12 MB por `.glb` y 1 GB entre todas las
subidas (`limits.json`, `upload_*`). La copia de seguridad de `datos/` ya lo incluye.

## Medir los límites

Todo está explicado en [`docs/MEDIDAS.md`](../docs/MEDIDAS.md). Lo mínimo:

```bash
# 1) en la máquina nueva, antes de nada (15 s, sin red): cuánto rinde UN núcleo
cd /opt/numinia-engine/app && /opt/numinia-engine/node/bin/node packages/server/src/bench.ts

# 2) desde tu PC, con el túnel abierto (ssh -N -L 18790:127.0.0.1:8790 usuario@IP): la escalera
tools/swarm.sh --url wss://motor.ejemplo.com/ws --metrics http://localhost:18790/metrics --pasos 100,300,600,1000 --etiqueta vps1

# 3) remojo (memoria, 30 min) y tormenta (todos entran a la vez)
tools/swarm.sh --url … --metrics … --n 500 --remojo 30
tools/swarm.sh --url … --metrics … --n 500 --tormenta 3 --retener 10
```

Cada orden escribe un informe (`informes/*.json` y `.md`) con el límite medido, el steal y si la medida es de fiar.
Robots y servidor en la misma máquina (`--en-servidor`) compiten por la CPU: el número bueno es el remoto.
`GET /metrics.prom` (solo desde la propia máquina) da lo mismo en formato Prometheus.

Lo que **no** está probado aún: la instalación real con root, systemd, Caddy y ufw (aquí no hay
contenedores ni root). La prueba local cubre el fichero, el desempaquetado y el servidor desempaquetado
con el Node fijado. La prueba real es la tarea X3, con Pablo.
