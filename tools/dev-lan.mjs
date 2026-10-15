// dev:lan — the plaza page over https on the home network, so phones and headsets can open it.
// Makes a self-signed certificate with openssl in .cert/ (outside git) if there is none, then starts vite
// on 0.0.0.0 with /ws passed to the instance server (PLAZA_SERVER_PORT, default 8790) on the same origin.
// Usage: npm run dev:lan        (the server must run: tools/plaza.sh start, or npm run server)
//   PLAZA_PORT=5173  PLAZA_SERVER_PORT=8790  LAN_IP=192.168.1.20 (override the detected address)
// The phone shows a certificate warning once: accept it (it is your own certificate).
import { existsSync, mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const repo = fileURLToPath(new URL("..", import.meta.url));
const dir = join(repo, ".cert");

/** First private IPv4 address of this machine (192.168.x, 10.x, 172.16-31.x), or null. */
export function lanIp(ifaces = networkInterfaces()) {
  for (const list of Object.values(ifaces))
    for (const a of list ?? [])
      if (a.family === "IPv4" && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
  return null;
}

/** Make .cert/lan.crt + lan.key if missing (valid for localhost and the LAN IP). Returns their paths. */
export function ensureCert(ip) {
  const cert = join(dir, "lan.crt"), key = join(dir, "lan.key");
  if (existsSync(cert) && existsSync(key)) return { cert, key, made: false };
  mkdirSync(dir, { recursive: true });
  const san = `subjectAltName=DNS:localhost,IP:127.0.0.1${ip ? `,IP:${ip}` : ""}`;
  const r = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "825", "-subj", "/CN=numinia-engine-lan",
    "-addext", san, "-keyout", key, "-out", cert], { encoding: "utf8" });
  if (r.status !== 0) { console.error(`[dev:lan] openssl falló. Instálalo o crea ${cert} y ${key} a mano.\n${r.stderr}`); process.exit(2); }
  return { cert, key, made: true };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const ip = process.env.LAN_IP ?? lanIp();
  const { cert, key, made } = ensureCert(ip);
  if (process.argv.includes("--cert-only")) { console.log(`${cert}\n${key}`); process.exit(0); }
  const port = process.env.PLAZA_PORT ?? "5173";
  console.log(`[dev:lan] ${made ? "certificado nuevo en .cert/" : "certificado de .cert/"} · abre en el móvil: https://${ip ?? "<tu-ip>"}:${port}/`);
  if (!ip) console.log("[dev:lan] no encontré IP de red privada; usa LAN_IP=… para fijarla.");
  const child = spawn("npx", ["vite", "--config", "apps/plaza/vite.config.mjs"], {
    cwd: repo, stdio: "inherit",
    env: { ...process.env, PLAZA_HOST: "0.0.0.0", PLAZA_HTTPS_CERT: cert, PLAZA_HTTPS_KEY: key },
  });
  child.on("exit", (c) => process.exit(c ?? 0));
}
