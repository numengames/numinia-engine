// optimizar-hilo (N22): the worker thread the server's queue (optimizar-cola.ts) sends each .glb to, so making the
// lighter copy (a few hundred ms for an 11 MB hall) never blocks the 20 Hz loop. Bytes in, Resultado out.
import { parentPort } from "node:worker_threads";
import { gzipSync } from "node:zlib";
import { optimizar } from "./optimizar.ts";

parentPort!.on("message", async ({ bytes, tipo }: { bytes: Uint8Array; tipo: string }) => {
  const r = await optimizar(bytes, tipo);
  const gz = r.bytes && !r.ext ? new Uint8Array(gzipSync(r.bytes, { level: 9 })) : undefined; // here too: never on the loop's thread (a WebP does not shrink)
  // H13: each level of detail is gzipped here too, and its buffers travel with the rest
  const lodsGz = (r.lods?.lods ?? []).map((x) => new Uint8Array(gzipSync(x.bytes, { level: 9 })));
  parentPort!.postMessage({ ...r, gz, lodsGz }, [...(r.bytes ? [r.bytes.buffer as ArrayBuffer] : []), ...(gz ? [gz.buffer as ArrayBuffer] : []),
    ...(r.lods?.lods ?? []).map((x) => x.bytes.buffer as ArrayBuffer), ...lodsGz.map((z) => z.buffer as ArrayBuffer)]);
});
