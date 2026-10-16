// zip: the smallest ZIP the world copy needs (mundo-zip.ts), with node: only — no dependency.
//   escribirZip  streams entries to a writable: small text entries deflated from memory, big files STORED and read
//                twice (once for their CRC-32, once for the bytes), so every local header carries its real sizes and
//                no data descriptor is needed (unzip, Python's zipfile, Windows and macOS all read it).
//   leerZip      reads the central directory of a zip ON DISK (never the whole file in memory) and refuses, by rule,
//                what a hostile zip carries: encryption, ZIP64, links and devices, absolute paths or «..», too many
//                entries, entries too big, a compression ratio of a zip bomb.
//   extraer      streams one entry to a file, counting the bytes really written (never trusting the headers) and
//                checking its CRC-32.
// No ZIP64: a world copy is capped well under 4 GiB (mundo-zip.ts ZIP_MAX).
import { createReadStream, createWriteStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import type { Writable } from "node:stream";
import { createInflateRaw, crc32, deflateRawSync } from "node:zlib";

export type EntradaEscribir =
  | { nombre: string; datos: Uint8Array; modo?: number }  // small: deflated from memory (modo: unix permissions, default 0o644)
  | { nombre: string; ruta: string; modo?: number };      // a file: stored, streamed

export type EntradaLeida = {
  nombre: string;
  metodo: 0 | 8;          // 0 stored, 8 deflate
  crc: number;
  comprimido: number;
  tamano: number;
  cabeceraLocal: number;  // offset of the local header
};

export type ReglaZip = "no-es-zip" | "zip64" | "cifrado" | "metodo" | "enlace" | "ruta" | "demasiadas" | "grande" | "ratio" | "total" | "repetido" | "cortado" | "crc";
export class ErrorZip extends Error {
  readonly regla: ReglaZip;
  constructor(regla: ReglaZip, mensaje: string) { super(mensaje); this.regla = regla; }
}

export type TopesZip = { entradas: number; porFichero: number; total: number; ratio: number };

const SIG_LOCAL = 0x04034b50, SIG_CENTRAL = 0x02014b50, SIG_FIN = 0x06054b50;
const UTF8 = 0x0800; // general purpose bit 11: names are UTF-8

/** MS-DOS time and date of a JS date (zip's 2-second resolution). */
function dos(d: Date): { hora: number; fecha: number } {
  const y = Math.max(1980, d.getUTCFullYear());
  return { hora: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1), fecha: ((y - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate() };
}

function escribir(w: Writable, b: Uint8Array): Promise<void> {
  return new Promise((ok, ko) => {
    if (w.destroyed) return ko(new Error("la salida se cerró"));
    if (w.write(b)) return ok();
    const fuera = () => { w.off("drain", sigue); ko(new Error("la salida se cerró")); };
    const sigue = () => { w.off("close", fuera); ok(); };
    w.once("drain", sigue); w.once("close", fuera);
  });
}

async function crcDeFichero(ruta: string): Promise<number> {
  let c = 0;
  for await (const trozo of createReadStream(ruta, { highWaterMark: 1 << 20 })) c = crc32(trozo as Buffer, c);
  return c;
}

/** Writes the entries as one zip to `w` (does not end it). Returns the bytes written. */
export async function escribirZip(w: Writable, entradas: readonly EntradaEscribir[], cuando = new Date()): Promise<number> {
  const { hora, fecha } = dos(cuando);
  const central: Buffer[] = [];
  let off = 0;
  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, "utf8");
    let metodo: 0 | 8, crc: number, comprimido: number, tamano: number, cuerpo: Uint8Array | null = null;
    if ("datos" in e) {
      metodo = 8; crc = crc32(e.datos); tamano = e.datos.length; cuerpo = deflateRawSync(e.datos); comprimido = cuerpo.length;
    } else {
      metodo = 0; tamano = (await stat(e.ruta)).size; comprimido = tamano; crc = await crcDeFichero(e.ruta);
    }
    if (off + comprimido > 0xfffffff0) throw new ErrorZip("zip64", "la copia pasaría de 4 GiB (no hay ZIP64)");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(UTF8, 6); local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(hora, 10); local.writeUInt16LE(fecha, 12); local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(comprimido, 18); local.writeUInt32LE(tamano, 22); local.writeUInt16LE(nombre.length, 26); local.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(SIG_CENTRAL, 0); c.writeUInt16LE((3 << 8) | 20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(UTF8, 8); c.writeUInt16LE(metodo, 10);
    c.writeUInt16LE(hora, 12); c.writeUInt16LE(fecha, 14); c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(comprimido, 20); c.writeUInt32LE(tamano, 24);
    c.writeUInt16LE(nombre.length, 28); c.writeUInt32LE(((0o100000 | ((e.modo ?? 0o644) & 0o777)) << 16) >>> 0, 38); c.writeUInt32LE(off, 42); // regular file, rw-r--r-- unless said
    central.push(c, nombre);
    await escribir(w, local); await escribir(w, nombre);
    if (cuerpo) await escribir(w, cuerpo);
    else {
      let n = 0;
      for await (const trozo of createReadStream((e as { ruta: string }).ruta, { highWaterMark: 1 << 20 })) { n += (trozo as Buffer).length; await escribir(w, trozo as Buffer); }
      if (n !== tamano) throw new Error(`${e.nombre} cambió mientras se copiaba`);
    }
    off += 30 + nombre.length + comprimido;
  }
  const dir = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(SIG_FIN, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(dir.length, 12); fin.writeUInt32LE(off, 16);
  await escribir(w, dir); await escribir(w, fin);
  return off + dir.length + 22;
}

/** A name that may be written under a folder: relative, forward slashes, no «..», no drive, no control characters. */
export function nombreSeguro(n: string): boolean {
  if (!n || n.length > 240 || n.startsWith("/") || n.includes("\\") || /^[a-zA-Z]:/.test(n) || /[\u0000-\u001f\u007f]/.test(n)) return false;
  return n.split("/").every((p, i, a) => p !== ".." && p !== "." && (p !== "" || i === a.length - 1));
}

/** Reads and checks the central directory of the zip at `ruta`. Throws ErrorZip with the rule broken. */
export async function leerZip(ruta: string, topes: TopesZip): Promise<EntradaLeida[]> {
  const fh = await open(ruta, "r");
  try {
    const { size } = await fh.stat();
    if (size < 22) throw new ErrorZip("no-es-zip", "no es un zip (demasiado pequeño)");
    const cola = Math.min(size, 22 + 0xffff);
    const b = Buffer.alloc(cola);
    await fh.read(b, 0, cola, size - cola);
    let p = -1;
    for (let i = cola - 22; i >= 0; i--) if (b.readUInt32LE(i) === SIG_FIN) { p = i; break; }
    if (p < 0) throw new ErrorZip("no-es-zip", "no es un zip (no tiene directorio central)");
    const total = b.readUInt16LE(p + 10), tamDir = b.readUInt32LE(p + 12), offDir = b.readUInt32LE(p + 16);
    if (total === 0xffff || tamDir === 0xffffffff || offDir === 0xffffffff) throw new ErrorZip("zip64", "es un zip64 (más de 4 GiB o 65.535 ficheros): no se acepta");
    if (total > topes.entradas) throw new ErrorZip("demasiadas", `trae ${total} ficheros y el tope es ${topes.entradas}`);
    if (offDir + tamDir > size) throw new ErrorZip("cortado", "el zip está cortado (el directorio central apunta fuera del fichero)");
    const d = Buffer.alloc(tamDir);
    await fh.read(d, 0, tamDir, offDir);
    const out: EntradaLeida[] = [], vistos = new Set<string>();
    let q = 0, suma = 0;
    for (let i = 0; i < total; i++) {
      if (q + 46 > d.length || d.readUInt32LE(q) !== SIG_CENTRAL) throw new ErrorZip("cortado", "el directorio central del zip está dañado");
      const sistema = d.readUInt16LE(q + 4) >> 8, flags = d.readUInt16LE(q + 8), metodo = d.readUInt16LE(q + 10);
      const crc = d.readUInt32LE(q + 16), comprimido = d.readUInt32LE(q + 20), tamano = d.readUInt32LE(q + 24);
      const ln = d.readUInt16LE(q + 28), le = d.readUInt16LE(q + 30), lc = d.readUInt16LE(q + 32);
      const ext = d.readUInt32LE(q + 38), cabeceraLocal = d.readUInt32LE(q + 42);
      const nombre = d.subarray(q + 46, q + 46 + ln).toString("utf8");
      q += 46 + ln + le + lc;
      if (flags & 1) throw new ErrorZip("cifrado", "el zip tiene contraseña: guárdalo sin ella");
      if (comprimido === 0xffffffff || tamano === 0xffffffff || cabeceraLocal === 0xffffffff) throw new ErrorZip("zip64", "es un zip64: no se acepta");
      if (!nombreSeguro(nombre)) throw new ErrorZip("ruta", `«${nombre.slice(0, 80)}» no es una ruta válida dentro del zip`);
      if (vistos.has(nombre)) throw new ErrorZip("repetido", `«${nombre}» está dos veces`);
      vistos.add(nombre);
      const tipo = sistema === 3 ? (ext >>> 16) & 0o170000 : 0; // unix: the file type bits
      if (nombre.endsWith("/")) { if (tamano !== 0) throw new ErrorZip("ruta", `«${nombre}» es una carpeta con contenido`); continue; }
      if (tipo !== 0 && tipo !== 0o100000) throw new ErrorZip("enlace", `«${nombre}» es un enlace o un dispositivo, no un fichero`);
      if (metodo !== 0 && metodo !== 8) throw new ErrorZip("metodo", `«${nombre}» usa una compresión que no se acepta (${metodo}); solo «store» y «deflate»`);
      if (tamano > topes.porFichero) throw new ErrorZip("grande", `«${nombre}» pasa de ${Math.round(topes.porFichero / 1048576)} MB`);
      if (metodo === 0 && comprimido !== tamano) throw new ErrorZip("cortado", `«${nombre}» dice tamaños distintos sin comprimir`);
      if (tamano >= 1048576 && tamano > topes.ratio * Math.max(1, comprimido)) throw new ErrorZip("ratio", `«${nombre}» se infla más de ${topes.ratio} veces: parece una bomba de zip`);
      suma += tamano;
      if (suma > topes.total) throw new ErrorZip("total", `desempaquetado pasaría de ${Math.round(topes.total / 1048576)} MB`);
      if (cabeceraLocal + 30 + comprimido > size) throw new ErrorZip("cortado", `«${nombre}» apunta fuera del fichero`);
      out.push({ nombre, metodo: metodo as 0 | 8, crc, comprimido, tamano, cabeceraLocal });
    }
    return out;
  } finally { await fh.close(); }
}

/** Streams one entry of the zip at `ruta` into `destino` (a new file). Calls `cada(trozo)` on every chunk written
 * (to hash it). Throws ErrorZip if it is longer than it says, shorter, or its CRC-32 does not match. */
export async function extraer(ruta: string, e: EntradaLeida, destino: string, cada: (b: Buffer) => void = () => {}, modo = 0o640): Promise<void> {
  const fh = await open(ruta, "r");
  let inicio: number;
  try {
    const h = Buffer.alloc(30);
    await fh.read(h, 0, 30, e.cabeceraLocal);
    if (h.readUInt32LE(0) !== SIG_LOCAL) throw new ErrorZip("cortado", `«${e.nombre}»: la cabecera local está dañada`);
    inicio = e.cabeceraLocal + 30 + h.readUInt16LE(26) + h.readUInt16LE(28);
  } finally { await fh.close(); }
  const salida = createWriteStream(destino, { flags: "wx", mode: modo });
  let n = 0, c = 0;
  try {
    const crudo = () => createReadStream(ruta, { start: inicio, end: inicio + e.comprimido - 1, highWaterMark: 1 << 20 });
    const fuente: AsyncIterable<Buffer> = e.comprimido === 0 ? [] : e.metodo === 8 ? crudo().pipe(createInflateRaw()) : crudo();
    for await (const t of fuente) {
      n += t.length;
      if (n > e.tamano) throw new ErrorZip("grande", `«${e.nombre}» es más grande de lo que dice`);
      c = crc32(t, c); cada(t);
      await escribir(salida, t);
    }
  } catch (err) {
    salida.destroy();
    if (err instanceof ErrorZip) throw err;
    throw new ErrorZip("cortado", `«${e.nombre}» no se puede descomprimir: ${(err as Error).message}`);
  }
  await new Promise<void>((ok, ko) => salida.end((err?: Error | null) => (err ? ko(err) : ok())));
  if (n !== e.tamano) throw new ErrorZip("cortado", `«${e.nombre}» llegó con ${n} bytes y dice ${e.tamano}`);
  if ((c >>> 0) !== (e.crc >>> 0)) throw new ErrorZip("crc", `«${e.nombre}» está dañado (su CRC no coincide)`);
}
