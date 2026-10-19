// E05: PP1 pase de salida. Own tiny page, own renderer (never reuses apps/banco/main.ts: that page always draws
// into an offscreen RenderTarget *without* marking it as the output target, so three's implicit tone/colour-space
// pass never fires there — see work/saber-3d/queries/e05-pase-de-salida.md "Hallazgos"). Port from the queue row.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../../..", import.meta.url));

export default defineConfig({
  root,
  server: { host: "127.0.0.1", port: Number(process.env.EXP05_PUERTO ?? 5921), strictPort: true,
    headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" }, fs: { allow: [repo] } },
  logLevel: "warn",
});
