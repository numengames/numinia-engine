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
| El mundo | `/var/lib/numinia-motor` (`MOTOR_MUNDO`) | `datos/`, `aventura/` (la primera vez, una copia de la de ejemplo; desde entonces es del mundo y los habitantes leen esa), `entorno/`, `sesiones/`, `mundo.json`; reinstalar o actualizar no lo toca |
| Caddy | `/etc/caddy/Caddyfile` | página + `/ws` al servidor, mismo origen; guarda el Caddyfile anterior en `Caddyfile.antes-del-motor` |
| Cortafuegos | ufw | abre el puerto de ssh que esté en uso, 22, 80, 443 (tcp y udp); `--sin-cortafuegos` para no tocarlo |

La página construida busca su servidor en el mismo sitio desde el que se cargó: `wss://<dominio>/ws` con HTTPS,
`ws://<ip>/ws` sin él, y también en `localhost` (un mundo en contenedor o con `arrancar.sh`). La página de
desarrollo (`npm run dev`) sigue usando `ws://localhost:8790`. `?server=ws://…` en la dirección manda siempre.

Volver a instalar (otra versión) es ejecutar el fichero nuevo: sustituye `app/` y `www/` y reinicia.

Quitarlo de la máquina (p. ej. para pasarla a la flota, que trae su propio Caddy en Docker):
`sudo bash instalar-motor.sh --desinstalar` para y borra los servicios (`numinia-motor`, `numinia-habitantes`,
`numinia-actualizar`), para y enmascara Caddy (deja libres 80 y 443) y borra `/opt/numinia-engine`. **Deja el mundo**
en `/var/lib/numinia-motor` y no toca ssh ni el cortafuegos. Instalar otra vez desenmascara Caddy.

Comandos útiles en el servidor:

```bash
systemctl status numinia-motor        # ¿está vivo?
journalctl -u numinia-motor -f        # cada 30 s: conectados, tick p99, kbit/s por persona
bash instalar-motor.sh --version      # qué versión lleva el fichero
curl -s localhost:8790/health         # {"ok":true,"version":…,"huella":"7e630965","conectados":N}
curl -s localhost:8790/status         # {"uptime":s,"conectados":N,"commitHash":"<40 hex>","version":"<build>"} (lo lee la sala de Mundos; con aventura/ficha.json, también "nombre", "descripcion", "portada")
curl -s localhost:8790/metrics        # JSON: conectados, tick p50/p99/peor (últimos 10 s), respuesta del tick, bucle, CPU, steal, memoria, kbit/s por persona…
```

`/agentes` (gestión de agentes de fuera para el panel de numinia.com: pase de numinia.com con `manage-organization`, CORS solo `https://numinia.com`; 404 si el mundo no tiene `MOTOR_PASE_CLAVE`) también pasa por Caddy. `/health` y `/status` también se ven desde fuera (`https://<dominio>/health`); `/metrics` solo desde el propio
servidor. Para leerlo desde casa (8790 ya lo usa la plaza de tu PC): `ssh -L 18790:127.0.0.1:8790 root@IP`
y abrir `http://localhost:18790/metrics`; el enjambre lo lee con `--metrics http://localhost:18790/metrics`.

## El mundo en un zip: bajarlo y subirlo

`https://<dominio>/mundo` es una página con dos botones: **Descargar el mundo** (un `.zip`) y **Subir un mundo**
(sustituye el de ahora por el del zip). Pide el código de administración: en un servidor instalado lo hace el
instalador una vez y no lo enseña nunca (`sudo cat /opt/numinia-engine/admin.env`); en la flota lo da la sala de
Mundos (`ADMIN_CODE`); en tu PC está en `claves.env`, dentro de la carpeta del mundo. Quien escribe `/dueño <código>`
en el chat es dueño **con ese código**: si el código cambia, deja de serlo (vuelve a escribirlo con el nuevo).

