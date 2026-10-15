#!/usr/bin/env bash
# auto: the rails of the unattended shift. Run it from the auto worktree (branch `auto`).
#   start   take the lock (prints BUSY and exits 3 if someone holds it), sync auto with main, show state
#   e2e     browser checks (chromium + firefox) on spare ports 8792/5174 — never the user's plaza
#   finish  tree clean + gates green -> fast-forward main to auto (only if main's tree is clean)
#           -> restart the plaza if server-side code changed -> release the lock
#   lock | unlock | status   for interactive sessions: take the lock before editing, release after
set -u
cd "$(dirname "$0")/.."
HERE=$(pwd)
COMMON=$(git rev-parse --git-common-dir); case $COMMON in /*) ;; *) COMMON="$HERE/$COMMON" ;; esac
LOCK="$COMMON/auto.lock"
MAIN=$(git worktree list --porcelain | awk '/^worktree /{w=$2} /^branch refs\/heads\/main$/{print w}')
STALE_MIN=90
TMP=${TMPDIR:-/tmp}
pid_on() { ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2; }

take_lock() {
  if [ -f "$LOCK" ]; then
    local age=$(( ( $(date +%s) - $(stat -c %Y "$LOCK") ) / 60 ))
    if [ "$age" -lt "$STALE_MIN" ]; then echo "BUSY: $(cat "$LOCK") (hace $age min)"; exit 3; fi
    echo "aviso: cerrojo viejo ($age min) — $(cat "$LOCK"); lo retiro"
  fi
  echo "$1 $(date -Iseconds)" > "$LOCK"
}
release_lock() { rm -f "$LOCK"; }

case "${1:-status}" in
  start)
    take_lock turno
    branch=$(git branch --show-current)
    [ "$branch" = auto ] || { echo "ERROR: estoy en '$branch', el turno trabaja en la rama auto"; release_lock; exit 2; }
    if [ -n "$(git status --short)" ]; then
      echo "SUCIO: un turno anterior dejó cambios sin guardar:"; git status --short | head -20
    else
      behind=$(git rev-list --count auto..main); ahead=$(git rev-list --count main..auto)
      if [ "$behind" -gt 0 ] && [ "$ahead" -eq 0 ]; then git merge -q --ff-only main && echo "al día con main (+$behind commits)"
      elif [ "$behind" -gt 0 ]; then
        git rebase -q main 2> /dev/null && echo "auto rebasada sobre main" || { git rebase --abort; echo "AVISO: auto y main divergen con conflicto; sigo sobre auto"; }
      fi
    fi
    echo "rama auto: $(git rev-parse --short HEAD) · por delante de main: $(git rev-list --count main..auto) commits"
    echo "--- última entrada del diario ---"; awk '/^## /{buf=""} {buf=buf $0 "\n"} END{printf "%s", buf}' docs/RUNLOG.md | head -25
    echo "--- siguiente tarea pendiente desatendible ---"; grep -m1 -E '^\| *[A-Z][0-9]+ .*\| *pendiente *\| *sí *\|' docs/BACKLOG.md || echo "(ninguna)"
    ;;
  e2e)
    PORT=8792 setsid nohup nice -n 19 node packages/server/src/main.ts > "$TMP/auto-e2e-server.log" 2>&1 < /dev/null &
    PLAZA_PORT=5174 setsid nohup nice -n 19 npx vite --config apps/plaza/vite.config.mjs > "$TMP/auto-e2e-vite.log" 2>&1 < /dev/null &
    for _ in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:5174/ && [ -n "$(pid_on 8792)" ] && break; sleep 0.5; done
    rc=0
    for b in chromium firefox; do
      if BROWSER=$b BASE="http://127.0.0.1:5174/?server=ws://127.0.0.1:8792" timeout 120 taskset -c 0-1 nice -n 19 node tools/e2e.mjs > "$TMP/auto-e2e-$b.log" 2>&1
      then echo "e2e $b OK"; else echo "e2e $b FALLA"; tail -15 "$TMP/auto-e2e-$b.log"; rc=1; fi
    done
    # AR leg (J8): IWER emulates a Quest 3 with a floor; also checks that a device without WebXR shows no AR button
    if BASE="http://127.0.0.1:5174/?webgl2&server=ws://127.0.0.1:8792" timeout 120 taskset -c 0-1 nice -n 19 node tools/e2e-ar.mjs > "$TMP/auto-e2e-ar.log" 2>&1
    then echo "e2e AR (IWER) OK"; else echo "e2e AR FALLA"; tail -15 "$TMP/auto-e2e-ar.log"; rc=1; fi
    # https leg (B1): dev:lan's certificate + /ws proxied on the same origin, wss from the page
    node tools/dev-lan.mjs --cert-only > /dev/null
    PLAZA_PORT=5175 PLAZA_SERVER_PORT=8792 PLAZA_HTTPS_CERT=.cert/lan.crt PLAZA_HTTPS_KEY=.cert/lan.key setsid nohup nice -n 19 npx vite --config apps/plaza/vite.config.mjs > "$TMP/auto-e2e-vite-https.log" 2>&1 < /dev/null &
    for _ in $(seq 1 40); do [ -n "$(pid_on 5175)" ] && break; sleep 0.5; done
    if HTTPS=1 BROWSER=chromium BASE="https://127.0.0.1:5175/?webgl2&server=wss://127.0.0.1:5175/ws" timeout 120 taskset -c 0-1 nice -n 19 node tools/e2e.mjs > "$TMP/auto-e2e-https.log" 2>&1
    then echo "e2e https (wss por /ws del mismo origen) OK"; else echo "e2e https FALLA"; tail -15 "$TMP/auto-e2e-https.log"; rc=1; fi
    for p in 8792 5174 5175; do pid=$(pid_on $p); [ -n "$pid" ] && kill "$pid"; done
    exit $rc
    ;;
  finish)
    [ -z "$(git status --short)" ] || { echo "SUCIO: guarda (commit) o aparca (git stash push -u -m ...) antes de terminar"; git status --short | head; exit 4; }
    if ! nice -n 19 node tools/gates.mjs > "$TMP/auto-gates.log" 2>&1; then
      echo "PUERTAS EN ROJO: main no avanza"; tail -12 "$TMP/auto-gates.log"; release_lock; exit 5
    fi
    tail -9 "$TMP/auto-gates.log"
    if [ -n "$MAIN" ] && [ -z "$(git -C "$MAIN" status --short --untracked-files=no)" ] && git merge-base --is-ancestor main auto; then
      if [ "$(git rev-list --count main..auto)" -gt 0 ]; then
        server_changed=$(git diff --name-only main auto | grep -cE '^packages/(server|instance|net|sim|core|ecs|schema)/' || true)
        git -C "$MAIN" merge -q --ff-only auto && echo "main avanzada a $(git rev-parse --short auto)"
        [ "$server_changed" -gt 0 ] && "$MAIN/tools/plaza.sh" restart
      else echo "nada nuevo que llevar a main"; fi
    else
      echo "main NO avanzada (tiene cambios a mano o divergió): el trabajo queda en la rama auto para revisión"
    fi
    release_lock; echo "cerrojo liberado"
    ;;
  lock) take_lock interactivo; echo "cerrojo tomado: los turnos esperarán" ;;
  unlock) release_lock; echo "cerrojo liberado" ;;
  status)
    [ -f "$LOCK" ] && echo "cerrojo: $(cat "$LOCK")" || echo "cerrojo: libre"
    echo "main $(git rev-parse --short main) · auto $(git rev-parse --short auto 2>/dev/null) · auto por delante: $(git rev-list --count main..auto 2>/dev/null)"
    ;;
  *) echo "uso: $0 start|e2e|finish|lock|unlock|status"; exit 2 ;;
esac
