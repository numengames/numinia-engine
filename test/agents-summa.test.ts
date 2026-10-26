// t_b7058149 · AGENTS.md cites the Summa (numinia.org) as the source of its rules. Offline: the section exists, cites the principles and
// standards the card names, every numinia.org link has the shape the archive publishes (checked against the live site when the card was
// built: all 200), and the unattended-shift procedure is still the last section (the night shift reads this file and must not break).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const md = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");

test("AGENTS.md has «Rules: where they live (the Summa)» citing PRI-016..018, STD-026 and STD-050", () => {
  const i = md.indexOf("## Rules: where they live (the Summa)");
  assert.ok(i > 0, "the section");
  const sec = md.slice(i, md.indexOf("\n## ", i + 5));
  for (const id of ["PRI-016", "PRI-017", "PRI-018", "STD-026", "STD-050", "STD-019", "STD-052", "SYS-016"]) assert.ok(sec.includes(`[${id} `), id);
  assert.match(sec, /source of\ntruth/); assert.match(sec, /binds today/);
});

test("every numinia.org link in AGENTS.md is a page the archive publishes (principles|standards|procedures|system/<ID>-<slug>, decisions/adr-NNN, /binding)", () => {
  const links = [...md.matchAll(/https:\/\/numinia\.org(\/[^)\s>]*)/g)].map((m) => m[1]);
  assert.ok(links.length >= 14, `${links.length} links`);
  for (const l of links) assert.match(l, /^\/(principles\/pri-\d{3}-[a-z0-9-]+|standards\/std-\d{3}-[a-z0-9-]+|procedures\/pro-\d{3}-[a-z0-9-]+|system\/sys-\d{3}-[a-z0-9-]+|decisions\/adr-\d{3}|binding)$/, l);
  assert.equal(new Set(links).size, links.length, "no link twice");
});

test("the unattended-shift procedure is untouched: still the last section, after the Summa section", () => {
  const h = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.equal(h.at(-1), "Unattended shift (cron) — the procedure");
  assert.ok(h.indexOf("Rules: where they live (the Summa)") < h.indexOf("Layers (enforced by `tools/layers.mjs`, rules in `tools/layers.json`)"));
});
