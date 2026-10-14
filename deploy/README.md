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
curl -s localhost:8790/metrics        # JSON: conectados, tick p50/p99/peor (últimos 10 s), kbit/s por persona, memoria, retraso, dilatación
```

`/health` también se ve desde fuera (`https://<dominio>/health`); `/metrics` solo desde el propio
servidor. Para leerlo desde casa (8790 ya lo usa la plaza de tu PC): `ssh -L 18790:127.0.0.1:8790 root@IP`
y abrir `http://localhost:18790/metrics`; el enjambre lo lee con `--metrics http://localhost:18790/metrics`.

## Medir los límites: el enjambre

Robots que hablan el protocolo real, con tiempo tope (máx. 120 s):

```bash
# desde tu PC, contra el servidor remoto (sin métricas salvo que abras el túnel ssh de arriba)
tools/swarm.sh --url wss://motor.ejemplo.com/ws --n 200 --secs 30
# en el propio servidor (lee /metrics cada 5 s y da el resumen al final)
cd /opt/numinia-engine/app && /opt/numinia-engine/node/bin/node packages/server/src/swarm.ts --en-servidor --n 500 --secs 30
```

Ojo: robots y servidor en la misma máquina compiten por la CPU; el número bueno es el remoto.

Lo que **no** está probado aún: la instalación real con root, systemd, Caddy y ufw (aquí no hay
contenedores ni root). La prueba local cubre el fichero, el desempaquetado y el servidor desempaquetado
con el Node fijado. La prueba real es la tarea X3, con Pablo.
