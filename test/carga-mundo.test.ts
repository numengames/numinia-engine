// A world's own loading-screen picture (ficha `carga`): validated, painted by the page before any script, moon kept without it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { conCarga } from "../packages/server/src/pagina.ts";
import { validarFicha } from "../packages/server/src/aventura.ts";

const H = "a".repeat(64), html = "<html><head><title>x</title></head><body><div id=\"carga\"></div></body></html>";

test("ficha: carga is <sha256>.png|jpg|webp, credito at most 120 letters", () => {
  assert.ok(validarFicha({ formato: "ficha@1", nombre: "Hermes", carga: `${H}.webp`, carga_credito: "Nous Research" }).ok);
  const mal = validarFicha({ formato: "ficha@1", nombre: "Hermes", carga: "../x.webp", carga_credito: "x".repeat(121) });
  assert.ok(!mal.ok && mal.issues.some((i) => i.path.endsWith(".carga")) && mal.issues.some((i) => i.path.endsWith(".carga_credito")));
});

test("page: the picture is preloaded and painted in a <style> inside <head>, moon hidden, credit escaped", () => {
  const r = conCarga(html, { url: `/a/${H}.webp`, credito: 'Art: "Nous"</style><script>' });
  assert.ok(r.indexOf("carga-mundo") < r.indexOf("</head>"));
  assert.match(r, new RegExp(`rel="preload" as="image" href="/a/${H}.webp"`));
  assert.match(r, new RegExp(`url\\(/a/${H}.webp\\) center/cover`));
  assert.ok(!r.includes("<script>") && !r.includes('"Nous"'), "nothing can leave the CSS string");
  assert.ok(!/<style id="carga-mundo">[^]*<\/style>[^]*<\/style>/.test(r));
});

test("page: a url that is not one of the server's assets, or no </head>, leaves the page as it is", () => {
  assert.equal(conCarga(html, { url: "https://evil/x.png" }), html);
  assert.equal(conCarga(html, { url: `/a/${H}.webp);}body{display:none` }), html);
  assert.equal(conCarga("<p>x</p>", { url: `/a/${H}.webp` }), "<p>x</p>");
});
