# The engine as a container image (C1): the SAME bytes as the bare installer of this commit
# (deploy/instalar-motor.sh, made by `npm run deploy`, unpacked with --solo-extraer) plus the Node LTS pinned in that
# installer (tools/build-deploy.mjs NODE: version + sha256 per architecture), checked here again.
#   npm run deploy && docker build --build-arg COMMIT=$(git rev-parse HEAD) -t ghcr.io/numengames/numinia-engine:sha-$(git rev-parse HEAD) .
# Runs as 10001:10001 on 0.0.0.0:8790: the page (/), WebSocket (/ws), /health, /status, /a/*, /e/*, /mundo*.
# The world is the folder mounted at /mundo (C2). Keys come from the environment (C3: JWT_SECRET + ADMIN_CODE, the
# fleet's key file; or MOTOR_SECRET + MOTOR_ADMIN); never inside the image.
# Its own tools (C6): `copia`, `comprobar`, `importar` (packages/server/src/mundo-cli.ts).
# Built without emulation for any platform: the only per-architecture step (Node) runs on the build machine.

# debian:13-slim, pinned by its multi-architecture index (amd64 + arm64)
ARG BASE=docker.io/library/debian:13-slim@sha256:a29215f6a35e51e22adffa17f89e9d2ef06214e64a2bad10d765c46aea49f11f

FROM --platform=$BUILDPLATFORM $BASE AS motor
ARG TARGETARCH
# the commit this image is tagged with (sha-<COMMIT>): it must be the installer's own (app/build.json)
ARG COMMIT=""
RUN apt-get update -q && apt-get install -y -q --no-install-recommends ca-certificates curl xz-utils > /dev/null && rm -rf /var/lib/apt/lists/*
COPY deploy/instalar-motor.sh /tmp/instalar-motor.sh
RUN set -eu; \
    bash /tmp/instalar-motor.sh --solo-extraer /opt/numinia-engine; \
    rm /opt/numinia-engine/actualizar.sh; \
    eval "$(grep -E '^NODE_(VERSION|SHA256_X64|SHA256_ARM64)="[0-9a-f.]+"$' /tmp/instalar-motor.sh)"; \
    case "$TARGETARCH" in amd64) A=x64; S=$NODE_SHA256_X64 ;; arm64) A=arm64; S=$NODE_SHA256_ARM64 ;; *) echo "arquitectura $TARGETARCH: solo amd64 y arm64"; exit 1 ;; esac; \
    f="node-v$NODE_VERSION-linux-$A"; \
    curl -fsSL --retry 3 -o "/tmp/$f.tar.xz" "https://nodejs.org/dist/v$NODE_VERSION/$f.tar.xz"; \
    echo "$S  /tmp/$f.tar.xz" | sha256sum -c -; \
    mkdir -p /opt/numinia-engine/node/bin; \
    tar -xJf "/tmp/$f.tar.xz" -C /opt/numinia-engine/node --strip-components=1 "$f/bin/node" "$f/LICENSE"; \
    rm "/tmp/$f.tar.xz"; \
    if [ -n "$COMMIT" ]; then grep -q "\"commit\": \"$COMMIT\"" /opt/numinia-engine/app/build.json || { echo "el instalador no es el commit $COMMIT:"; cat /opt/numinia-engine/app/build.json; exit 1; }; fi; \
    chmod -R a+rX,go-w /opt/numinia-engine; \
    mkdir -m 0700 /mundo

FROM $BASE
COPY --from=motor /opt/numinia-engine /opt/numinia-engine
COPY --from=motor --chown=10001:10001 /mundo /mundo
ENV PORT=8790 HOST=0.0.0.0 NODE_ENV=production STATS_MS=30000 \
    MOTOR_MUNDO=/mundo WWW_DIR=/opt/numinia-engine/www MOTOR_CONSTRUIR=todos MOTOR_REINICIO=salir
WORKDIR /opt/numinia-engine/app
USER 10001:10001
EXPOSE 8790
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["/opt/numinia-engine/node/bin/node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8790)+'/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]
LABEL org.opencontainers.image.source="https://github.com/numengames/numinia-engine" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.title="numinia-engine" \
      org.opencontainers.image.description="Numinia Engine: un mundo 3D en un puerto (8790); el mundo es la carpeta /mundo"
ENTRYPOINT ["/opt/numinia-engine/node/bin/node", "packages/server/src/entrada.ts"]