Qué lleva el zip (`numinia-engine/mundo@2`): `mundo.json` (el motor que lo hizo — build, commit e imagen —, la fecha
y cada fichero con sus bytes y su sha256), `datos/` (lo que guardan las funciones y los modelos subidos,
`datos/activos/`), `aventura/` (las misiones y su gente: el mundo trae su aventura) y `entorno/`; y, para arrancarlo
uno mismo, `compose.yml` (la imagen exacta de ese motor), `arrancar.sh` (sin Docker: baja ese motor de su versión de
GitHub, comprueba el sha256 y lo arranca con tu Node) y `LEEME.txt`. Estos tres no son parte del mundo (al subir se
ignoran). No lleva nunca las claves (`claves.env`), quién entró (sesiones), quién subió qué (`subidas.jsonl`) ni el
motor. Los zips de ayer (`mundo@1`, solo `datos/`) se siguen leyendo. Al subir, el servidor lo comprueba entero
antes de tocar nada (zip con contraseña, enlaces, rutas con `..`, bombas de zip, ficheros que no son los que dice
`mundo.json`: rechazado con el motivo), guarda el mundo de ahora en `/var/lib/numinia-motor/datos.antes-<fecha UTC>`
(y `aventura.antes-…`, `entorno.antes-…`; los dos últimos), pone el nuevo y se reinicia (unos segundos).

Por terminal, lo mismo:

```bash
. /opt/numinia-engine/admin.env
curl -fsS -H "Authorization: Bearer $MOTOR_ADMIN" http://127.0.0.1:8790/mundo/zip -o mundo.zip     # bajar
curl -fsS -H "Authorization: Bearer $MOTOR_ADMIN" -T mundo.zip http://127.0.0.1:8790/mundo/zip     # subir
```

## La imagen: el mismo motor en un contenedor (C1)

`Dockerfile` hace la imagen **a partir del instalador** de ese commit (`deploy/instalar-motor.sh --solo-extraer`, sin
nada más del repositorio) más el Node fijado en él (versión y sha256 por arquitectura, comprobados otra vez):

```bash
npm run deploy
docker build --build-arg COMMIT=$(git rev-parse HEAD) -t ghcr.io/numengames/numinia-engine:sha-$(git rev-parse HEAD) .
```

Se publica como `ghcr.io/numengames/numinia-engine:sha-<commit de 40>` (amd64 y arm64; el workflow de publicar, que
pega una persona con permiso). Escucha en `0.0.0.0:8790`: la página (`/`, la sirve el propio motor), `/ws`, `/health`,
`/status`, `/a/*`, `/mundo*`. Corre como `10001:10001`. **El mundo es la carpeta montada en `/mundo`**
(`datos/`, `aventura/`, `entorno/`, `sesiones/`, `mundo.json`; la primera vez se siembra la aventura de ejemplo). Las
claves vienen del entorno: `JWT_SECRET` y `ADMIN_CODE` (el fichero de claves de la flota) o `MOTOR_SECRET` y
`MOTOR_ADMIN`; sin ellas, el motor las hace una vez en `/mundo/claves.env` (600) y el registro dice dónde están, nunca
cuáles son. Al subir un mundo por `/mundo`, lo cambia y sale con 75: `restart: on-failure` lo vuelve a arrancar.

**Pase de numinia.com (H3b).** Para que el mundo acepte el pase de numinia.com (quién es cada persona y qué puede hacer),
el entorno del contenedor lleva tres variables: `MOTOR_PASE_CLAVE` (la clave pública de
`https://numinia.com/.well-known/world-pass-key.json`: el campo `publicKey`, o el documento entero), `MOTOR_PASE_MUNDO` (el id
de este mundo en numinia.com, el `aud` de sus pases) y, opcional, `MOTOR_PASE_ORG` (la organización: si se pone, el pase tiene
que ser de ella). Sin `MOTOR_PASE_CLAVE` el motor funciona como siempre y el registro lo dice en una línea; con la clave rota o
sin `MOTOR_PASE_MUNDO` no arranca y dice qué arreglar. La clave es pública (no es un secreto).

```bash
docker run -d -p 8790:8790 -v /srv/mundos/m1:/mundo --env-file claves.env ghcr.io/numengames/numinia-engine:sha-<commit>
```

