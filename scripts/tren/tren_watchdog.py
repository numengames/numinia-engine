#!/usr/bin/env python3
"""tren_watchdog.py — no-agent cron, 0 tokens. Silent (empty stdout) when all is well; prints warnings otherwise.
Checks: (1) ready+assigned cards but nothing running for > 1 h; (2) a lote/N older than 24 h without PR;
(3) `hermes cron doctor` findings; (4) kanban diagnostics (stranded_in_ready, stale_running, review_dependency_deadlock).
--test forces one warning (to see it arrive in the chat)."""
import json, os, re, subprocess, sys, time
from pathlib import Path

P = Path(os.environ.get("TREN_HOME") or Path(__file__).resolve().parents[1])   # Hermes profile directory
WT = P / "work/numinia-engine-tren"
ESTADO = P / "work/tren/watchdog-estado.json"
avisos = []


def run(*a, cwd=None, env=None):
    return subprocess.run(a, capture_output=True, text=True, cwd=cwd, env=env, timeout=120)


est = json.load(open(ESTADO)) if ESTADO.exists() else {}
try:
    cards = json.loads(run("hermes", "-p", "ursa", "kanban", "--board", "motor-vr", "list", "--json").stdout)
    cards = cards if isinstance(cards, list) else cards.get("tasks", [])
    listas = [t for t in cards if t["status"] == "ready" and t.get("assignee")]
    corre = [t for t in cards if t["status"] == "running"]
    if listas and not corre:
        est.setdefault("sin_correr_desde", time.time())
        if time.time() - est["sin_correr_desde"] > 3600:
            avisos.append(f"{len(listas)} tarjetas asignadas en ready y nada corriendo desde hace > 1 h (p. ej. {listas[0]['id']})")
    else:
        est.pop("sin_correr_desde", None)
except Exception as e:
    avisos.append(f"watchdog no pudo leer el kanban: {e}"[:150])

try:
    tok = run("python3", str(P / "scripts/gh_app_token.py"), "engine").stdout.strip().splitlines()[-1]
    env = dict(os.environ, GH_TOKEN=tok)
    run("git", "fetch", "-q", "origin", "--prune", cwd=WT)
    for b in run("git", "branch", "-r", "--list", "origin/lote/*", cwd=WT).stdout.split():
        n = b.rsplit("/", 1)[1]
        if not n.isdigit() or int(n) <= 8:
            continue
        prs = json.loads(run("gh", "pr", "list", "-R", "numengames/numinia-engine", "--state", "all", "--head", f"lote{n}-pr", "--json", "number", env=env).stdout or "[]")
        edad = (time.time() - int(run("git", "log", "-1", "--format=%ct", b, cwd=WT).stdout.strip())) / 3600
        if not prs and edad > 24:
            avisos.append(f"lote/{n} lleva {edad:.0f} h sin PR")
except Exception as e:
    avisos.append(f"watchdog no pudo revisar lotes: {e}"[:150])

d = run("hermes", "-p", "ursa", "cron", "doctor")
if d.returncode or "no issues" not in d.stdout:
    avisos.append("cron doctor: " + d.stdout.strip().replace("\n", " ")[:200])
dg = run("hermes", "-p", "ursa", "kanban", "--board", "motor-vr", "diagnostics").stdout
if re.search(r"stranded_in_ready|stale_running|review_dependency_deadlock", dg):
    avisos.append("kanban diagnostics: " + dg.strip().replace("\n", " ")[:200])
if "--test" in sys.argv:
    avisos.append("PRUEBA del watchdog: si lees esto, los avisos llegan")
ESTADO.write_text(json.dumps(est))
if avisos:
    print("Tren: " + " | ".join(avisos))
