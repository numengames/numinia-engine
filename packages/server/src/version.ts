// version: which engine this is — the build string people read («c57dbb7 2026-10-16»), the full commit it was built
// from (40 hex: /status, the world zip's compose.yml, imagen.json) and the container image of that commit.
// Where it comes from, first found wins:
//   ENGINE_BUILD / ENGINE_COMMIT env → app/build.json (written by tools/build-deploy.mjs into the installer's payload,
//   so a bare install, the container image and arrancar.sh read the SAME stamp) → ../VERSION (installer, older
//   builds) → in a git checkout: «dev» and the checkout's HEAD.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Where the engine's images live (C1): ghcr.io/numengames/numinia-engine:sha-<40 hex commit>. */
export const IMAGEN_REPO = "ghcr.io/numengames/numinia-engine";
const COMMIT = /^[0-9a-f]{40}$/;

export type Motor = { build: string; commit: string | null; imagen: string | null };

const raizApp = fileURLToPath(new URL("../../../", import.meta.url)); // app/ when installed, the repo in a checkout

function sello(): { build?: string; commit?: string } {
  try {
    const s = JSON.parse(readFileSync(`${raizApp}build.json`, "utf8")) as { build?: unknown; commit?: unknown };
    return { build: typeof s.build === "string" ? s.build : undefined, commit: typeof s.commit === "string" && COMMIT.test(s.commit) ? s.commit : undefined };
  } catch { return {}; }
}

let cache: Motor | null = null;
/** The engine's build string, commit and image (computed once per process). */
export function infoMotor(): Motor {
  if (cache) return cache;
  const s = sello();
  let build = process.env.ENGINE_BUILD || s.build;
  if (!build && existsSync("../VERSION")) build = readFileSync("../VERSION", "utf8").trim() || undefined;
  let commit = COMMIT.test(process.env.ENGINE_COMMIT ?? "") ? process.env.ENGINE_COMMIT! : s.commit ?? null;
  if (!commit && existsSync(`${raizApp}.git`)) { // a dev run in a checkout: its HEAD (no image is published for it)
    const r = spawnSync("git", ["-C", raizApp, "rev-parse", "HEAD"], { encoding: "utf8", timeout: 3000 });
    if (r.status === 0 && COMMIT.test(r.stdout.trim())) commit = r.stdout.trim();
  }
  cache = { build: build ?? "dev", commit, imagen: commit ? `${IMAGEN_REPO}:sha-${commit}` : null };
  return cache;
}
