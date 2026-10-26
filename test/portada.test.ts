// MIS-265 «portada desde dentro»: a photo taken inside the world becomes its cover, and every page of the world says so in
// og:image (absolute, on the address the visitor asked for) — what numinia.com's worlds room reads for the world's card
// (numinia-web apps/store/src/lib/worlds-source.ts parseFace: `<meta property="og:image" content="…">`, kept only when it
// starts with https://<the world's domain>/). The photo mode's button itself is a browser path (apps/plaza/foto.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Pagina, conCara, urlAbsoluta } from "../packages/server/src/pagina.ts";
import { startServer } from "../packages/server/src/server.ts";
import { medidaPortada, PORTADA_PX } from "../apps/plaza/foto-nucleo.ts";

const tmp = (p: string) => mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), p));
/** numinia-web's own reading of a world's page (worlds-source.ts meta + parseFace), copied to keep both ends honest. */
const ogImagenComoLaWeb = (html: string, domain: string): string | null => {
  const m = /<meta\s+property="og:image"\s+content="([^"]*)"/i.exec(html);
  const v = (m?.[1] ?? "").replace(/&amp;/g, "&").trim();
  return v && v.startsWith(`https://${domain}/`) ? v : null;
};

test("the cover's size: longest side at most PORTADA_PX, the shape kept, never enlarged", () => {
  assert.equal(PORTADA_PX, 1600);
  assert.deepEqual(medidaPortada(3200, 1800), { ancho: 1600, alto: 900 });
  assert.deepEqual(medidaPortada(1080, 2400), { ancho: 720, alto: 1600 }, "a phone held upright");
  assert.deepEqual(medidaPortada(1200, 675), { ancho: 1200, alto: 675 }, "a small picture stays as it is");
  assert.deepEqual(medidaPortada(0, 0), { ancho: 0, alto: 0 });
});

test("the absolute address: what the visitor asked for; behind Caddy https; an odd Host gives none", () => {
  assert.equal(urlAbsoluta({ headers: { host: "plaza.numinia.com", "x-forwarded-proto": "https" } }, "/a/x.jpg"), "https://plaza.numinia.com/a/x.jpg");
  assert.equal(urlAbsoluta({ headers: { host: "127.0.0.1:8790" } }, "/a/x.jpg"), "http://127.0.0.1:8790/a/x.jpg");
  assert.equal(urlAbsoluta({ headers: { host: "interno:8790", "x-forwarded-host": "Plaza.Numinia.com, otro", "x-forwarded-proto": "https,http" } }, "/a/x.jpg"), "https://plaza.numinia.com/a/x.jpg");
  assert.equal(urlAbsoluta({ headers: { host: "x.com", "x-forwarded-proto": "gopher" }, socket: { encrypted: true } }, "/a/x.jpg"), "https://x.com/a/x.jpg");
  for (const malo of ["evil.com/\"><script>", "a b", "", "x.com:99999999"]) assert.equal(urlAbsoluta({ headers: { host: malo } }, "/a/x.jpg"), null, malo);
  assert.equal(urlAbsoluta({ headers: { host: "x.com" } }, "https://otro/x.jpg"), null, "only a path of this server");
});

test("the page's face: og:title, og:image and twitter:card once each, before </head>, escaped; a page without <head> as it is", () => {
  const html = `<!doctype html><html><head>\n  <title>Mundo</title>\n  <meta property="og:image" content="" />\n</head><body></body></html>`;
  const con = conCara(html, { titulo: "Plaza \"de\" Ana & co", imagen: "https://p.numinia.com/a/x.jpg" });
  assert.equal(con.match(/og:image/g)?.length, 1, "the empty one is replaced, not doubled");
  assert.match(con, /<meta property="og:title" content="Plaza &quot;de&quot; Ana &amp; co" \/>/);
  assert.match(con, /<meta name="twitter:card" content="summary_large_image" \/>\n<\/head>/);
  assert.equal(ogImagenComoLaWeb(con, "p.numinia.com"), "https://p.numinia.com/a/x.jpg", "numinia.com reads it");
  assert.doesNotMatch(conCara(html, { titulo: null, imagen: "https://p/a.jpg" }), /og:title/);
  assert.equal(conCara("<p>sin cabeza</p>", { titulo: "t", imagen: "https://p/a.jpg" }), "<p>sin cabeza</p>");
});