La carpeta tiene que ser de `10001` (`chown 10001:10001`), o arrancar con `--user 0:0`: entonces el motor toma el
usuario dueño de la carpeta y deja de ser root al momento (con podman o docker sin root, «root» ya eres tú; un root de
verdad con una carpeta de root no arranca). Es lo que hace el `compose.yml` del zip.

Sus propias herramientas, para que una máquina no tenga que saber las reglas del zip (salen 0 si bien; si no, 1 y una
línea con el motivo):

```bash
docker run --rm --network none -v /srv/mundos/m1:/mundo:ro <imagen> copia > mundo.zip      # también en marcha: lo guardado (≤ 1 s)
docker run --rm --network none -i <imagen> comprobar < mundo.zip                           # ¿es un mundo que este motor lee?
docker run --rm --network none -i -v /srv/mundos/m2:/mundo <imagen> importar < mundo.zip   # solo en una carpeta VACÍA
```

Sin contenedor, lo mismo: `node packages/server/src/entrada.ts copia|comprobar|importar` con `MOTOR_MUNDO=<carpeta>`.

## Ver cómo entra cada jugador (T1)

Cada sesión de un navegador se guarda en `/var/lib/numinia-motor/sesiones/sesiones-<día UTC>.jsonl` (14 días,
sin IP). Desde el servidor:

```
curl -s localhost:8790/sesiones                     # quién está dentro ahora y su último pulso (JSON)
cd /opt/numinia-engine/app && MOTOR_MUNDO=/var/lib/numinia-motor ../node/bin/node packages/server/src/sesiones-ver.ts
```

Desde casa, por el túnel (`ssh -L 18790:localhost:8790 …`): `npm run sesiones -- --url http://localhost:18790`.

## Lo que guardan las funciones (S4)

`/var/lib/numinia-motor/datos/<función>.json` + `.jsonl` (texto). Para una copia de seguridad basta copiar esa
carpeta; para empezar de cero, parar el servicio y vaciarla.

## Quién recibió una recompensa (U14 (6))

Cada recompensa de misión concedida a un jugador con identidad queda apuntada una vez en `datos/misiones.*`. En CSV
(`jugador,nombre,mision,recompensas,instante,estado`), con el servicio en marcha:

```
cd /opt/numinia-engine/app && ../node/bin/node packages/server/src/concesiones.ts /var/lib/numinia-motor > concesiones.csv
docker exec <contenedor> /opt/numinia-engine/node/bin/node packages/server/src/concesiones.ts /mundo vuelo-del-maestro > concesiones.csv
```

## Construir en el mundo (H1)

Por defecto todos construyen en un mundo nuevo instalado (personas y habitantes IA): `--construir nadie` lo empieza cerrado.
Eso solo siembra el mundo la primera vez; desde entonces lo dicen sus roles, que viven en su carpeta y viajan en su zip
(`datos/roles`), y lo cambia un dueño en el chat: `/construir nadie` o `/construir todos` (igual `/voz no` | `/voz sí` para
los micrófonos, que `MOTOR_VOZ=no` solo siembra). Volver a instalar con otro `--construir` ya no cambia un mundo hecho. Lo construido se guarda en `datos/objetos.json` + `.jsonl`. Los modelos que
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
pasado un tope o con el proveedor caído, contestan con su guion. El mundo puede decir más en el fichero de cada
habitante (`aventura/habitantes/<id>.json`, viaja en el zip): `"cerebro": { "persona": …, "modelo": "claude-haiku-4-5",
"tope": 100 }` = ese habitante piensa con ese modelo (si no, el de la instalación) y hace como mucho 100 llamadas al día
(UTC), además de los topes de arriba. La clave nunca va ahí: el fichero que lleve algo con pinta de clave no se carga.

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
root). La prueba local cubre el fichero, el desempaquetado y el servidor desempaquetado con el Node fijado, sobre una
carpeta de mundo nueva y sirviendo su página (`deploy-check`); la imagen se construye y se prueba con podman sin root.
La prueba real de la instalación es la tarea X3, con Pablo.
