import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { serverUrl } from "../packages/client/src/index.ts";
import { fillTemplate, serverPackages, NODE } from "../tools/build-deploy.mjs";

const loc = (href: string) => { const u = new URL(href); return { protocol: u.protocol, hostname: u.hostname, host: u.host, search: u.search }; };

test("serverUrl: local dev server, same-origin /ws when deployed, ?server= always wins", () => {
  assert.equal(serverUrl(loc("http://localhost:5173/")), "ws://localhost:8790");
  assert.equal(serverUrl(loc("http://127.0.0.1:5174/")), "ws://127.0.0.1:8790");
  assert.equal(serverUrl(loc("http://203.0.113.7/")), "ws://203.0.113.7/ws");
  assert.equal(serverUrl(loc("https://motor.ejemplo.com/")), "wss://motor.ejemplo.com/ws");
  assert.equal(serverUrl(loc("https://motor.ejemplo.com:8443/?x=1")), "wss://motor.ejemplo.com:8443/ws");
  assert.equal(serverUrl(loc("https://motor.ejemplo.com/?server=ws://10.0.0.2:8790")), "ws://10.0.0.2:8790");
});

test("installer: template parses, placeholders are filled, the payload round-trips", () => {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? "/tmp", "deploy-test-"));
  const tpl = readFileSync("deploy/instalar-motor.plantilla.sh", "utf8");
  assert.equal(spawnSync("bash", ["-n", "deploy/instalar-motor.plantilla.sh"]).status, 0);
  // tiny payload: app/hola.txt + www/index.html
  mkdirSync(join(dir, "src/app"), { recursive: true }); mkdirSync(join(dir, "src/www"), { recursive: true });
  writeFileSync(join(dir, "src/app/hola.txt"), "hola\n"); writeFileSync(join(dir, "src/www/index.html"), "<p>hola</p>\n");
  assert.equal(spawnSync("tar", ["-czf", join(dir, "p.tgz"), "-C", join(dir, "src"), "app", "www"]).status, 0);
  const script = fillTemplate(tpl, { build: "test 2026-01-01", payloadB64: readFileSync(join(dir, "p.tgz")).toString("base64") });
  assert.ok(script.includes(`NODE_VERSION="${NODE.version}"`) && script.includes(NODE.sha256.x64));
  writeFileSync(join(dir, "i.sh"), script);
  assert.equal(spawnSync("bash", ["-n", join(dir, "i.sh")]).status, 0);
  const v = spawnSync("bash", [join(dir, "i.sh"), "--version"], { encoding: "utf8" });
  assert.match(v.stdout, /test 2026-01-01 · Node 24\./);
  assert.equal(spawnSync("bash", [join(dir, "i.sh"), "--solo-extraer", join(dir, "out")]).status, 0);
  assert.equal(readFileSync(join(dir, "out/app/hola.txt"), "utf8"), "hola\n");
  assert.ok(existsSync(join(dir, "out/www/index.html")));
  const bad = spawnSync("bash", [join(dir, "i.sh"), "--no-existe"], { encoding: "utf8" });
  assert.notEqual(bad.status, 0); assert.match(bad.stderr, /--help/);
  assert.throws(() => fillTemplate(tpl.replace("__BUILD__", "__OTRO__"), { build: "x", payloadB64: "" }), /__OTRO__/);
});

test("installer ships exactly the packages the server may import", () => {
  assert.deepEqual(serverPackages().sort(), ["core", "ecs", "feature", "instance", "net", "schema", "server", "sim"]);
});
