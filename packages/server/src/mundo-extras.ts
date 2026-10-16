// mundo-extras (C5): what a world's zip carries to run it yourself, beside the world: compose.yml (the same engine
// image, pinned by its commit), arrancar.sh (no Docker: the same engine from its GitHub release, sha256 checked, run
// with your own Node) and LEEME.txt (ten lines in Spanish). They are written fresh by the engine that makes the copy
// and are not part of the world (mundo.json does not list them; an upload ignores them).
import type { Motor } from "./version.ts";

export const EXTRAS = ["compose.yml", "arrancar.sh", "LEEME.txt"] as const;
export const PUERTO_LOCAL = 8790;
export const RELEASES = "https://github.com/numengames/numinia-engine/releases/download";

const limpio = (s: string) => s.replace(/[^A-Za-z0-9 .:+_-]/g, "");

/** The release this engine is published as: motor-<the short commit of its build stamp> (tools/publicar-version.sh
 * tags with the installer's own short commit, whatever its length), else the first 7 of the commit. */
export function etiqueta(m: Motor & { commit: string }): string {
  const b = m.build.split(" ")[0];
  return /^[0-9a-f]{7,40}$/.test(b) && m.commit.startsWith(b) ? b : m.commit.slice(0, 7);
}

export function compose(m: Motor & { imagen: string }): string {
  return `# Este mundo con su motor, en tu PC: «docker compose up» (o «podman compose up») dentro de esta carpeta y abre
# http://localhost:${PUERTO_LOCAL} — motor ${limpio(m.build)}, imagen fijada por su commit.
# La primera vez el motor hace las claves en claves.env (ahí está tu código de administración); no viajan en el zip.
services:
  motor:
    image: ${m.imagen}
    # Empieza como root SOLO para tomar el usuario dueño de esta carpeta (tú) y deja de serlo al momento: lo que
    # escribe aquí es tuyo. Con podman o docker sin root, «root» del contenedor ya eres tú.
    user: "0:0"
    # Solo en este ordenador (127.0.0.1): así /metrics y /sesiones no se ven desde la red de casa.
    ports:
      - "127.0.0.1:${PUERTO_LOCAL}:${PUERTO_LOCAL}"
    volumes:
      - .:/mundo:z
    # al subir otro mundo en http://localhost:${PUERTO_LOCAL}/mundo, el motor lo cambia y sale (75) para volver con él
    restart: on-failure
    stop_grace_period: 15s
`;
}

