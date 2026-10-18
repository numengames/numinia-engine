#!/usr/bin/env bash
# swarm: a bounded load test over REAL WebSockets.
# Local (own server on a spare port, never touching the running plaza):
#   tools/swarm.sh [people=1000] [seconds=30] [port=8791]
# Against a server that is already running (remote URL, or on the server itself) — packages/server/src/swarm.ts:
#   tools/swarm.sh --url wss://motor.ejemplo.com/ws --n 200 --secs 30 [--metrics http://…/metrics]
#   tools/swarm.sh --en-servidor --n 500 --secs 30
# Profiles (stairs, soak, join storm) and the report: see docs/MEDIDAS.md. Env: SWARM_CPUS (default 3-5) · SWARM_MAX seconds (default 3900).
# Light by design: server on one core, bots on two, everything stops by itself.
# The SERVER (local mode) gets a core the agents do not use (AGENTS.md sends heavy work to 2-5) and normal priority:
# on core 2 with nice 19 it measured the neighbours (D3). SRV_CPUS (default 6; unpinned if the machine has fewer cores)
# · SRV_NICE (default 0). The bots stay nice 19: their own saturation is judged by the report.
set -u
cd "$(dirname "$0")/.."
case "${1:-}" in
  --url|--en-servidor) exec timeout "${SWARM_MAX:-3900}" taskset -c "${SWARM_CPUS:-3-5}" nice -n 19 node packages/server/src/swarm.ts "$@" ;;
esac
N=${1:-1000}; SECS=${2:-30}; PORT=${3:-8791}
LOG=${TMPDIR:-/tmp}/swarm-$PORT
SRV_CPUS=${SRV_CPUS:-6}; FIJA=(taskset -c "$SRV_CPUS")
[ "${SRV_CPUS%%[,-]*}" -lt "$(nproc --all)" ] 2>/dev/null || FIJA=()
PORT=$PORT STATS_MS=8000 timeout $((SECS + 6)) "${FIJA[@]}" nice -n "${SRV_NICE:-0}" node packages/server/src/main.ts > "$LOG-server.log" 2>&1 &
sleep 1.5
HALF=$((N / 2))
timeout "$SECS" taskset -c 3 nice -n 19 node packages/server/src/bots.ts --n "$HALF" --url "ws://127.0.0.1:$PORT" > "$LOG-bots1.log" 2>&1 &
timeout "$SECS" taskset -c 4 nice -n 19 node packages/server/src/bots.ts --n $((N - HALF)) --seed "$HALF" --url "ws://127.0.0.1:$PORT" > "$LOG-bots2.log" 2>&1 &
sleep $((SECS - 2))
curl -s --max-time 2 "http://127.0.0.1:$PORT/metrics" > "$LOG-metrics.json" && echo "[metrics] $(cat "$LOG-metrics.json")"
wait
grep -h "instancia\]" "$LOG-server.log"
grep -h "bots\]" "$LOG-bots1.log" "$LOG-bots2.log"
