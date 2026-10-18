// Prints the signed URL of every point in features/despertar/enlaces.json (what each QR must open),
// or writes one QR SVG per point with "qr" as the first argument (R1 detail: encoder = qrcode-svg, MIT, 1.1.0 exact).
// Usage:
//   MOTOR_SECRET=<16+ chars, the server's> npm run enlaces -- [https://mi-sitio]               (prints id, nombre, URL)
//   MOTOR_SECRET=<...>                     npm run enlaces -- qr [https://mi-sitio] [carpeta]  (escribe <carpeta>/<id>.svg, carpeta por defecto "qr")
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode-svg";
import { firmar, leerPuntos } from "../features/despertar/tokens.ts";
import { signer } from "../packages/server/src/secret.ts";
import enlaces from "../features/despertar/enlaces.json" with { type: "json" };

const sign = signer(process.env.MOTOR_SECRET);
if (!sign("probe")) { console.error("Falta MOTOR_SECRET (16+ caracteres, el mismo del servidor). Ejemplo: MOTOR_SECRET=$(openssl rand -hex 16) npm run enlaces"); process.exit(1); }
const modoQr = process.argv[2] === "qr";
const base = (modoQr ? process.argv[3] : process.argv[2])?.replace(/\/+$/, "") || "http://localhost:8790";
const carpeta = modoQr ? (process.argv[4] ?? "qr") : null;
const r = leerPuntos(enlaces);
if (!r.ok) { console.error("enlaces.json no vale:\n- " + r.problemas.join("\n- ")); process.exit(1); }
if (carpeta) mkdirSync(carpeta, { recursive: true });
for (const p of r.puntos) {
  const url = `${base}/e/${firmar(sign, p.id)}`;
  if (!carpeta) { console.log(`${p.id}\t${p.nombre}\t${url}`); continue; }
  const archivo = join(carpeta, `${p.id}.svg`);
  writeFileSync(archivo, new QRCode({ content: url, padding: 2, width: 256, height: 256 }).svg());
  console.log(`${p.id}\t${p.nombre}\t${archivo}`);
}
