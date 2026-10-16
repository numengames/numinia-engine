// mcp-mundo (ADR-080): the bridge an outside agent (Hermes, or any MCP client) runs next to itself to be inside one
// world. MCP over stdio (newline-delimited JSON-RPC on stdin/stdout; logs on stderr only). No npm dependency.
//   MUNDO_URL=ws://127.0.0.1:8790 AGENTE_ID=hermes-pablo AGENTE_CLAVE=~/.numinia/agentes/hermes-pablo.clave node tools/mcp-mundo.ts
//   (or --url, --id, --clave). The key file comes from `node tools/agente.ts nuevo <id>`; the world must list its public
//   key (an owner types the /agente añadir line in the world's chat). How to add it to Hermes: packages/agent/README.md.
//   MOTOR_BIBLIOTECA = what it may place (default: this engine's features/objetos/biblioteca.json).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { clavePrivada } from "../packages/agent/src/llave.ts";
import { ServidorMcp } from "../packages/agent/src/mcp.ts";
import { INSTRUCCIONES, PuenteMundo } from "../packages/agent/src/mcp-mundo.ts";
import type { Modelo3D } from "../packages/agent/src/obra.ts";
import { infoMotor } from "../packages/server/src/version.ts";

const args = process.argv.slice(2);
const opcion = (k: string): string | undefined => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const log = (l: string) => process.stderr.write(`${l}\n`); // stdout is the protocol's: nothing else is ever written there
const url = opcion("--url") ?? process.env.MUNDO_URL ?? "";
const id = opcion("--id") ?? process.env.AGENTE_ID ?? "";
const ruta = (opcion("--clave") ?? process.env.AGENTE_CLAVE ?? "").replace(/^~(?=\/)/, homedir());
if (!url || !id || !ruta) { log("[puente] faltan MUNDO_URL, AGENTE_ID y AGENTE_CLAVE (o --url --id --clave). La clave: node tools/agente.ts nuevo <id>"); process.exit(2); }

let privada;
try { privada = clavePrivada(readFileSync(ruta, "utf8")); } catch (e) { log(`[puente] no puedo leer la clave ${ruta}: ${(e as Error).message}`); process.exit(2); }
let biblioteca: Modelo3D[] = [];
try {
  const f = process.env.MOTOR_BIBLIOTECA ?? fileURLToPath(new URL("../features/objetos/biblioteca.json", import.meta.url));
  const b = JSON.parse(readFileSync(f, "utf8")) as { modelos?: Modelo3D[] };
  biblioteca = (b.modelos ?? []).filter((m) => /^[a-z0-9-]{1,32}$/.test(m.id) && /^[0-9a-f]{64}$/.test(m.modelo)).map(({ id, nombre, modelo }) => ({ id, nombre, modelo }));
} catch { log("[puente] sin biblioteca de modelos: puedo hablar y moverme, no colocar"); }

let puente: PuenteMundo;
try { puente = new PuenteMundo({ url, id, privada, biblioteca, log }); } catch (e) { log(`[puente] ${(e as Error).message}`); process.exit(2); }
const mcp = new ServidorMcp({ nombre: "numinia-mundo", version: infoMotor().build, herramientas: () => puente.herramientas(), instrucciones: INSTRUCCIONES, log });
mcp.escuchar(process.stdin, process.stdout);
puente.arrancar();
log(`[puente] «${id}» → ${url} · ${biblioteca.length} modelos para colocar · MCP por stdio`);
process.stdin.on("end", () => { puente.parar(); process.exit(0); }); // the agent closed us: leave the world
for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => { puente.parar(); process.exit(0); });
