# deploy/ — montar el motor en un servidor pequeño

Un solo fichero lo instala todo: `instalar-motor.sh`. No está en git (lleva dentro la página construida);
se genera aquí, en tu PC:

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
curl -s localhost:8790/health         # {"ok":true,"version":…,"huella":"fa94375e","conectados":N}
curl -s localhost:8790/metrics        # JSON: conectados, tick p50/p99/peor (últimos 10 s), respuesta del tick, bucle, CPU, steal, memoria, kbit/s por persona…
```

`/health` también se ve desde fuera (`https://<dominio>/health`); `/metrics` solo desde el propio
servidor. Para leerlo desde casa (8790 ya lo usa la plaza de tu PC): `ssh -L 18790:127.0.0.1:8790 root@IP`
y abrir `http://localhost:18790/metrics`; el enjambre lo lee con `--metrics http://localhost:18790/metrics`.

## Ver cómo entra cada jugador (T1)

Cada sesión de un navegador se guarda en `/var/lib/numinia-motor/sesiones/sesiones-<día UTC>.jsonl` (14 días,
sin IP). Desde el servidor:

```
curl -s localhost:8790/sesiones                     # quién está dentro ahora y su último pulso (JSON)
cd /opt/numinia-engine/app && SESIONES_DIR=/var/lib/numinia-motor/sesiones ../node/bin/node packages/server/src/sesiones-ver.ts
```

Desde casa, por el túnel (`ssh -L 18790:localhost:8790 …`): `npm run sesiones -- --url http://localhost:18790`.

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
