#!/usr/bin/env python3
"""tren_progreso.py — how far the unattended missions mode (el tren) has got. 0 tokens, read-only on boards.

Counts, per mission MIS-n (cards titled «MIS-n · …» on every board), the cards done / live (archived ones are
splits and do not count). A mission is DONE when it has >= 1 live card and all of them are done.
Writes work/tren/PROGRESO.md (overwrites; the line is also appended to work/tren/historia.tsv) and prints a summary.
Usage: tren_progreso.py [--area motor]    (motor = boards motor-vr; default all boards)
"""
import os
import collections, datetime, json, re, subprocess, sys
from pathlib import Path

P = Path(os.environ.get("TREN_HOME") or Path(__file__).resolve().parents[1])   # Hermes profile directory
BOARDS = ["hermes-mejora", "motor-vr", "movil", "numen-games", "numinia-com", "numinia-org", "nwos"]
if "--area" in sys.argv and sys.argv[sys.argv.index("--area") + 1] == "motor":
    BOARDS = ["motor-vr"]

cards = collections.defaultdict(list)
for b in BOARDS:
    out = subprocess.run(["hermes", "-p", "ursa", "kanban", "--board", b, "ls", "--json", "--archived"],
                         capture_output=True, text=True).stdout
    try:
        data = json.loads(out)
    except Exception:
        continue
    for t in data:
        m = re.match(r"\s*MIS-0*(\d+)\s*·", t.get("title", ""))
        if m and t["status"] != "archived":
            cards[int(m.group(1))].append(t["status"])

done = [k for k, v in cards.items() if all(s == "done" for s in v)]
tot_cards = sum(len(v) for v in cards.values())
done_cards = sum(s == "done" for v in cards.values() for s in v)
now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
linea = f"{now}\tmisiones {len(done)}/{len(cards)} ({100*len(done)//max(1,len(cards))} %)\ttarjetas {done_cards}/{tot_cards} ({100*done_cards//max(1,tot_cards)} %)"
d = P / "work/tren"
d.mkdir(parents=True, exist_ok=True)
with open(d / "historia.tsv", "a") as f:
    f.write(linea + "\n")
vivas = sorted((k, collections.Counter(v)) for k, v in cards.items() if k not in done)
txt = [f"# Progreso del tren — {now}", "", f"- Misiones hechas: **{len(done)} de {len(cards)}** ({100*len(done)//max(1,len(cards))} %)",
       f"- Tarjetas hechas: **{done_cards} de {tot_cards}** ({100*done_cards//max(1,tot_cards)} %)", "", "## Misiones abiertas (tarjetas por estado)"]
txt += [f"- MIS-{k}: {dict(c)}" for k, c in vivas]
(d / "PROGRESO.md").write_text("\n".join(txt) + "\n")
print(linea)
