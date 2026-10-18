import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const root = fileURLToPath(new URL(".", import.meta.url));
const repo = fileURLToPath(new URL("../..", import.meta.url));

// LAN mode (npm run dev:lan, tools/dev-lan.mjs): https on the home network + /ws passed to the instance
// server on the same origin, so phones and headsets (which need a secure context) can open the page.
const lan = process.env.PLAZA_HTTPS_CERT && process.env.PLAZA_HTTPS_KEY;
const serverPort = Number(process.env.PLAZA_SERVER_PORT ?? 8790);

// N22: the Basis transcoder for KTX2 textures (packages/render/src/gltf.ts), served by the page itself at /basis/ —
// copied from three (Apache-2.0, see its README) into the build, and answered from node_modules in dev. Never a CDN.
const BASIS = fileURLToPath(new URL("../../node_modules/three/examples/jsm/libs/basis/", import.meta.url));
const BASIS_FICHEROS = { "basis_transcoder.js": "text/javascript", "basis_transcoder.wasm": "application/wasm", "README.md": "text/plain" };
const basis = {
  name: "numinia-basis",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = /^\/basis\/([a-zA-Z_.]+)$/.exec((req.url ?? "").split("?")[0]);
      if (!m || !BASIS_FICHEROS[m[1]] || !existsSync(BASIS + m[1])) return next();
      res.setHeader("content-type", BASIS_FICHEROS[m[1]]); res.end(readFileSync(BASIS + m[1]));
    });
  },
  generateBundle() {
    for (const n of Object.keys(BASIS_FICHEROS)) this.emitFile({ type: "asset", fileName: `basis/${n}`, source: readFileSync(BASIS + n) });
  },
};

export default defineConfig({
  root,
  plugins: [basis],
  server: {
    host: process.env.PLAZA_HOST ?? "127.0.0.1",
    port: Number(process.env.PLAZA_PORT ?? 5173),
    strictPort: true,
    fs: { allow: [repo] },
    ...(lan ? {
      https: { cert: readFileSync(process.env.PLAZA_HTTPS_CERT), key: readFileSync(process.env.PLAZA_HTTPS_KEY) },
      // trailing slash: vite matches proxy keys as prefixes, and "/e" would also catch page modules such as /escribiendo.ts
      proxy: { "/ws": { target: `ws://127.0.0.1:${serverPort}`, ws: true, changeOrigin: true }, "/e/": { target: `http://127.0.0.1:${serverPort}`, changeOrigin: true }, "/a/": { target: `http://127.0.0.1:${serverPort}`, changeOrigin: true } },
    } : {}),
  },
  build: { target: "es2022", outDir: fileURLToPath(new URL("../../dist/plaza", import.meta.url)), emptyOutDir: true },
});
