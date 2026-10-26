#!/usr/bin/env python3
"""tren_conciliar.py — read-only. Which `ready` cards of motor-vr are already built?
Evidence order: (1) the card id t_xxxxxxxx in a commit message; (2) the story code (H4b, M16, X3...) AND the MIS-n tag
or the code alone in a commit subject, marked 'probable'. Lists: HECHA_EN_MAIN, HECHA_EN_LOTE_PENDIENTE, PENDIENTE.
Closes nothing. Usage: tren_conciliar.py [--json]"""
import os
import json, re, subprocess, sys
from pathlib import Path

P = Path(os.environ.get("TREN_HOME") or Path(__file__).resolve().parents[1])   # Hermes profile directory
WT = P / "work/numinia-engine-tren"


def sh(c):
    return subprocess.run(c, cwd=WT, shell=True, capture_output=True, text=True).stdout


sh("git fetch -q origin --prune")
cards = json.loads(subprocess.run(["hermes", "-p", "ursa", "kanban", "--board", "motor-vr", "list", "--status", "ready", "--json"],
                                  capture_output=True, text=True).stdout)


def log(ref, extra=""):
    return [l.split("\x1f") for l in sh(f"git log {ref} {extra} --format='%h%x1f%s%x1f%b%x1e'").split("\x1e") if l.strip()]


main = log("origin/main")
lotes = []
for b in sh("git branch -r --list 'origin/lote/*' 'origin/lote-wip/*'").split():
    lotes += [(b, c) for c in log(b, "^origin/main")]


def busca(card, commits):
    tid = card["id"]
    m = re.search(r"MIS-(\d+)", card["title"])
    codes = [c for c in re.findall(r"(?<![A-Za-z0-9])([A-Z]\d{1,2}[a-z]?)(?![A-Za-z0-9])", card["title"].split("·", 1)[-1][:60]) if not re.fullmatch(r"MIS", c)]
    for c in commits:
        h, subj, body = (c + ["", ""])[:3]
        txt = subj + " " + body
        if tid in txt:
            return h, "fuerte", subj
    for c in commits:
        h, subj, body = (c + ["", ""])[:3]
        txt = subj + " " + body
        if codes and any(re.search(rf"(?<![A-Za-z0-9]){code}(?![A-Za-z0-9])", txt) for code in codes) and m and f"MIS-{m.group(1)}" in txt:
            return h, "probable", subj
    return None


res = {"HECHA_EN_MAIN": [], "HECHA_EN_LOTE_PENDIENTE": [], "PENDIENTE": []}
for card in cards:
    r = busca(card, main)
    if r:
        res["HECHA_EN_MAIN"].append((card["id"], card["title"][:70], *r)); continue
    for b, c in lotes:
        r = busca(card, [c])
        if r:
            res["HECHA_EN_LOTE_PENDIENTE"].append((card["id"], card["title"][:70], *r, b)); break
    else:
        res["PENDIENTE"].append((card["id"], card["title"][:90]))
if "--json" in sys.argv:
    print(json.dumps(res, ensure_ascii=False))
else:
    for k, v in res.items():
        print(f"{k}: {len(v)}")
        for x in v[: (len(v) if k != 'PENDIENTE' else 0)]:
            print("   ", *x)