export function arrancar(m: Motor & { commit: string }): string {
  const corto = etiqueta(m);
  return `#!/usr/bin/env bash
# arrancar.sh — arranca este mundo SIN Docker, con tu Node (24 o más). Baja el motor ${limpio(m.build)} (versión
# motor-${corto} de GitHub), comprueba su sha256 contra SHA256SUMS, lo desempaqueta en .motor/ (dentro de esta carpeta)
# y lo arranca sobre esta carpeta: abre http://localhost:${PUERTO_LOCAL}
#   PORT=8791 bash arrancar.sh       otro puerto
#   HOST=0.0.0.0 bash arrancar.sh    que entren otros aparatos de tu red (por defecto, solo este ordenador)
#   MOTOR_DESCARGA=<url o file:///carpeta>  de dónde bajar instalar-motor.sh y SHA256SUMS (un espejo, una prueba)
set -euo pipefail
MUNDO=$(cd "$(dirname "$0")" && pwd)
CORTO=${corto}
COMMIT=${m.commit}
BASE=\${MOTOR_DESCARGA:-${RELEASES}/motor-$CORTO}
MOTOR="$MUNDO/.motor/$CORTO"
die() { printf 'arrancar: %s\\n' "$*" >&2; exit 1; }
command -v node > /dev/null || die "hace falta Node 24 o más (https://nodejs.org), o Docker: docker compose up"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' || die "tu Node es $(node --version): hace falta el 24 o más"
if [ ! -f "$MOTOR/listo" ]; then
  command -v curl > /dev/null || die "hace falta curl para bajar el motor"
  tmp="$MUNDO/.motor/bajando-$$"; rm -rf "$tmp"; mkdir -p "$tmp"
  echo "arrancar: bajo el motor $CORTO de $BASE"
  curl -fsSL --retry 3 -o "$tmp/instalar-motor.sh" "$BASE/instalar-motor.sh" || die "no pude bajar instalar-motor.sh de $BASE"
  curl -fsSL --retry 3 -o "$tmp/SHA256SUMS" "$BASE/SHA256SUMS" || die "no pude bajar SHA256SUMS de $BASE"
  if command -v sha256sum > /dev/null; then suma=$(sha256sum "$tmp/instalar-motor.sh" | cut -d' ' -f1); else suma=$(shasum -a 256 "$tmp/instalar-motor.sh" | cut -d' ' -f1); fi
  esperada=$(awk '$2 == "instalar-motor.sh" || $2 == "*instalar-motor.sh" { print $1 }' "$tmp/SHA256SUMS")
  [ -n "$esperada" ] && [ "$suma" = "$esperada" ] || die "instalar-motor.sh no coincide con SHA256SUMS: no lo uso"
  version=$(bash "$tmp/instalar-motor.sh" --version)
  case "$version" in "numinia-engine $CORTO "*) ;; *) die "ese instalador es otro motor ($version), no $CORTO" ;; esac
  bash "$tmp/instalar-motor.sh" --solo-extraer "$tmp/motor" > /dev/null
  grep -q "\\"commit\\": *\\"$COMMIT\\"" "$tmp/motor/app/build.json" || die "ese motor no es el commit $COMMIT"
  rm -rf "$MOTOR"; mkdir -p "$MUNDO/.motor"; mv "$tmp/motor" "$MOTOR"; touch "$MOTOR/listo"; rm -rf "$tmp"
  echo "arrancar: comprobado (sha256 $suma) y guardado en .motor/$CORTO"
fi
cd "$MOTOR/app"
echo "arrancar: motor $CORTO sobre $MUNDO → http://localhost:\${PORT:-${PUERTO_LOCAL}}  (Ctrl+C para pararlo)"
MOTOR_MUNDO="$MUNDO" WWW_DIR="$MOTOR/www" PORT=\${PORT:-${PUERTO_LOCAL}} HOST=\${HOST:-127.0.0.1} exec node packages/server/src/main.ts
`;
}

export function leeme(m: Motor): string {
  const corto = m.commit ? etiqueta({ ...m, commit: m.commit }) : undefined;
  return [
    `Esto es un mundo del motor de Numinia (numinia-engine ${limpio(m.build)}), entero: lo construido y lo subido (datos/),`,
    "las misiones y su gente (aventura/) y el entorno (entorno/). Para arrancarlo en tu PC, descomprímelo en una",
    "carpeta tuya y, dentro de ella, una de estas dos órdenes; luego abre http://localhost:8790",
    m.imagen ? "  docker compose up      (o podman compose up; baja la imagen exacta de este motor)" : "  (este motor no tiene imagen publicada: solo se puede arrancar desde su código)",
    corto ? "  bash arrancar.sh       (sin Docker; hace falta Node 24 o más y curl)" : "",
    "La primera vez, el motor hace sus claves en claves.env: ahí está tu código de administración. Entra en el",
    "mundo y escribe en el chat /dueño <código> para ser su dueño. Con ese código, http://localhost:8790/mundo baja",
    "la copia del mundo (un zip como este) para llevarlo a otra máquina o subirlo a la sala de Mundos de numinia.com.",
    "Nunca van en el zip: las claves (claves.env), quién entró (sesiones/) ni quién subió qué. mundo.json dice qué es",
    `cada fichero y su sha256.${m.imagen ? ` Motor: ${m.imagen}${corto ? ` · versión motor-${corto}` : ""}` : ""}`,
  ].filter((l, i) => l || i !== 4).join("\n") + "\n";
}

/** The extras for a zip made by this engine (compose.yml and arrancar.sh only when its commit is known). */
export function extrasDelZip(m: Motor): { nombre: (typeof EXTRAS)[number]; texto: string; modo: number }[] {
  const out: { nombre: (typeof EXTRAS)[number]; texto: string; modo: number }[] = [];
  if (m.imagen) out.push({ nombre: "compose.yml", texto: compose({ ...m, imagen: m.imagen }), modo: 0o644 });
  if (m.commit) out.push({ nombre: "arrancar.sh", texto: arrancar({ ...m, commit: m.commit }), modo: 0o755 });
  out.push({ nombre: "LEEME.txt", texto: leeme(m), modo: 0o644 });
  return out;
}
