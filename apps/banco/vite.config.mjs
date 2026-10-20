// banco de pruebas gráfico: the bench page's own Vite config (tools/banco.mjs starts it; never part of the plaza build).
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  server: { host: "127.0.0.1", port: Number(process.env.BANCO_PUERTO ?? 5801), strictPort: true,
    // cross-origin isolated: performance.now() gets ~5 µs instead of 100 µs, so CPU ms per frame mean something
    headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" }, fs: { allow: [repo] } },
  logLevel: "warn",
});
