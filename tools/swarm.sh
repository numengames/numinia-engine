#!/usr/bin/env bash
# swarm: a bounded load test over REAL WebSockets, on its own port, never touching the running plaza.
# Usage: tools/swarm.sh [people=1000] [seconds=30] [port=8791]
# Light by design: server on one core, bots on two, nice 19, everything stops by itself.
set -u
N=${1:-1000}; SECS=${2:-30}; PORT=${3:-8791}
cd "$(dirname "$0")/.."
LOG=${TMPDIR:-/tmp}/swarm-$PORT
PORT=$PORT STATS_MS=8000 timeout $((SECS + 6)) taskset -c 2 nice -n 19 node packages/server/src/main.ts > "$LOG-server.log" 2>&1 &
sleep 1.5
HALF=$((N / 2))
timeout "$SECS" taskset -c 3 nice -n 19 node packages/server/src/bots.ts --n "$HALF" --url "ws://127.0.0.1:$PORT" > "$LOG-bots1.log" 2>&1 &
timeout "$SECS" taskset -c 4 nice -n 19 node packages/server/src/bots.ts --n $((N - HALF)) --url "ws://127.0.0.1:$PORT" > "$LOG-bots2.log" 2>&1 &
wait
grep -h "instancia\]" "$LOG-server.log"
grep -h "bots\]" "$LOG-bots1.log" "$LOG-bots2.log"
