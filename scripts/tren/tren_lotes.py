#!/usr/bin/env python3
"""tren_lotes.py — the unattended PR conveyor (0 tokens). Pablo 2026-10-26.

Batches («lotes») are stacked branches lote/N on numinia-engine (lote/N = lote/(N-1) + its own commits), already built
and tested by the builders. Missing was the plumbing: one PR at a time, rebased on main, version bumped, gates run.
Each pass: if the engine has no open non-bot PR and the next lote has no PR yet, open it as ONE commit
(diff lote/(N-1)..lote/N applied on main, package*.json left out, minor version +1, `npm run gates` green).
On failure it cleans the tree and prints what stopped it (wakeAgent true = a human/agent must look).
Usage: tren_lotes.py [--seco]   (--seco = decide and print, change nothing)
"""
import json, os, re, subprocess, sys
from pathlib import Path

P = Path(os.environ.get("TREN_HOME") or Path(__file__).resolve().parents[1])   # Hermes profile directory
WT = P / "work/numinia-engine-tren"
LOTES = P / "work/motor-vr/lotes"
REPO = "numengames/numinia-engine"
SECO = "--seco" in sys.argv


def sh(cmd, cwd=WT, check=False, env=None):
    r = subprocess.run(cmd, cwd=cwd, shell=isinstance(cmd, str), capture_output=True, text=True, env=env)
    if check and r.returncode:
        raise RuntimeError(f"{cmd}: {r.stderr.strip() or r.stdout.strip()}"[:600])
    return r


def out(msg, wake=False):
    if wake or msg.startswith("PR abierto") or os.environ.get("TREN_VERBOSE"):
        print(msg)   # only news is delivered; waiting states stay silent
    print(json.dumps({"wakeAgent": wake}))
    sys.exit(0)


tok = subprocess.run(["python3", str(P / "scripts/gh_app_token.py"), "engine"], capture_output=True, text=True).stdout.strip().splitlines()[-1]
env = dict(os.environ, GH_TOKEN=tok)
gh = lambda *a: sh(["gh", *a], env=env)

abiertos = json.loads(gh("pr", "list", "-R", REPO, "--state", "open", "--json", "number,title,author").stdout or "[]")
abiertos = [p for p in abiertos if "dependabot" not in p["author"]["login"]]
if abiertos:
    out(f"hueco ocupado por #{abiertos[0]['number']} {abiertos[0]['title'][:60]}")

sh("git fetch -q origin")
ramas = sorted(int(m.group(1)) for l in sh("git branch -r --list 'origin/lote/*'").stdout.split() if (m := re.match(r"origin/lote/(\d+)$", l)))
hecho = {n for n in ramas if json.loads(gh("pr", "list", "-R", REPO, "--state", "all", "--head", f"lote{n}-pr", "--json", "number").stdout or "[]")}
pend = [n for n in ramas if n not in hecho and n > 8]
if not pend:
    out("ningún lote pendiente de PR")
N = pend[0]
base = max(n for n in ramas if n < N)
if base not in hecho and base > 8:
    out(f"lote/{N} espera a que lote/{base} tenga PR")
if SECO:
    out(f"abriría lote{N}-pr (diff lote/{base}..lote/{N})")

try:
    sh("git checkout -q -- . ; git clean -fdq -e node_modules", check=True)
    sh(f"git checkout -q -B lote{N}-pr origin/main", check=True)
    d = sh(f"git diff origin/lote/{base} origin/lote/{N} --binary -- . ':!package.json' ':!package-lock.json'", check=True).stdout
    a = subprocess.run(["git", "apply", "--index", "--3way"], cwd=WT, input=d, capture_output=True, text=True)
    if a.returncode:
        raise RuntimeError("git apply: " + a.stderr[:400])
    x, y, _ = json.load(open(WT / "package.json"))["version"].split(".")
    nv = f"{x}.{int(y)+1}.0"
    sh(f"npm version {nv} --no-git-tag-version", check=True)
    sh("git add -A", check=True)
    g = sh("timeout 600 nice npm run gates")
    if g.returncode:
        raise RuntimeError("gates rojas: " + (g.stdout + g.stderr)[-500:])
    cuerpo = (LOTES / f"PR-lote-{N}-body.md").read_text()
    i, j = cuerpo.find("Stack"), cuerpo.find("## What changes")
    nuevo = f"Rebased onto main as ONE commit (lote/{N} only). Version {nv}. `npm run gates` green.\n\n"
    cuerpo = (cuerpo[:i] + nuevo + cuerpo[j:]) if 0 <= i < j else nuevo + cuerpo
    bf = LOTES / f"PR-lote-{N}-body.final.md"
    bf.write_text(cuerpo)
    sub = sh(f"git log -1 --format=%s origin/lote/{N}").stdout.strip()
    titulo = f"{sub} ({nv})"[:140]
    sh(["git", "-c", "user.name=ursa-da-numinia[bot]", "-c", "user.email=ursa@numen.games", "commit", "-q", "-m", titulo], check=True)
    sh(["git", "-c", "credential.helper=!f(){ echo username=x-access-token; echo password=" + tok + "; };f", "push", "-q", "origin", f"lote{N}-pr"], check=True)
    url = gh("pr", "create", "-R", REPO, "--base", "main", "--head", f"lote{N}-pr", "--title", titulo, "--body-file", str(bf)).stdout.strip().splitlines()[-1]
    for r in ("PabloFMM", "Christian-Numen", "MariaGarciaJordan"):
        gh("pr", "edit", url.rsplit("/", 1)[1], "-R", REPO, "--add-reviewer", r)
    out(f"PR abierto: {url} (lote {N})")
except Exception as e:
    sh("git reset -q --hard origin/main; git clean -fdq -e node_modules")
    out(f"LOTE {N} PARADO: {e}", wake=True)
