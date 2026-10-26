#!/usr/bin/env python3
"""Pre-run of the train (cron L2): ONE limit only, the week at 90 % (Pablo 2026-10-26: «los límites no tienen sentido»).
The 5-hour window is the provider's own limit and is not rationed here. Unreadable usage = run. 0 tokens."""
import json, subprocess
try:
    d = json.loads(subprocess.run(["hermes", "usage", "--json"], capture_output=True, text=True, timeout=60).stdout)
    semana = next(w["used_percent"] for w in d["windows"] if w["label"] == "Current week")
except Exception:
    semana = 0
if semana >= 90:
    print(f"semana al {semana:.0f} %: el tren espera al reinicio")
    print(json.dumps({"wakeAgent": False}))
else:
    # Candidate list, 0 tokens: ready, unassigned motor-vr cards that are not design/measure/research/waiting-for-Pablo.
    import re
    MALAS = re.compile(r"espera a Pablo|dise\u00f1o|medida|medir|investigaci|plan |\[Despu\u00e9s\]|valorar|transcribir|sesi\u00f3n con Pablo|Opus|\(Opus\)", re.I)
    out = subprocess.run(["hermes", "-p", "ursa", "kanban", "--board", "motor-vr", "ls", "--status", "ready", "--json"],
                         capture_output=True, text=True).stdout
    try:
        cs = [t for t in json.loads(out) if not t.get("assignee") and not MALAS.search(t["title"])]
    except Exception:
        cs = []
    print("CANDIDATAS (ready, sin asignar, construibles; recorre TODAS hasta construir una; no termines sin PR si hay alguna):")
    for t in cs[:15]:
        print(f"- {t['id']} {t['title'][:110]}")
    print(json.dumps({"wakeAgent": True}))
