#!/usr/bin/env bash
# publicar-version: publishes the engine as a GitHub release a server can take (deploy/actualizar.sh reads it) and a
# world can point at (arrancar.sh in a world's zip downloads motor-<short> from it; the fleet runs its image).
#   tools/publicar-version.sh [--en-seco] [fichero-extra …]
# From a CLEAN checkout of a commit that is on origin/main: builds the installer (npm run deploy), proves it
# (tools/deploy-check.mjs), writes imagen.json (C7: {image, commit, build, digest} of
# ghcr.io/numengames/numinia-engine:sha-<commit>, which must ALREADY be in the registry — a release always means its
# image exists) and SHA256SUMS, and creates the release motor-<short> marked «latest», with instalar-motor.sh,
# SHA256SUMS, imagen.json and any extra file given (e.g. a world zip from /mundo). Needs `gh` with a token that may
# write releases (GH_TOKEN), and docker buildx or skopeo to read the image's digest (or PUBLICAR_DIGEST=sha256:…).
# The GitHub workflow (publicar-motor.yml, pasted by a person: the App cannot write .github/workflows/) builds and
# checks the installer once, builds and pushes the image from it, attests both and then calls this with
# PUBLICAR_HECHO=1 (use that installer, do not build another) and PUBLICAR_DIGEST. By hand it is the emergency path.
# --en-seco: everything but the release (and without the origin/main check): prints what it would publish.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=${PUBLICAR_REPO:-numengames/numinia-engine}
IMAGEN_REPO=${PUBLICAR_IMAGEN_REPO:-ghcr.io/numengames/numinia-engine}
SECO=0
[ "${1:-}" = --en-seco ] && { SECO=1; shift; }

[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "el árbol tiene cambios: publica solo un commit limpio"; exit 1; }
commit=$(git rev-parse HEAD)
if [ "$SECO" = 0 ]; then
  git fetch -q origin main
  git merge-base --is-ancestor HEAD origin/main || { echo "$(git rev-parse --short HEAD) no está en origin/main: solo se publica lo que pasó por una PR"; exit 1; }
fi
for f in "$@"; do [ -f "$f" ] || { echo "no existe $f"; exit 1; }; done

if [ "${PUBLICAR_HECHO:-0}" != 1 ]; then
  npm run deploy
  node tools/deploy-check.mjs
fi
version=$(bash deploy/instalar-motor.sh --version)          # «numinia-engine <short> <date> · Node …»
corto=$(echo "$version" | awk '{ print $2 }')
build=$(echo "$version" | awk '{ print $2" "$3 }')
case "$corto" in *+*) echo "el instalador dice $corto: el árbol no estaba limpio"; exit 1 ;; esac
case "$commit" in "$corto"*) ;; *) echo "el instalador es de $corto y esto es $commit: construye el de este commit"; exit 1 ;; esac
tag="motor-$corto"
imagen="$IMAGEN_REPO:sha-$commit"
if [ "$SECO" = 0 ] && gh release view "$tag" --repo "$REPO" > /dev/null 2>&1; then echo "$tag ya está publicada"; exit 0; fi

# C7: the image of this very commit must be in the registry before its release exists
digest=${PUBLICAR_DIGEST:-}
if [ -z "$digest" ] && command -v docker > /dev/null && docker buildx version > /dev/null 2>&1; then
  digest=$(docker buildx imagetools inspect "$imagen" --format '{{json .Manifest}}' 2> /dev/null | sed -n 's/.*"digest":"\(sha256:[0-9a-f]\{64\}\)".*/\1/p' | head -1 || true)
fi
if [ -z "$digest" ] && command -v skopeo > /dev/null; then
  raw=$(skopeo inspect --raw "docker://$imagen" 2> /dev/null || true)
  [ -n "$raw" ] && digest="sha256:$(printf '%s' "$raw" | sha256sum | cut -d' ' -f1)"
fi
if ! [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "no encuentro la imagen $imagen en el registro (ni PUBLICAR_DIGEST): una versión siempre trae su imagen."
  echo "  súbela antes: npm run deploy && docker buildx build --platform linux/amd64,linux/arm64 --build-arg COMMIT=$commit -t $imagen --push ."
  exit 1
fi

dir=$(mktemp -d); trap 'rm -rf "$dir"' EXIT
cp deploy/instalar-motor.sh "$dir/"
printf '{"image":"%s","commit":"%s","build":"%s","digest":"%s"}\n' "$imagen" "$commit" "$build" "$digest" > "$dir/imagen.json"
for f in "$@"; do cp "$f" "$dir/"; done
( cd "$dir" && sha256sum instalar-motor.sh imagen.json $(for f in "$@"; do basename "$f"; done) > SHA256SUMS )
suma=$(grep '  instalar-motor.sh$' "$dir/SHA256SUMS" | cut -d' ' -f1)
{
  echo "Motor \`$corto\` — $(git log -1 --format=%s HEAD | cut -c1-200)"
  echo
  echo "\`$version\` · sha256 \`$suma\`"
  echo
  echo "Imagen: \`$imagen\` (\`$digest\`)"
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
if [ "$SECO" = 1 ]; then
  echo "en seco: publicaría $tag (--target $commit --latest) con:"; ( cd "$dir" && ls -l && cat SHA256SUMS imagen.json )
  exit 0
fi
gh release create "$tag" "$dir/instalar-motor.sh" "$dir/SHA256SUMS" "$dir/imagen.json" $(for f in "$@"; do echo "$dir/$(basename "$f")"; done) \
  --repo "$REPO" --target "$commit" --latest --title "Motor $corto" --notes-file "$dir/notas.md"
echo "publicada $tag · sha256 $suma · $imagen@$digest"
