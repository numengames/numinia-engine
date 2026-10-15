#!/usr/bin/env bash
# actualizar.sh — brings this server to the newest engine published on GitHub, by itself.
# Installed by instalar-motor.sh as /opt/numinia-engine/actualizar.sh; with --auto-actualizar the timer
# numinia-actualizar.timer runs it every 10 minutes (as root: the installer it runs needs it).
#
#   1. Pause: while /opt/numinia-engine/PAUSA exists it does nothing (touch it during a measurement, rm it after).
#   2. Asks GitHub's public API for the repository's latest release (no credential on the machine). A release of
#      the engine is tagged motor-<build>, with instalar-motor.sh and SHA256SUMS attached (tools/publicar-version.sh).
#   3. Same build as /opt/numinia-engine/VERSION → nothing to do.
#   4. People inside (/health «conectados» > 0) and the release less than 6 h old → waits for the next round,
#      so nobody is thrown out mid-visit; after 6 h it updates anyway (they reconnect by themselves).
#   5. Downloads both files; the installer must match SHA256SUMS AND the sha256 GitHub reports for the asset, and
#      its --version must name the release's build. Any mismatch: stop, change nothing.
#   6. Keeps the installer that runs now as instalador-anterior.sh and runs the new one (it reuses the options
#      saved in instalacion.env: domain, memory, inhabitants…). If it fails, runs the previous one again.
#
#   sudo bash /opt/numinia-engine/actualizar.sh             one round now
#   sudo bash /opt/numinia-engine/actualizar.sh --ahora     same, even with people inside
#   sudo bash /opt/numinia-engine/actualizar.sh --comprobar only say what it would do
#   journalctl -u numinia-actualizar                        what every round did
set -euo pipefail

PREFIX=${NUMINIA_PREFIX:-/opt/numinia-engine}
FUENTE=${NUMINIA_FUENTE:-numengames/numinia-engine}
API=${NUMINIA_API:-https://api.github.com}
SALUD=${NUMINIA_SALUD:-http://127.0.0.1:8790/health}
NODE=${NUMINIA_NODE:-$PREFIX/node/bin/node}
ESPERA_MAX_H=6

say() { printf '[actualizar] %s\n' "$*"; }
die() { printf '[actualizar] ERROR: %s\n' "$*" >&2; exit 1; }

AHORA=0; COMPROBAR=0
for a in "$@"; do
  case "$a" in
    --ahora) AHORA=1 ;;
    --comprobar) COMPROBAR=1 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) die "opción desconocida '$a' (--ahora, --comprobar, --help)" ;;
  esac
done

if [ -f "$PREFIX/PAUSA" ]; then say "en pausa ($PREFIX/PAUSA existe): no miro nada. Bórralo para seguir."; exit 0; fi
[ -x "$NODE" ] || die "no encuentro Node en $NODE (¿está instalado el motor?)"

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
codigo=$(curl -sS -L --retry 3 -o "$tmp/r.json" -w '%{http_code}' -H 'Accept: application/vnd.github+json' "$API/repos/$FUENTE/releases/latest" || echo 000)
case "$codigo" in
  200) ;;
  404) say "$FUENTE no tiene ninguna versión publicada todavía: nada que hacer."; exit 0 ;;
  *) say "GitHub no responde ($codigo): lo intento en la próxima vuelta."; exit 0 ;;
esac

