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
```

Lo que **no** está probado aún: la instalación real con root, systemd, Caddy y ufw (aquí no hay
contenedores ni root). La prueba local cubre el fichero, el desempaquetado y el servidor desempaquetado
con el Node fijado. La prueba real es la tarea X3, con Pablo.
