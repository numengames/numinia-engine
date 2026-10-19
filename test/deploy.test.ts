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

test("installer (H9): uploads live next to the saved world, and Caddy passes /a/ (GET, HEAD, PUT) to the server", () => {
  const tpl = readFileSync("deploy/instalar-motor.plantilla.sh", "utf8");
  const env = tpl.split("\n").find((l) => l.startsWith("Environment=")) ?? "";
  assert.match(env, /\bDATOS_DIR=\/var\/lib\/numinia-motor\/datos\b/);
  assert.match(env, /\bACTIVOS_DIR=\/var\/lib\/numinia-motor\/datos\/activos\b/, "the server writes uploads only inside its StateDirectory (ProtectSystem=strict)");
  assert.match(tpl, /StateDirectory=numinia-motor/);
  assert.match(tpl, /handle \/a\/\* \{\n\t\treverse_proxy 127\.0\.0\.1:\$PORT\n\t\}/, "no method or size filter in front of /a/: the server decides");
});

test("installer: what the built page asks on its own origin reaches the server (/status, /sonidos.json), not the file server", () => {
  const tpl = readFileSync("deploy/instalar-motor.plantilla.sh", "utf8");
  // the page (apps/plaza/main.ts) fetches `${activos}/status` and `${activos}/sonidos.json`; built, `activos` is its origin
  for (const ruta of ["/status", "/sonidos.json"]) {
    assert.ok(tpl.includes(`\thandle ${ruta} {\n\t\treverse_proxy 127.0.0.1:$PORT\n\t}`), `Caddy passes ${ruta} to the server`);
  }
});

test("installer (ADR-080): MOTOR_DOMINIO is fixed from --dominio, so no world can forge another's ticket by faking Host", () => {
  const tpl = readFileSync("deploy/instalar-motor.plantilla.sh", "utf8");
  const env = tpl.split("\n").find((l) => l.startsWith("Environment=")) ?? "";
  assert.match(env, /\bMOTOR_DOMINIO=\$DOMAIN\b/, "the service's own domain, not whatever Host a connection claims");
});

test("installer: /mundo reaches the server with the administration code; options survive a run without them", () => {
  const tpl = readFileSync("deploy/instalar-motor.plantilla.sh", "utf8");
  assert.match(tpl, /handle \/mundo\* \{\n\t\treverse_proxy 127\.0\.0\.1:\$PORT\n\t\}/, "no size limit in front of the world upload: the server caps it");
  assert.match(tpl, /EnvironmentFile=\$PREFIX\/admin\.env\nExecStart=\$PREFIX\/node\/bin\/node packages\/server\/src\/main\.ts/, "only the engine reads the administration code");
  assert.match(tpl, /umask 077; echo "MOTOR_ADMIN=/);
  assert.doesNotMatch(tpl, /cat "\$PREFIX\/admin\.env"|echo "\$MOTOR_ADMIN/, "the code is never printed");
  assert.match(tpl, /ExecStart=\/usr\/bin\/bash \$PREFIX\/actualizar\.sh/);
  assert.match(tpl, /printf 'DOMAIN=%s\\nMEMORY=%s\\nFIREWALL=%s\\nHABITANTES=%s\\nAUTO=%s\\nCONSTRUIR=%s\\n'/);
  // the help is the header, and every option it lists is parsed
  const help = spawnSync("bash", ["deploy/instalar-motor.plantilla.sh", "--help"], { encoding: "utf8" }).stdout;
  for (const o of ["--dominio", "--sin-dominio", "--memoria", "--sin-cortafuegos", "--sin-habitantes", "--auto-actualizar", "--sin-auto-actualizar", "--construir", "--clave-ia", "--modelo-ia", "--quitar-clave-ia", "--solo-extraer", "--version"]) {
    assert.ok(help.includes(o), `--help names ${o}`);
    assert.ok(tpl.includes(`    ${o})`), `${o} is parsed`);
  }
  assert.doesNotMatch(help, /set -euo/);
});

test("installer (P5a): the brain's key is asked without echo, kept for the inhabitants only, and opens only Anthropic; building is a saved option", () => {
  const tpl = readFileSync("deploy/instalar-motor.plantilla.sh", "utf8");
  const motor = tpl.slice(tpl.indexOf('cat > "/etc/systemd/system/$SERVICE.service"'), tpl.indexOf("systemctl restart \"$SERVICE\""));
  const hab = tpl.slice(tpl.indexOf('cat > "/etc/systemd/system/$HAB_SERVICE.service"'), tpl.indexOf("systemctl restart \"$HAB_SERVICE\""));
  assert.match(tpl, /IFS= read -rs CLAVE < \/dev\/tty/, "asked without echo, from the terminal");
  assert.doesNotMatch(tpl, /echo[^\n]*\$CLAVE|say[^\n]*\$CLAVE|set -x/, "the key is never printed");
  assert.match(tpl, /chown root:"\$HAB_USER" "\$PREFIX\/cerebro\.env"; chmod 0640/);
  assert.match(hab, /EnvironmentFile=-\$PREFIX\/cerebro\.env/); assert.doesNotMatch(motor, /cerebro\.env/, "the engine never reads the key");
  assert.match(tpl, /HAB_IPS="localhost 160\.79\.104\.0\/23 2607:6bc0::\/48"/); assert.match(hab, /IPAddressDeny=any\nIPAddressAllow=\$HAB_IPS/);
  assert.match(motor, /MOTOR_CONSTRUIR=\$CONSTRUIR/);
  assert.match(tpl, /CONSTRUIR=todos;/, "Pablo, 15-10: everyone builds at first (H3 brings roles)");
});

test("installer ships exactly the packages the server may import (P4: and the inhabitants' service: agent, client)", () => {
  assert.deepEqual(serverPackages().sort(), ["agent", "client", "core", "ecs", "feature", "instance", "net", "schema", "server", "sim"]);
});
