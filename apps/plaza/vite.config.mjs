import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

// LAN mode (npm run dev:lan, tools/dev-lan.mjs): https on the home network + /ws passed to the instance
// server on the same origin, so phones and headsets (which need a secure context) can open the page.
const lan = process.env.PLAZA_HTTPS_CERT && process.env.PLAZA_HTTPS_KEY;
const serverPort = Number(process.env.PLAZA_SERVER_PORT ?? 8790);

export default defineConfig({
  root,
  server: {
    host: process.env.PLAZA_HOST ?? "127.0.0.1",
    port: Number(process.env.PLAZA_PORT ?? 5173),
    strictPort: true,
    fs: { allow: [repo] },
    ...(lan ? {
      https: { cert: readFileSync(process.env.PLAZA_HTTPS_CERT), key: readFileSync(process.env.PLAZA_HTTPS_KEY) },
      proxy: { "/ws": { target: `ws://127.0.0.1:${serverPort}`, ws: true, changeOrigin: true }, "/e/": { target: `http://127.0.0.1:${serverPort}`, changeOrigin: true }, "/a/": { target: `http://127.0.0.1:${serverPort}`, changeOrigin: true } },
    } : {}),
  },
  build: { target: "es2022", outDir: fileURLToPath(new URL("../../dist/plaza", import.meta.url)), emptyOutDir: true },
});
