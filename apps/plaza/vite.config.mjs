import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  server: { host: "127.0.0.1", port: Number(process.env.PLAZA_PORT ?? 5173), strictPort: true, fs: { allow: [repo] } },
  build: { target: "es2022", outDir: fileURLToPath(new URL("../../dist/plaza", import.meta.url)), emptyOutDir: true },
});