test("Pagina: with a cover every HTML page carries it (live: no cover, then one), the ETag follows; JS untouched", () => {
  const dir = tmp("portada-www-"); mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><html><head><title>Mundo</title></head><body></body></html>");
  writeFileSync(join(dir, "assets", "a.js"), "1;");
  const p = new Pagina(dir, { titulo: "Plaza", precomprimir: false });
  const pedir = (path: string, headers: Record<string, string>) => {
    const chunks: Buffer[] = []; let h: Record<string, string> = {};
    const res = { writeHead(_s: number, x: Record<string, string>) { h = x; }, end(c?: Buffer) { if (c) chunks.push(Buffer.from(c)); }, on() { return this; }, once() { return this; }, emit() { return true; }, write() { return true; }, destroy() {} };
    assert.ok(p.servir("GET", path, { headers } as never, res as never));
    return { h, b: Buffer.concat(chunks).toString() };
  };
  const visita = { host: "plaza.numinia.com", "x-forwarded-proto": "https" };
  const sin = pedir("/", visita);
  assert.doesNotMatch(sin.b, /og:image/); assert.match(sin.b, /<title>Plaza<\/title>/);
  let portada: string | null = `/a/${"c".repeat(64)}.jpg`;
  p.portada = () => portada;
  const con = pedir("/", visita);
  assert.equal(ogImagenComoLaWeb(con.b, "plaza.numinia.com"), `https://plaza.numinia.com/a/${"c".repeat(64)}.jpg`);
  assert.match(con.b, /<meta property="og:title" content="Plaza" \/>/);
  assert.notEqual(con.h.etag, sin.h.etag, "a cached page without the cover is not reused");
  portada = `/a/${"d".repeat(64)}.jpg`;
  assert.notEqual(pedir("/", visita).h.etag, con.h.etag, "a new cover, a new ETag");
  assert.match(pedir("/assets/a.js", visita).h["content-type"], /javascript/, "only HTML pages change (the JS goes as a file stream)");
  portada = null;
  assert.doesNotMatch(pedir("/", visita).b, /og:image/, "the cover removed, the tag goes");
});

test("the real server: a world whose ficha names a cover it has serves og:image; a cover it does not have, none", async () => {
  const www = tmp("portada-srv-www-"), aventura = tmp("portada-aventura-"), subidas = tmp("portada-subidas-");
  writeFileSync(join(www, "index.html"), "<!doctype html><html><head><title>Mundo</title></head><body></body></html>");
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  const sha = createHash("sha256").update(jpg).digest("hex");
  writeFileSync(join(subidas, `${sha}.jpg`), jpg);
  const arrancar = async (portada: string) => {
    writeFileSync(join(aventura, "ficha.json"), JSON.stringify({ formato: "ficha@1", nombre: "Plaza de prueba", portada }));
    return startServer({ port: 0, host: "127.0.0.1", log: () => {}, statsMs: 60_000, version: "prueba", www, aventura, subidas, biblioteca: null });
  };
  let srv = await arrancar(`${sha}.jpg`);
  try {
    const html = await (await fetch(`http://127.0.0.1:${srv.port}/`, { headers: { "x-forwarded-proto": "https", "x-forwarded-host": "plaza.numinia.com" } })).text();
    assert.equal(ogImagenComoLaWeb(html, "plaza.numinia.com"), `https://plaza.numinia.com/a/${sha}.jpg`);
    assert.match(html, /<title>Plaza de prueba<\/title>/);
    const img = await fetch(`http://127.0.0.1:${srv.port}/a/${sha}.jpg`);
    assert.equal(img.status, 200, "and the picture it names is served");
  } finally { await srv.close(); }
  srv = await arrancar(`${"e".repeat(64)}.jpg`);
  try {
    const html = await (await fetch(`http://127.0.0.1:${srv.port}/`)).text();
    assert.doesNotMatch(html, /og:image/, "a cover this server does not have is not announced");
  } finally { await srv.close(); }
});
