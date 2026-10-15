#!/usr/bin/env bash
# publicar-version: publishes the engine as a GitHub release a server can take (deploy/actualizar.sh reads it).
#   tools/publicar-version.sh [fichero-extra …]
# From a CLEAN checkout of a commit that is on origin/main: builds the installer (npm run deploy), proves it
# (tools/deploy-check.mjs), writes SHA256SUMS and creates the release motor-<build> marked «latest», with
# instalar-motor.sh, SHA256SUMS and any extra file given (e.g. a world zip from /mundo). Needs `gh` with a token
# that may write releases (GH_TOKEN). Today a person or Ursa runs it after a merge; the GitHub workflow that runs it
# on every merge waits for a person to add it (the App cannot write .github/workflows/).
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=${PUBLICAR_REPO:-numengames/numinia-engine}

[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "el árbol tiene cambios: publica solo un commit limpio"; exit 1; }
git fetch -q origin main
git merge-base --is-ancestor HEAD origin/main || { echo "$(git rev-parse --short HEAD) no está en origin/main: solo se publica lo que pasó por una PR"; exit 1; }
for f in "$@"; do [ -f "$f" ] || { echo "no existe $f"; exit 1; }; done

npm run deploy
node tools/deploy-check.mjs
version=$(bash deploy/instalar-motor.sh --version)          # «numinia-engine <build> <date> · Node …»
build=$(echo "$version" | awk '{ print $2 }')
case "$build" in *+*) echo "el instalador dice $build: el árbol no estaba limpio"; exit 1 ;; esac
tag="motor-$build"
if gh release view "$tag" --repo "$REPO" > /dev/null 2>&1; then echo "$tag ya está publicada"; exit 0; fi

dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
cp deploy/instalar-motor.sh "$dir/"
for f in "$@"; do cp "$f" "$dir/"; done
( cd "$dir" && sha256sum instalar-motor.sh $(for f in "$@"; do basename "$f"; done) > SHA256SUMS )
suma=$(grep '  instalar-motor.sh$' "$dir/SHA256SUMS" | cut -d' ' -f1)
{
  echo "Motor \`$build\` — $(git log -1 --format=%s HEAD | cut -c1-200)"
  echo
  echo "\`$version\` · sha256 \`$suma\`"
  echo
  echo "Instalar en un servidor nuevo (Ubuntu 24.04 o Debian 12, como root):"
  echo
  echo '```bash'
  echo "curl -fsSLO https://github.com/$REPO/releases/download/$tag/instalar-motor.sh"
  echo "curl -fsSLO https://github.com/$REPO/releases/download/$tag/SHA256SUMS"
  echo "sha256sum -c --ignore-missing SHA256SUMS && sudo bash instalar-motor.sh --dominio TU-DOMINIO --auto-actualizar"
  echo '```'
  echo
  echo "Un servidor con \`--auto-actualizar\` instala esta versión solo en los próximos 10 minutos."
  for f in "$@"; do echo; echo "Adjunto: \`$(basename "$f")\` (súbelo en https://TU-DOMINIO/mundo si es un mundo)."; done
} > "$dir/notas.md"
gh release create "$tag" "$dir/instalar-motor.sh" "$dir/SHA256SUMS" $(for f in "$@"; do echo "$dir/$(basename "$f")"; done) \
  --repo "$REPO" --target "$(git rev-parse HEAD)" --latest --title "Motor $build" --notes-file "$dir/notas.md"
echo "publicada $tag · sha256 $suma"
