#!/usr/bin/env bash
# plaza: the always-on local plaza (instance server + 8 bots + AI inhabitants + page), detached from any agent session.
# Usage: tools/plaza.sh start|stop|restart|status
#   restart = server + bots only (the page reloads by itself when client code changes)
set -u
cd "$(dirname "$0")/.."
RUN=.run; mkdir -p "$RUN"
SP=${PLAZA_SERVER_PORT:-8790}; PP=${PLAZA_PORT:-5173}
BOTS="bots.ts --n 8 --url ws://127.0.0.1:$SP"
HAB="packages/agent/src/main.ts"
# P4: the agents' secret of the home plaza (a dev value: an installed server makes its own, deploy/)
export MOTOR_AGENTES_SECRET=${MOTOR_AGENTES_SECRET:-plaza-de-casa-agentes-0001}
pid_on() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }
status() {
  local s p b
  s=$([ -n "$(pid_on "$SP")" ] && echo encendido || echo apagado)
  p=$([ -n "$(pid_on "$PP")" ] && echo encendida || echo apagada)
  b=$(pgrep -fc "$BOTS" || true); h=$(pgrep -fc "$HAB" || true)
  echo "servidor :$SP $s · página :$PP $p · procesos de bots $b · habitantes $h"
}
start() {
  if [ -z "$(pid_on "$SP")" ]; then
    PORT=$SP MOTOR_CONSTRUIR=${MOTOR_CONSTRUIR:-todos} setsid nohup nice -n 19 node packages/server/src/main.ts >> "$RUN/server.log" 2>&1 < /dev/null &
    sleep 1.5
  fi
  if ! pgrep -f "$BOTS" > /dev/null; then
    setsid nohup nice -n 19 node packages/server/src/$BOTS >> "$RUN/bots.log" 2>&1 < /dev/null &
  fi
  if ! pgrep -f "$HAB" > /dev/null; then
    MOTOR_URL=ws://127.0.0.1:$SP setsid nohup nice -n 19 node $HAB >> "$RUN/habitantes.log" 2>&1 < /dev/null &
  fi
  if [ -z "$(pid_on "$PP")" ]; then
    PLAZA_PORT=$PP setsid nohup nice -n 19 npx vite --config apps/plaza/vite.config.mjs >> "$RUN/vite.log" 2>&1 < /dev/null &
  fi
  sleep 2; status
}
stop_server() {
  local p; p=$(pid_on "$SP"); [ -n "$p" ] && kill "$p"
  pkill -f "$BOTS" 2>/dev/null; pkill -f "$HAB" 2>/dev/null; sleep 1
}
stop_page() { local p; p=$(pid_on "$PP"); [ -n "$p" ] && kill "$p"; sleep 1; }
case "${1:-status}" in
  start) start ;;
  stop) stop_server; stop_page; status ;;
  restart) stop_server; start ;;
  status) status ;;
  *) echo "uso: $0 start|stop|restart|status"; exit 2 ;;
esac
