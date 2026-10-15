// schema: every component and message is described once. Types, defaults, validation (with error
// paths, never throwing) and the wire cost in bits all derive from this description.
import type { Issue, Result } from "../../core/src/index.ts";

export type Field =
  | { kind: "int"; min: number; max: number; default?: number }        // stored as int32
  | { kind: "fixed"; min: number; max: number; step: number; default?: number } // Q16.16 world units
  | { kind: "bool"; default?: boolean }
  // the two below are for messages and feature state only (J7), never for ECS columns:
  | { kind: "enum"; values: readonly string[]; default?: string }      // one of a few words; travels as its index
  | { kind: "text"; maxBytes: number; default?: string };              // UTF-8, at most maxBytes bytes

export type Schema = { name: string; version: number; fields: Record<string, Field> };

export function defineSchema(name: string, version: number, fields: Record<string, Field>): Schema {
  return { name, version, fields };
}

/** Bits that carry the byte length of a text field. */
export const textLenBits = (maxBytes: number): number => Math.max(1, Math.ceil(Math.log2(maxBytes + 1)));

/** Bits a field costs on the wire after quantization (the documented per-field cost; text: worst case). */
export function fieldBits(f: Field): number {
  if (f.kind === "bool") return 1;
  if (f.kind === "enum") return Math.max(1, Math.ceil(Math.log2(f.values.length)));
  if (f.kind === "text") return textLenBits(f.maxBytes) + 8 * f.maxBytes;
  const levels = f.kind === "int" ? f.max - f.min + 1 : Math.floor((f.max - f.min) / f.step) + 1;
  return Math.max(1, Math.ceil(Math.log2(levels)));
}
export const schemaBits = (s: Schema): number =>
  Object.values(s.fields).reduce((n, f) => n + fieldBits(f), 0);

export function defaults(s: Schema): Record<string, number | boolean | string> {
  const out: Record<string, number | boolean | string> = {};
  for (const [k, f] of Object.entries(s.fields)) {
    if (f.kind === "bool") out[k] = f.default ?? false;
    else if (f.kind === "enum") out[k] = f.default ?? f.values[0] ?? "";
    else if (f.kind === "text") out[k] = f.default ?? "";
    else out[k] = f.default ?? 0;
  }
  return out;
}

const utf8 = new TextEncoder();
/** Byte length of a string once encoded as UTF-8 (what a text field limits). */
export const utf8Bytes = (s: string): number => utf8.encode(s).length;

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
    } else if (f.kind === "enum") {
      if (typeof v !== "string" || !f.values.includes(v)) issues.push({ path: p, message: `expected one of: ${f.values.join(", ")}` });
    } else if (f.kind === "text") {
      if (typeof v !== "string") issues.push({ path: p, message: "expected text" });
      else if (utf8Bytes(v) > f.maxBytes) issues.push({ path: p, message: `text longer than ${f.maxBytes} bytes (UTF-8): shorten it` });
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
