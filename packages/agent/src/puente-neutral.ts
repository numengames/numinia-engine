// puente-neutral (M1, remote MCP): what a host that is NOT Node needs to keep an organization's AI inside one world — a
// Cloudflare Worker / Durable Object (numinia-web apps/mcp «Cuerpo»), Deno, Bun, a browser. It needs only fetch, WebSocket,
// setTimeout/setInterval, AbortSignal.timeout, atob and TextDecoder: no `node:` import anywhere below this file (test/puente-sin-node.test.ts).
// `scripts/empaquetar-puente.mjs` bundles it with platform neutral to dist/puente-mundo.mjs.
// The token way: new PuenteMundo({ url, id, pedirPase: pedirPaseToken({ numiniaUrl, org, agente: id, token }) }), then
// puente.arrancar() and, per MCP request, new ServidorMcp({ …, herramientas: () => puente.herramientas() }).atender(json).
// The key way also works if the host injects the signatures (`firmar` here, `pedirPaseFirmado({ firmar })`), e.g. with WebCrypto Ed25519.
export { PuenteMundo, INSTRUCCIONES, material, CIERRE_FINAL, OIDOS_MAX, OBRA_MAX, OBRA_VENTANA_MS, RENOVAR_PASE_MS } from "./mcp-mundo.ts";
export type { FirmarBillete, Oida } from "./mcp-mundo.ts";
export { pedirPaseToken, pedirPaseFirmado, estadoDelPase, mensajePase, FORMA_TOKEN, PREFIJO_PASE } from "./pase-org.ts";
export type { PedirPase, RespuestaPase, FirmarPase } from "./pase-org.ts";
export { ServidorMcp, ErrorHerramienta, comprobar, VERSIONES_MCP } from "./mcp.ts";
export type { HerramientaMcp } from "./mcp.ts";
export type { Modelo3D } from "./obra.ts";