# tag, date, installer url, sums url, the installer's sha256 as GitHub reports it (may be empty)
IFS=$'\t' read -r TAG PUBLICADA URL_INST URL_SUMAS DIGEST < <("$NODE" -e '
  const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const a = (n) => (r.assets || []).find((x) => x.name === n) || {};
  const i = a("instalar-motor.sh"), s = a("SHA256SUMS");
  console.log([r.tag_name || "-", r.published_at || "-", i.browser_download_url || "-", s.browser_download_url || "-", String(i.digest || "-").replace(/^sha256:/, "")].join("\t"));
' < "$tmp/r.json")

case "$TAG" in motor-*) ;; *) say "la última versión publicada ($TAG) no es un motor-<build>: no la toco."; exit 0 ;; esac
NUEVA=${TAG#motor-}
[[ "$NUEVA" =~ ^[0-9a-f]{7,40}$ ]] || die "la etiqueta $TAG no lleva un build válido"
[ "$URL_INST" != "-" ] && [ "$URL_SUMAS" != "-" ] || die "la versión $TAG no trae instalar-motor.sh y SHA256SUMS"
ACTUAL=$(cut -d' ' -f1 "$PREFIX/VERSION" 2> /dev/null || echo "-")
if [ "$ACTUAL" = "$NUEVA" ]; then say "al día: $ACTUAL es la última ($TAG)."; exit 0; fi
if [ "$AHORA" = 0 ] && [ "$(cat "$PREFIX/FALLO" 2> /dev/null)" = "$TAG" ]; then
  say "$TAG ya falló al instalarse aquí: no lo repito solo (sudo bash $0 --ahora para intentarlo otra vez)."; exit 0
fi
say "hay versión nueva: $TAG (publicada $PUBLICADA); aquí está $ACTUAL"

if [ "$AHORA" = 0 ]; then
  dentro=$(curl -fsS --max-time 5 "$SALUD" 2> /dev/null | "$NODE" -e 'try { console.log(JSON.parse(require("fs").readFileSync(0, "utf8")).conectados ?? 0) } catch { console.log(0) }' || echo 0)
  edad_h=$(( ( $(date +%s) - $(date -d "$PUBLICADA" +%s 2> /dev/null || date +%s) ) / 3600 ))
  if [ "${dentro:-0}" -gt 0 ] && [ "$edad_h" -lt "$ESPERA_MAX_H" ]; then
    say "hay $dentro persona(s) dentro: espero (actualizo igual cuando la versión tenga $ESPERA_MAX_H h; ahora tiene $edad_h h)."
    exit 0
  fi
fi
if [ "$COMPROBAR" = 1 ]; then say "--comprobar: instalaría $TAG. No cambio nada."; exit 0; fi

curl -fsSL --retry 3 -o "$tmp/instalar-motor.sh" "$URL_INST" || die "no pude descargar el instalador de $TAG"
curl -fsSL --retry 3 -o "$tmp/SHA256SUMS" "$URL_SUMAS" || die "no pude descargar SHA256SUMS de $TAG"
( cd "$tmp" && grep -E '  instalar-motor\.sh$' SHA256SUMS | sha256sum -c --quiet - ) || die "el instalador de $TAG no coincide con su SHA256SUMS: no lo uso"
SUMA=$(sha256sum "$tmp/instalar-motor.sh" | cut -d' ' -f1)
if [ "$DIGEST" != "-" ] && [ -n "$DIGEST" ] && [ "$DIGEST" != "$SUMA" ]; then die "el sha256 que da GitHub ($DIGEST) no es el del fichero ($SUMA): no lo uso"; fi
bash "$tmp/instalar-motor.sh" --version | grep -q "^numinia-engine $NUEVA " || die "el instalador de $TAG dice otra versión: $(bash "$tmp/instalar-motor.sh" --version)"
say "comprobado: sha256 $SUMA, $(bash "$tmp/instalar-motor.sh" --version)"

[ -f "$PREFIX/instalador.sh" ] && cp -f "$PREFIX/instalador.sh" "$PREFIX/instalador-anterior.sh"
if bash "$tmp/instalar-motor.sh"; then
  rm -f "$PREFIX/FALLO"
  say "instalado $TAG."
else
  echo "$TAG" > "$PREFIX/FALLO"
  say "el instalador de $TAG falló."
  if [ -f "$PREFIX/instalador-anterior.sh" ]; then
    say "vuelvo a la versión anterior ($ACTUAL)."
    bash "$PREFIX/instalador-anterior.sh" || die "tampoco se pudo volver a $ACTUAL: mira journalctl -u numinia-motor -n 50"
  fi
  die "sigo en $ACTUAL; $TAG no se instaló y no lo reintento solo (FALLO): mira journalctl -u numinia-actualizar"
fi
