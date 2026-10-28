// MIS-236 t_3e49cf20: the page must link its web manifest (name «Numinia», fullscreen, icons) or the Quest saves the shortcut as «Mundo».
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const html = readFileSync("apps/plaza/index.html", "utf8");
const manifest = JSON.parse(readFileSync("apps/plaza/public/manifest.webmanifest", "utf8"));

test("index.html links the manifest and an icon", () => {
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest"/);
  assert.match(html, /<link rel="icon" href="\.\/iconos\/numinia-192\.webp"/);
});

test("the manifest names the app Numinia, fullscreen, and its icons exist", () => {
  assert.equal(manifest.name, "Numinia");
  assert.equal(manifest.short_name, "Numinia");
  assert.equal(manifest.display, "fullscreen");
  for (const i of manifest.icons) assert.ok(existsSync(`apps/plaza/public${i.src}`), i.src);
});
