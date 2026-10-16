// agente (ADR-080): the outside agent's side of the door — run it WHERE THE AGENT LIVES (Hermes's PC, its VPS).
//   node tools/agente.ts nuevo <id> [--carpeta <dir>] [--nombre <nombre>]
//       makes an Ed25519 pair; the PRIVATE key goes to <dir>/<id>.clave (default ~/.numinia/agentes/, mode 600; never
//       overwritten) and never leaves this machine. Prints the public key, the line an owner pastes in the world's chat
//       (/agente añadir …) and the agente@1 file, for whoever prefers to put it in aventura/agentes/<id>.json by hand.
//   node tools/agente.ts billete <id> --url <ws(s)://world> [--carpeta <dir>]
//       checks that the key file signs a ticket for that world (prints the world's name and the public key; nothing secret).
// The bridge that takes the agent in (MCP over stdio): tools/mcp-mundo.ts. How to plug Hermes: packages/agent/README.md.
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicKey } from "node:crypto";
import { AGENTE_ID, leerBillete2, mensajeAgente, mundoDeUrl } from "../packages/instance/src/identidad.ts";
import { clavePrivada, firmaValida, firmarBillete, nuevaPareja, textoClave } from "../packages/agent/src/llave.ts";
import { AGENTE, validarAgente } from "../packages/server/src/aventura.ts";

const args = process.argv.slice(2);
const opcion = (k: string): string | undefined => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const [orden, id] = args;
const carpeta = resolve(opcion("--carpeta") ?? join(homedir(), ".numinia", "agentes"));
const fallo = (t: string): never => { console.error(t); process.exit(1); };
const uso = "Uso: node tools/agente.ts nuevo <id> [--carpeta <dir>] [--nombre <nombre>]\n     node tools/agente.ts billete <id> --url <ws(s)://mundo> [--carpeta <dir>]";

if (!orden || !id || !["nuevo", "billete"].includes(orden)) fallo(uso);
if (!AGENTE_ID.test(id)) fallo(`El id «${id}» no vale: 2–24 caracteres, a-z, 0-9 y guion, empieza por letra (p. ej. hermes-pablo).`);
const fichero = join(carpeta, `${id}.clave`);

if (orden === "nuevo") {
  const nombre = opcion("--nombre") ?? id.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
  const { privadaPem, publica } = nuevaPareja();
  const a = { formato: AGENTE, id, nombre, responsable: "(lo pone el mundo: el dueño que lo añade)", clave: publica, presencia: "a-demanda" };
  const r = validarAgente(a, `agentes/${id}.json`);
  if (!r.ok) fallo(r.issues.map((i) => `${i.path}: ${i.message}`).join("\n"));
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  try { writeFileSync(fichero, privadaPem, { mode: 0o600, flag: "wx" }); } catch (e) {
    fallo((e as NodeJS.ErrnoException).code === "EEXIST" ? `Ya existe ${fichero}: no lo piso. Si quieres otra clave, bórralo tú o usa otro id.` : `No puedo escribir ${fichero}: ${(e as Error).message}`);
  }
  chmodSync(fichero, 0o600); // the umask may have widened it
  console.log(`Clave privada de «${id}» guardada en ${fichero} (600: solo tú la lees). No sale nunca de esta máquina; no la pegues en ningún sitio.`);
  console.log(`\nClave pública: ${publica}`);
  console.log(`\n1. En el chat del mundo, siendo su dueño, escribe (añade un rol al final si quieres, p. ej. «Administración» para que construya; una IA nunca modera):\n\n/agente añadir ${id} ${nombre} ${publica}\n`);
  console.log(`   (o pon este fichero, a mano, en aventura/agentes/${id}.json del mundo; «responsable» = quién responde de esta IA:)\n${JSON.stringify({ ...a, responsable: "<tu nombre>" }, null, 2)}`);
  console.log(`\n2. Conecta el puente MCP (packages/agent/README.md):\n   MUNDO_URL=ws://127.0.0.1:8790 AGENTE_ID=${id} AGENTE_CLAVE=${fichero} node ${fileURLToPath(new URL("./mcp-mundo.ts", import.meta.url))}`);
} else {
  const url = opcion("--url") ?? fallo("Falta --url ws(s)://el-mundo");
  const mundo = mundoDeUrl(url);
  if (!mundo) fallo(`«${url}» no es una URL (ws://host:puerto o wss://dominio)`);
  let pem = "";
  try { pem = readFileSync(fichero, "utf8"); } catch { fallo(`No encuentro ${fichero}: créala con node tools/agente.ts nuevo ${id}`); }
  const privada = clavePrivada(pem), billete = firmarBillete({ id, privada, mundo });
  const b = leerBillete2(billete)!;
  const ok = firmaValida(createPublicKey(privada), mensajeAgente(mundo, id, b.ms, b.nonce), b.firma);
  console.log(`${ok ? "Bien" : "MAL"}: «${id}» firma billetes para el mundo «${mundo}» con la clave pública ${textoClave(privada)} (${billete.length} caracteres, válidos 2 min, una vez). El billete no se enseña.`);
  process.exit(ok ? 0 : 1);
}
