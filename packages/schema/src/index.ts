// schema: every component and message is described once. Types, defaults, validation (with error
// paths, never throwing) and the wire cost in bits all derive from this description.
import type { Issue, Result } from "../../core/src/index.ts";

export type Field =
  | { kind: "int"; min: number; max: number; default?: number }        // stored as int32
  | { kind: "fixed"; min: number; max: number; step: number; default?: number } // Q16.16 world units
  | { kind: "bool"; default?: boolean };

export type Schema = { name: string; version: number; fields: Record<string, Field> };

export function defineSchema(name: string, version: number, fields: Record<string, Field>): Schema {
  return { name, version, fields };
}

/** Bits a field costs on the wire after quantization (the documented per-field cost). */
export function fieldBits(f: Field): number {
  if (f.kind === "bool") return 1;
  const levels = f.kind === "int" ? f.max - f.min + 1 : Math.floor((f.max - f.min) / f.step) + 1;
  return Math.max(1, Math.ceil(Math.log2(levels)));
}
export const schemaBits = (s: Schema): number =>
  Object.values(s.fields).reduce((n, f) => n + fieldBits(f), 0);

export function defaults(s: Schema): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const [k, f] of Object.entries(s.fields)) out[k] = f.kind === "bool" ? (f.default ?? false) : (f.default ?? 0);
  return out;
}

/**
 * Validate plain JSON against a schema. Unknown keys are KEPT (forward compatibility: a newer
 * writer's fields survive an older reader), and reported only as information, never as errors.
 */
export function validate(s: Schema, input: unknown, path = s.name): Result<Record<string, unknown>> {
  const issues: Issue[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, issues: [{ path, message: "expected an object" }] };
  }
  const value: Record<string, unknown> = { ...defaults(s), ...(input as Record<string, unknown>) };
  for (const [k, f] of Object.entries(s.fields)) {
    const v = value[k];
    const p = `${path}.${k}`;
    if (f.kind === "bool") {
      if (typeof v !== "boolean") issues.push({ path: p, message: "expected boolean" });
    } else if (typeof v !== "number" || !Number.isFinite(v)) {
      issues.push({ path: p, message: "expected a finite number" });
    } else if (v < f.min || v > f.max) {
      issues.push({ path: p, message: `out of range [${f.min}, ${f.max}]` });
    } else if (f.kind === "int" && !Number.isInteger(v)) {
      issues.push({ path: p, message: "expected an integer" });
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, value };
}
