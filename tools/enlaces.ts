// Prints the signed URL of every point in features/despertar/enlaces.json (what each QR must open).
// Usage: MOTOR_SECRET=<16+ chars, the server's> npm run enlaces -- [https://mi-sitio]   (default base: http://localhost:8790)
// QR images: any QR generator takes these URLs; an SVG writer is a later slice (R1 detail in docs/BACKLOG.md).
import { firmar, leerPuntos } from "../features/despertar/tokens.ts";
import { signer } from "../packages/server/src/secret.ts";
import enlaces from "../features/despertar/enlaces.json" with { type: "json" };

const sign = signer(process.env.MOTOR_SECRET);
if (!sign("probe")) { console.error("Falta MOTOR_SECRET (16+ caracteres, el mismo del servidor). Ejemplo: MOTOR_SECRET=$(openssl rand -hex 16) npm run enlaces"); process.exit(1); }
const base = (process.argv[2] ?? "http://localhost:8790").replace(/\/+$/, "");
const r = leerPuntos(enlaces);
if (!r.ok) { console.error("enlaces.json no vale:\n- " + r.problemas.join("\n- ")); process.exit(1); }
for (const p of r.puntos) console.log(`${p.id}\t${p.nombre}\t${base}/e/${firmar(sign, p.id)}`);
