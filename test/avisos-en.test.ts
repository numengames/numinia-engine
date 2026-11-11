// Every notice whose source text is Spanish has its English in packages/feature/src/avisos-en.ts, with the same {placeholders}.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { AVISOS_EN } from "../packages/feature/src/avisos-en.ts";
import { fijarIdioma } from "../packages/feature/src/idioma.ts";

const RAIZ = new URL("..", import.meta.url).pathname;
const ESPANOL = /[áéíóúñ¿¡]|^(Has|Te|Se|Ya|Tu|Un|Una|El|La|Es|Estás|Alguien|Levantan|Fin|Misión|Caña|Nuevo|Nueva|Sin|Con|Hay|Ha|Han|No|Lo|Los|Las|Entras|Sales|Tres|Escena|Cable|Gesto|Recibes|Antes|Golpe|Demasiado|Algo|Caes|Hecho|Ajustes|Dominio|Pantalla)\b|\b(de|del|a la|se va|aparece en)\b/;
const marcas = (t: string): string[] => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const anuncios: Record<string, string> = {};
for (const d of readdirSync(`${RAIZ}features`)) {
  let m: Record<string, unknown>;
  try { m = await import(`${RAIZ}features/${d}/feature.ts`); } catch { continue; }
  for (const v of Object.values(m)) {
    const f = v as { id?: string; events?: Record<string, { announce?: { text?: string } | "silent" }> };
    if (!f || typeof f !== "object" || !f.id || !f.events) continue;
    for (const [n, e] of Object.entries(f.events)) if (e.announce && e.announce !== "silent" && typeof e.announce.text === "string") anuncios[`${f.id}.${n}`] = e.announce.text;
  }
}

test("a Spanish announcement has its English entry, with the same placeholders", () => {
  assert.ok(Object.keys(anuncios).length > 100, "the announcements were read");
  const faltan = Object.entries(anuncios).filter(([k, t]) => ESPANOL.test(t) && !AVISOS_EN[k]).map(([k, t]) => `${k}: «${t}» needs an entry in packages/feature/src/avisos-en.ts`);
  assert.deepEqual(faltan, []);
  const mal = Object.entries(AVISOS_EN).filter(([k, t]) => !anuncios[k] || marcas(t).join() !== marcas(anuncios[k]).join()).map(([k]) => `${k}: no such announcement or other placeholders`);
  assert.deepEqual(mal, []);
});

test("a sample entry reads as English", () => {
  fijarIdioma("en");
  assert.equal(AVISOS_EN["suelo.vuelta"], "You are back in a safe place");
  fijarIdioma("en"); // restore for other tests in this process
});
