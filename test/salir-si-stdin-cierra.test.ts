// mundo-hermes M9: MOTOR_SALIR_SI_STDIN_CIERRA=1 — the real server leaves (graceful close, exit 0) when its stdin ends, so Hermes can never orphan it. Default OFF.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const puertaLibre = () => new Promise<number>((ok) => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => ok(p)); }); });
const limpio = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(MOTOR_|AVENTURA_DIR|DATOS_DIR|MUNDO_DIR|ACTIVOS_DIR|SESIONES_DIR|JWT_SECRET|ADMIN_CODE)/.test(k)));
async function real(extra: Record<string, string | undefined>) {
  const PORT = await puertaLibre(), raiz = join(mkdtempSync(join(tmpdir(), "salir-stdin-")), "mundo");
  const p = spawn(process.execPath, ["packages/server/src/main.ts"], { env: { ...limpio(), PORT: String(PORT), HOST: "127.0.0.1", MOTOR_MUNDO: raiz, MOTOR_HABITANTES: "no", ...extra } as Record<string, string>, stdio: ["pipe", "pipe", "pipe"] });
  let log = ""; p.stdout.on("data", (d) => { log += d; }); p.stderr.on("data", (d) => { log += d; });
  const fin = new Promise<{ code: number | null; sig: string | null }>((ok) => p.on("exit", (code, sig) => ok({ code, sig })));
  for (let i = 0; i < 200 && !log.includes("[instancia]"); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(log.includes("[instancia]"), log);
  return { p, PORT, fin, viva: () => p.exitCode === null && p.signalCode === null };
}
const antes = <T>(pr: Promise<T>, ms: number) => Promise.race([pr, new Promise<"tiempo">((ok) => setTimeout(() => ok("tiempo"), ms))]);

test("MOTOR_SALIR_SI_STDIN_CIERRA=1: closing stdin makes the real server exit with code 0 (the port is freed)", async () => {
  const s = await real({ MOTOR_SALIR_SI_STDIN_CIERRA: "1" });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${s.PORT}/health`)).status, 200);
    await new Promise((r) => setTimeout(r, 300)); assert.ok(s.viva(), "an open pipe does not stop it");
    s.p.stdin.end();
    const r = await antes(s.fin, 8000); assert.deepEqual(r, { code: 0, sig: null });
    await assert.rejects(fetch(`http://127.0.0.1:${s.PORT}/health`));
  } finally { if (s.viva()) s.p.kill("SIGKILL"); }
});

test("MOTOR_SALIR_SI_STDIN_CIERRA unset or not \"1\": closing stdin changes nothing", async () => {
  for (const extra of [{} as Record<string, string>, { MOTOR_SALIR_SI_STDIN_CIERRA: "0" }, { MOTOR_SALIR_SI_STDIN_CIERRA: "si" }]) {
    const s = await real(extra);
    try {
      s.p.stdin.end(); assert.equal(await antes(s.fin, 1500), "tiempo", JSON.stringify(extra));
      assert.equal((await fetch(`http://127.0.0.1:${s.PORT}/health`)).status, 200);
      s.p.kill("SIGTERM"); assert.equal((await antes(s.fin, 8000) as { code: number }).code, 0, "SIGTERM still leaves cleanly");
    } finally { if (s.viva()) s.p.kill("SIGKILL"); }
  }
});
