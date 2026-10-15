// build-deploy: builds the page and packs page + instance server into ONE installer script.
// Usage: node tools/build-deploy.mjs [--sin-construir]
//   -> deploy/instalar-motor.sh (git-ignored; copy it to the server and run `sudo bash instalar-motor.sh`)
// The installer is deploy/instalar-motor.plantilla.sh with the build stamp, the pinned Node LTS and a
// base64 tar.gz payload appended: app/ (server sources + `ws`) and www/ (the built page).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Node LTS the server runs on. Pinned with the sums from https://nodejs.org/dist/v<version>/SHASUMS256.txt
// Changing it: update all three values from that file (linux-x64.tar.xz and linux-arm64.tar.xz).
export const NODE = {
  version: "24.22.0",
  sha256: {
    x64: "cc2f601cee82d9a5a233302fe307abc600727035fd7d2c3a3571755989e95008",
    arm64: "fef00bb4d36e1c50104a9775a10359beee98f162b4104dd12472c75065c6a143",
  },
};

const root = join(fileURLToPath(import.meta.url), "../..");
const tmp = process.env.TMPDIR ?? "/tmp";

/** Packages the server needs at run time: `server` plus what tools/layers.json lets it import. */
export function serverPackages() {
  const layers = JSON.parse(readFileSync(join(root, "tools/layers.json"), "utf8"));
  return ["server", ...layers.server];
}

/** Fill the template's placeholders. Fails loudly if one is left, so a broken installer never ships. */
export function fillTemplate(template, { build, payloadB64 }) {
  const out = template
    .replaceAll("__BUILD__", build)
    .replaceAll("__NODE_VERSION__", NODE.version)
    .replaceAll("__NODE_SHA256_X64__", NODE.sha256.x64)
    .replaceAll("__NODE_SHA256_ARM64__", NODE.sha256.arm64);
  const left = out.match(/__[A-Z0-9_]+__/g)?.filter((m) => m !== "__CARGA_DEBAJO__");
  if (left?.length) throw new Error(`placeholder(s) left in the installer template: ${left.join(", ")}`);
  if (!out.endsWith("__CARGA_DEBAJO__\n")) throw new Error("the template must end with the line __CARGA_DEBAJO__");
  return out + (payloadB64.match(/.{1,76}/g) ?? []).join("\n") + "\n";
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${r.stdout ?? ""}${r.stderr ?? ""}`);
  return (r.stdout ?? "").trim();
}

function main() {
  const t0 = performance.now();
  if (!process.argv.includes("--sin-construir")) run("npx", ["vite", "build", "--config", "apps/plaza/vite.config.mjs", "--logLevel", "warn"]);
  const page = join(root, "dist/plaza");
  if (!existsSync(join(page, "index.html"))) throw new Error("dist/plaza/index.html missing: run without --sin-construir (it runs vite build)");

  const stage = join(tmp, "numinia-deploy-stage");
  rmSync(stage, { recursive: true, force: true });
  const app = join(stage, "app");
  for (const p of serverPackages()) cpSync(join(root, "packages", p, "src"), join(app, "packages", p, "src"), { recursive: true });
  cpSync(join(root, "features"), join(app, "features"), { recursive: true }); // the game features main.ts composes (J7)
  cpSync(join(root, "activos"), join(app, "activos"), { recursive: true }); // H1: the house library, served at /a/<sha256>
  cpSync(join(root, "aventuras"), join(app, "aventuras"), { recursive: true }); // J5: the example adventure (AVENTURA_DIR= for none)
  cpSync(join(root, "node_modules/ws"), join(app, "node_modules/ws"), { recursive: true });
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "numinia-engine-server", private: true, type: "module", license: "MIT" }, null, 2) + "\n");
  cpSync(page, join(stage, "www"), { recursive: true });

  const dirty = run("git", ["status", "--porcelain"]) ? "+cambios" : "";
  const build = `${run("git", ["rev-parse", "--short", "HEAD"])}${dirty} ${new Date().toISOString().slice(0, 10)}`;
  const tgz = join(tmp, "numinia-deploy.tgz");
  run("tar", ["-czf", tgz, "-C", stage, "app", "www"]);
  const payloadB64 = readFileSync(tgz).toString("base64");

  const template = readFileSync(join(root, "deploy/instalar-motor.plantilla.sh"), "utf8");
  const out = join(root, "deploy/instalar-motor.sh");
  mkdirSync(join(root, "deploy"), { recursive: true });
  writeFileSync(out, fillTemplate(template, { build, payloadB64 }));
  chmodSync(out, 0o755);
  run("bash", ["-n", out]);
  const kb = Math.round(readFileSync(out).length / 1024);
  console.log(`[deploy] deploy/instalar-motor.sh · ${kb} kB · build ${build} · Node ${NODE.version} · ${Math.round(performance.now() - t0)} ms`);
  console.log("[deploy] en el servidor: sudo bash instalar-motor.sh [--dominio motor.ejemplo.com]");
}

if (import.meta.url === `file://${process.argv[1]}`) main();
