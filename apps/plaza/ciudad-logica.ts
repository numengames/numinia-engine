// ciudad-logica (t_5cff4f06): the decision behind the corner button that leaves the world for the city, with no DOM
// so node:test can run it (test/ciudad.test.ts). The engine does not know what "the city" is — a world only ever
// gives it a plain URL in its own mundo.ajustes.json (`ciudadUrl`); this file only decides whether that URL is good
// enough to point a button at. Never throws: a missing or malformed field just means no button (EXTENDER.md: a
// world's settings are read field by field, each with its own fallback).
export type ConCiudad = { ciudadUrl?: unknown };

/** The city's URL from a world's settings file, or null when it is absent or not an absolute http(s) address. */
export function urlCiudad(mundo: unknown): string | null {
  const m = mundo as ConCiudad | null | undefined;
  if (typeof m !== "object" || m === null) return null;
  const u = m.ciudadUrl;
  if (typeof u !== "string" || !u.trim()) return null;
  let parsed: URL;
  try { parsed = new URL(u); } catch { return null; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return u;
}
