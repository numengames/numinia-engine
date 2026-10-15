// feature: the plug for game features (J7). A feature is one folder under features/: a declaration
// (pure data: intents, events, state), a server part and a client part. The engine never imports a
// feature; the composition roots in tools/layers.json "_composition" (server main.ts, cli describe.ts,
// apps/plaza/main.ts) pass them in as lists.
// Wire, additive, only when a server runs features: CATALOG (JSON, once per join), FEATURE (one intent
// or event, fields packed by their schema), STATE (one shared key set or deleted). Recipe: docs/EXTENDER.md.
// Accessibility (V1) is part of the declaration, not an extra: every verb has a spoken name, every event says
// what a person hears and reads (or that it is silent), and whatever a feature puts in the world carries a
// card (role, name, description, importance). Screen readers, the engine's voice and AI agents read the same.
import type { Issue } from "../../core/src/index.ts";
import { defineSchema, validate } from "../../schema/src/index.ts";
import type { Field, Schema } from "../../schema/src/index.ts";
import { MSG, BitWriter, BitReader, writeFields, readFields } from "../../net/src/index.ts";
import type { Fields } from "../../net/src/index.ts";

export type { Fields } from "../../net/src/index.ts";
export type Level = "base" | "mejorado" | "frontera";
export type Rate = { perSecond: number; burst: number };

// ---------- accessibility (V1): the same card feeds screen readers, the engine's voice and AI agents ----------
/** What a thing in the world is. Screen readers say it; agents filter by it. */
export const ROLES = ["persona", "puerta", "boton", "cartel", "objeto", "lugar", "salida", "criatura", "punto", "pantalla", "asiento"] as const;
/** The engine's sound set (V6 gives each a real sound). Every announcement has one: no notice without sound. */
export const SOUNDS = ["suave", "aviso", "exito", "error", "paso", "campana", "magia"] as const;
export type Role = (typeof ROLES)[number];
export type Sound = (typeof SOUNDS)[number];
/** 0 ambient · 1 normal · 2 important · 3 safety (V3 speaks the higher first and may cut the lower). */
export type Importance = 0 | 1 | 2 | 3;
/** What a person hears (sound) and reads (text) when an event happens. `{field}` puts a field's value in the text. */
export type Announce = { text: string; sound: Sound; importance?: Importance; at?: [string, string]; who?: string };
/** A thing a feature puts in the world (its shared state). `{key}` and `{field}` work in name and description. */
export type Card = { role: Role; name: string; description?: string; importance?: Importance; sound?: Sound; actions?: string[]; at?: [string, string] };
export type IntentDecl = { describe: string; fields: Fields; rate?: Rate; spoken: string };
export type EventDecl = { describe: string; fields: Fields; announce: Announce | "silent" };
export type MessageDecl = { describe: string; fields: Fields; rate?: Rate; spoken?: string; announce?: Announce | "silent" };
export const SPOKEN_MAX = 40, ANNOUNCE_MAX = 140, CARD_NAME_MAX = 60;
export type FeatureDecl = {
  id: string;            // lowercase, e.g. "gestos"; it names the folder too
  version: number;       // bump it when a message or the state changes shape
  describe: string;      // one line for people and LLMs
  level?: Level;         // base (everyone) · mejorado · frontera (FUNCIONALIDADES.md)
  intents?: Record<string, IntentDecl>;    // client -> server: the verbs a player or an agent can use
  events?: Record<string, EventDecl>;      // server -> client
  state?: { describe: string; fields: Fields; card?: Card }; // shared state by key, replicated to every client; card = it is a thing in the world
};
export type Feature = Readonly<Required<Pick<FeatureDecl, "id" | "version" | "describe" | "level">> & Omit<FeatureDecl, "level"> & { issues: Issue[] }>;

export const DEFAULT_RATE: Rate = { perSecond: 4, burst: 8 };
export const NEAR_RADIUS_M = 32;          // default reach of an event sent { near }
export const QUEUE_PER_PLAYER = 32;       // intents waiting for the next tick, per player
export const STATE_KEY_BYTES = 64;
export const RESERVED_PATHS = ["/health", "/metrics", "/ws"];
const TICK_HZ = 20;                        // same as sim; repeated to keep this package below sim

const ID = /^[a-z][a-z0-9-]{1,31}$/, NAME = /^[a-z][a-zA-Z0-9]{0,31}$/;

function checkFields(fields: Fields, path: string, issues: Issue[]): void {
  if (typeof fields !== "object" || fields === null) { issues.push({ path, message: "fields must be an object (field name -> Field)" }); return; }
  for (const [k, f] of Object.entries(fields)) {
    const p = `${path}.${k}`;
    if (!NAME.test(k)) issues.push({ path: p, message: "field names: lowercase letter first, letters and digits, e.g. 'gesto'" });
    if (f.kind === "int" && !(Number.isInteger(f.min) && Number.isInteger(f.max) && f.min <= f.max)) issues.push({ path: p, message: "int needs integer min <= max" });
    else if (f.kind === "fixed" && !(f.step > 0 && f.min < f.max)) issues.push({ path: p, message: "fixed needs min < max and step > 0" });
    else if (f.kind === "enum" && !(Array.isArray(f.values) && f.values.length >= 1 && f.values.length <= 256 && new Set(f.values).size === f.values.length)) issues.push({ path: p, message: "enum needs 1-256 different words in values" });
    else if (f.kind === "text" && !(Number.isInteger(f.maxBytes) && f.maxBytes >= 1 && f.maxBytes <= 512)) issues.push({ path: p, message: "text needs maxBytes between 1 and 512" });
    else if (!["int", "fixed", "bool", "enum", "text"].includes((f as Field).kind)) issues.push({ path: p, message: "kind must be int, fixed, bool, enum or text" });
  }
}

const HOW = "(accessibility, docs/EXTENDER.md)";
const holes = (t: string) => [...t.matchAll(/\{([a-zA-Z0-9]+)\}/g)].map((m) => m[1]);
function checkTemplate(t: unknown, max: number, names: string[], path: string, issues: Issue[], what: string): void {
  if (typeof t !== "string" || t.trim().length === 0 || t.length > max) { issues.push({ path, message: `${what}: 1-${max} characters ${HOW}` }); return; }
  for (const h of holes(t)) if (!names.includes(h)) issues.push({ path, message: `{${h}} is not a field here (fields: ${names.join(", ") || "none"})` });
}
function checkWhere(fields: Fields, at: unknown, who: unknown, path: string, issues: Issue[]): void {
  const num = (k: unknown) => typeof k === "string" && (fields[k]?.kind === "fixed" || fields[k]?.kind === "int");
  if (at !== undefined && !(Array.isArray(at) && at.length === 2 && at.every(num))) issues.push({ path: `${path}.at`, message: "at: [xField, zField], two numeric fields (metres) of this message" });
  if (who !== undefined && !(typeof who === "string" && fields[who]?.kind === "int")) issues.push({ path: `${path}.who`, message: "who: the name of an int field that holds an entity (the person it is about)" });
}
const okImportance = (i: unknown) => i === undefined || i === 0 || i === 1 || i === 2 || i === 3;

/** Declare a feature. Never throws: problems are listed in `issues` and the runtime skips that feature. */
export function defineFeature(decl: FeatureDecl): Feature {
  const issues: Issue[] = [];
  const id = String(decl.id ?? "");
  if (!ID.test(id)) issues.push({ path: "id", message: "lowercase id of 2-32 chars, e.g. 'gestos'" });
  if (!(Number.isInteger(decl.version) && decl.version >= 1)) issues.push({ path: `${id}.version`, message: "version must be an integer >= 1" });
  if (!decl.describe) issues.push({ path: `${id}.describe`, message: "say in one line what it does (people and LLMs read it)" });
  for (const kind of ["intents", "events"] as const) {
    for (const [name, m] of Object.entries(decl[kind] ?? {})) {
      const p = `${id}.${kind}.${name}`;
      if (!NAME.test(name)) issues.push({ path: p, message: "message names: lowercase letter first, e.g. 'hacer'" });
      if (!m.describe) issues.push({ path: `${p}.describe`, message: "say in one line what it means" });
      checkFields(m.fields, `${p}.fields`, issues);
      const mm = m as MessageDecl;
      if (mm.rate && !(mm.rate.perSecond > 0 && mm.rate.burst >= 1)) issues.push({ path: `${p}.rate`, message: "rate needs perSecond > 0 and burst >= 1" });
      if (kind === "intents") {
        if (typeof mm.spoken !== "string" || !mm.spoken.trim() || mm.spoken.length > SPOKEN_MAX) issues.push({ path: `${p}.spoken`, message: `say the verb as a person says it aloud, 1-${SPOKEN_MAX} characters, e.g. spoken: "saludar" ${HOW}` });
      } else {
        const a = mm.announce;
        if (a === "silent") continue;
        if (!a || typeof a !== "object") { issues.push({ path: `${p}.announce`, message: `say what a person hears and reads: announce: { text: "Alguien saluda", sound: "suave" }, or announce: "silent" if nothing can be seen or heard ${HOW}` }); continue; }
        const names = Object.keys(m.fields ?? {});
        checkTemplate(a.text, ANNOUNCE_MAX, names, `${p}.announce.text`, issues, "the text a screen reader says");
        if (!SOUNDS.includes(a.sound)) issues.push({ path: `${p}.announce.sound`, message: `one of the engine's sounds: ${SOUNDS.join(", ")} (no notice without a sound)` });
        if (!okImportance(a.importance)) issues.push({ path: `${p}.announce.importance`, message: "0 ambient, 1 normal, 2 important, 3 safety" });
        checkWhere(m.fields ?? {}, a.at, a.who, `${p}.announce`, issues);
      }
    }
  }
  if (decl.state) {
    checkFields(decl.state.fields, `${id}.state.fields`, issues);
    const c = decl.state.card, p = `${id}.state.card`;
    if (c !== undefined) {
      const names = ["key", ...Object.keys(decl.state.fields ?? {})];
      if (!ROLES.includes(c.role)) issues.push({ path: `${p}.role`, message: `what it is: ${ROLES.join(", ")}` });
      checkTemplate(c.name, CARD_NAME_MAX, names, `${p}.name`, issues, "its name, as said aloud");
      if (c.description !== undefined) checkTemplate(c.description, ANNOUNCE_MAX, names, `${p}.description`, issues, "a short description");
      if (!okImportance(c.importance)) issues.push({ path: `${p}.importance`, message: "0 ambient, 1 normal, 2 important, 3 safety" });
      if (c.sound !== undefined && !SOUNDS.includes(c.sound)) issues.push({ path: `${p}.sound`, message: `one of: ${SOUNDS.join(", ")}` });
      for (const v of c.actions ?? []) if (!decl.intents?.[v]) issues.push({ path: `${p}.actions`, message: `'${v}' is not an intent of this feature` });
      checkWhere(decl.state.fields ?? {}, c.at, undefined, p, issues);
    }
  }
  return Object.freeze({ ...decl, id, level: decl.level ?? "base", issues });
}

// ---------- catalog: what the server runs, sent once per join; agents read their verbs here ----------
export type CatalogEntry = { index: number; feature: string; kind: "intent" | "event"; name: string; describe: string; fields: Fields; rate?: Rate; spoken?: string; announce?: Announce | "silent" };
export type CatalogFeature = { id: string; version: number; describe: string; level: Level; intents: CatalogEntry[]; events: CatalogEntry[]; state: { describe: string; fields: Fields; card?: Card } | null };
export type Catalog = { schema: "numinia-engine/catalog@1"; features: CatalogFeature[] };
type Entry = CatalogEntry & { schema: Schema };

/** Number every message: features in list order, then intents, then events, in declaration order. */
export function buildCatalog(features: readonly Feature[], log: (l: string) => void = () => {}): { catalog: Catalog; entries: Entry[]; used: Feature[] } {
  const entries: Entry[] = [], out: CatalogFeature[] = [], used: Feature[] = [], seen = new Set<string>();
  for (const f of features) {
    if (f.issues.length) { log(`[funciones] '${f.id}' no se carga: ${f.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`); continue; }
    if (seen.has(f.id)) { log(`[funciones] '${f.id}' está dos veces en la lista; uso la primera`); continue; }
    seen.add(f.id); used.push(f);
    const cf: CatalogFeature = { id: f.id, version: f.version, describe: f.describe, level: f.level, intents: [], events: [], state: f.state ? { describe: f.state.describe, fields: f.state.fields, ...(f.state.card ? { card: f.state.card } : {}) } : null };
    for (const kind of ["intent", "event"] as const) {
      for (const [name, m] of Object.entries((kind === "intent" ? f.intents : f.events) ?? {})) {
        const mm = m as MessageDecl;
        const e: Entry = { index: entries.length, feature: f.id, kind, name, describe: m.describe, fields: m.fields, ...(kind === "intent" ? { rate: mm.rate ?? DEFAULT_RATE, spoken: mm.spoken } : { announce: mm.announce }), schema: defineSchema(`${f.id}.${name}`, f.version, m.fields) };
        entries.push(e);
        const { schema: _s, ...plain } = e;
        (kind === "intent" ? cf.intents : cf.events).push(plain);
      }
    }
    out.push(cf);
  }
  return { catalog: { schema: "numinia-engine/catalog@1", features: out }, entries, used };
}

const utf8enc = new TextEncoder(), utf8dec = new TextDecoder();
export function encodeCatalog(c: Catalog): Uint8Array {
  const json = utf8enc.encode(JSON.stringify(c));
  const out = new Uint8Array(json.length + 1); out[0] = MSG.CATALOG; out.set(json, 1); return out;
}
export function decodeCatalog(bytes: Uint8Array): Catalog | null {
  try { const c = JSON.parse(utf8dec.decode(bytes.subarray(1))); return c?.schema === "numinia-engine/catalog@1" && Array.isArray(c.features) ? c : null; }
  catch { return null; }
}

/** FEATURE: type, message index (16 bits), then the fields in declaration order. */
export function encodeFeatureMessage(index: number, fields: Fields, value: Record<string, unknown>): Uint8Array {
  const w = new BitWriter(16); w.write(MSG.FEATURE, 8); w.write(index, 16); writeFields(w, fields, value); return w.finish();
}
export const featureIndex = (bytes: Uint8Array): number => (bytes.length >= 3 ? (bytes[1] << 8) | bytes[2] : -1);
export function decodeFeatureMessage(bytes: Uint8Array, fields: Fields): Record<string, unknown> | null {
  const r = new BitReader(bytes); r.read(8); r.read(16); return readFields(r, fields);
}

/** STATE: type, feature position in the catalog (16 bits), op (1 set, 2 delete), key, value if set. */
const KEY: Fields = { key: { kind: "text", maxBytes: STATE_KEY_BYTES } };
export function encodeState(featurePos: number, key: string, fields: Fields | null, value?: Record<string, unknown>): Uint8Array {
  const w = new BitWriter(32); w.write(MSG.STATE, 8); w.write(featurePos, 16); w.write(value ? 1 : 2, 8);
  writeFields(w, KEY, { key }); if (value && fields) writeFields(w, fields, value); return w.finish();
}
export function decodeState(bytes: Uint8Array, fieldsOf: (pos: number) => Fields | null): { pos: number; key: string; value: Record<string, unknown> | null } | null {
  const r = new BitReader(bytes); r.read(8);
  const pos = r.read(16), op = r.read(8), k = readFields(r, KEY);
  if (!k || (op !== 1 && op !== 2)) return null;
  if (op === 2) return { pos, key: String(k.key), value: null };
  const fields = fieldsOf(pos); if (!fields) return null;
  const value = readFields(r, fields);
  return value ? { pos, key: String(k.key), value } : null;
}

// ---------- server side ----------
export type ServerHost = {
  players(): readonly number[];                                 // connected entities, join order
  position(entity: number): { x: number; z: number } | null;    // metres; null if gone
  send(entity: number, bytes: Uint8Array): void;                // reliable, in order
  tick(): number;
  log(line: string): void;
  sign?(text: string): string;                                  // HMAC of `text` with the server's secret; "" when there is none
};
export type Scope = "all" | { to: number } | { near: number | { x: number; z: number }; radius?: number };
export type HttpRequest = { method: "GET" | "POST"; path: string; params: Record<string, string>; query: Record<string, string>; body: string };
export type HttpReply = { status?: number; type?: "json" | "html" | "text"; body: unknown };
export type Msg = Record<string, unknown>;
export type ServerApi = {
  readonly id: string;
  /** A player asked for something. Already validated against the declaration and rate-limited. */
  on(intent: string, fn: (from: number, msg: Msg) => void): void;
  /** Tell players something. Returns how many got it. */
  emit(event: string, msg: Msg, scope: Scope): number;
  /** Shared state by key, validated against the declared state, sent to everyone (and to whoever joins later). `at` is kept for area-of-interest scoping later (J9). */
  state: { get(key: string): Msg | undefined; set(key: string, value: Msg, opts?: { at?: { x: number; z: number } }): boolean; delete(key: string): void; keys(): string[] };
  /** An HTTP route on the instance's own port (e.g. the URL a QR opens). Paths like "/e/:token". */
  route(method: "GET" | "POST", path: string, fn: (req: HttpRequest) => HttpReply): void;
  onJoin(fn: (entity: number) => void): void;
  onLeave(fn: (entity: number) => void): void;
  onTick(fn: (tick: number) => void): void;
  players(): readonly number[];
  position(entity: number): { x: number; z: number } | null;
  tick(): number;
  log(line: string): void;
  /** 24 hex characters: HMAC-SHA256 of `text` with the server's secret (env MOTOR_SECRET, 16+ characters). "" when the server has no secret: refuse whatever needed it. Use it to sign URLs/tokens; features cannot import node:crypto. */
  sign(text: string): string;
};
export type ServerPart = { feature: Feature; side: "server"; setup: (api: ServerApi) => void };
export const serverPart = (feature: Feature, setup: (api: ServerApi) => void): ServerPart => ({ feature, side: "server", setup });

type Route = { method: string; parts: string[]; feature: string; fn: (req: HttpRequest) => HttpReply };

export class ServerRuntime {
  readonly catalog: Catalog;
  readonly active: boolean;
  readonly stats = { received: 0, dropped: 0, bad: 0, events: 0, errors: 0 };
  private readonly host: ServerHost;
  private readonly entries: Entry[];
  private readonly catalogBytes: Uint8Array;
  private readonly handlers = new Map<number, { feature: string; fn: (from: number, msg: Msg) => void }>();
  private readonly hooks: { join: [string, (e: number) => void][]; leave: [string, (e: number) => void][]; tick: [string, (t: number) => void][] } = { join: [], leave: [], tick: [] };
  private readonly routeList: Route[] = [];
  private readonly shared = new Map<string, Map<string, { value: Msg; at?: { x: number; z: number } }>>();
  private queue: { from: number; entry: Entry; msg: Msg }[] = [];
  private readonly waiting = new Map<number, number>();
  private readonly buckets = new Map<number, Map<number, { tokens: number; tick: number }>>();
  private readonly failed = new Set<string>();

  constructor(parts: readonly ServerPart[], host: ServerHost) {
    this.host = host;
    const built = buildCatalog(parts.map((p) => p.feature), host.log);
    this.catalog = built.catalog; this.entries = built.entries;
    this.catalogBytes = encodeCatalog(this.catalog);
    for (const p of parts) {
      if (!built.used.includes(p.feature)) continue;
      try { p.setup(this.api(p.feature)); }
      catch (e) { this.fail(p.feature.id, "al arrancar", e); }
    }
    this.active = built.used.length > 0;
  }

  private fail(feature: string, where: string, e: unknown): void {
    this.stats.errors++;
    const key = `${feature}:${where}`;
    if (!this.failed.has(key)) { this.failed.add(key); this.host.log(`[funciones] '${feature}' falló ${where}: ${String((e as Error)?.message ?? e)} (el resto sigue)`); }
  }
  private entry(feature: string, kind: "intent" | "event", name: string): Entry | undefined {
    return this.entries.find((e) => e.feature === feature && e.kind === kind && e.name === name);
  }
  private recipients(scope: Scope): number[] {
    const all = this.host.players();
    if (scope === "all") return all.slice();
    if ("to" in scope) return all.includes(scope.to) ? [scope.to] : [];
    const c = typeof scope.near === "number" ? this.host.position(scope.near) : scope.near;
    if (!c) return [];
    const r2 = (scope.radius ?? NEAR_RADIUS_M) ** 2;
    return all.filter((e) => { const p = this.host.position(e); return !!p && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 <= r2; });
  }

  private api(f: Feature): ServerApi {
    const id = f.id, log = (l: string) => this.host.log(`[${id}] ${l}`);
    const pos = this.catalog.features.findIndex((c) => c.id === id);
    const stateSchema = f.state ? defineSchema(`${id}.state`, f.version, f.state.fields) : null;
    const table = new Map<string, { value: Msg; at?: { x: number; z: number } }>();
    this.shared.set(id, table);
    return {
      id,
      on: (intent, fn) => {
        const e = this.entry(id, "intent", intent);
        if (!e) { log(`on('${intent}'): no está declarado en intents (hay: ${Object.keys(f.intents ?? {}).join(", ") || "ninguno"})`); return; }
        this.handlers.set(e.index, { feature: id, fn });
      },
      emit: (event, msg, scope) => {
        const e = this.entry(id, "event", event);
        if (!e) { log(`emit('${event}'): no está declarado en events`); return 0; }
        const v = validate(e.schema, msg);
        if (!v.ok) { log(`emit('${event}') no cumple su esquema: ${v.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`); return 0; }
        const bytes = encodeFeatureMessage(e.index, e.fields, v.value);
        const to = this.recipients(scope);
        for (const p of to) this.host.send(p, bytes);
        this.stats.events++;
        return to.length;
      },
      state: {
        get: (key) => table.get(key)?.value,
        keys: () => [...table.keys()],
        set: (key, value, opts) => {
          if (!stateSchema || !f.state) { log("state.set: la función no declara state"); return false; }
          if (opts?.at && !f.state.card) { log(`state.set('${key}', …, { at }): algo que se pone en el mundo necesita su ficha: declara state.card (rol, nombre…) ${HOW}`); return false; }
          if (key.length === 0 || new TextEncoder().encode(key).length > STATE_KEY_BYTES) { log(`state.set: la clave debe tener 1-${STATE_KEY_BYTES} bytes`); return false; }
          const v = validate(stateSchema, value);
          if (!v.ok) { log(`state.set('${key}') no cumple su esquema: ${v.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`); return false; }
          table.set(key, { value: v.value, at: opts?.at });
          const bytes = encodeState(pos, key, f.state.fields, v.value);
          for (const p of this.host.players()) this.host.send(p, bytes);
          return true;
        },
        delete: (key) => {
          if (!table.delete(key)) return;
          const bytes = encodeState(pos, key, null);
          for (const p of this.host.players()) this.host.send(p, bytes);
        },
      },
      route: (method, path, fn) => {
        const clean = "/" + path.split("/").filter(Boolean).join("/");
        if (RESERVED_PATHS.includes(clean)) { log(`route: ${clean} es del motor`); return; }
        const parts = clean.split("/").slice(1);
        if (this.routeList.some((r) => r.method === method && r.parts.join("/") === parts.join("/"))) { log(`route: ${method} ${clean} ya existe`); return; }
        this.routeList.push({ method, parts, feature: id, fn });
      },
      onJoin: (fn) => { this.hooks.join.push([id, fn]); },
      onLeave: (fn) => { this.hooks.leave.push([id, fn]); },
      onTick: (fn) => { this.hooks.tick.push([id, fn]); },
      players: () => this.host.players(),
      position: (e) => this.host.position(e),
      tick: () => this.host.tick(),
      sign: (text) => this.host.sign?.(text) ?? "",
      log,
    };
  }

  /** Someone joined: send what the server runs and the current shared state, then tell the features. */
  join(entity: number): void {
    if (!this.active) return;
    this.host.send(entity, this.catalogBytes);
    this.catalog.features.forEach((cf, pos) => {
      const table = this.shared.get(cf.id);
      if (!table || !cf.state) return;
      for (const [key, s] of table) this.host.send(entity, encodeState(pos, key, cf.state.fields, s.value));
    });
    for (const [id, fn] of this.hooks.join) { try { fn(entity); } catch (e) { this.fail(id, "en onJoin", e); } }
  }

  leave(entity: number): void {
    for (const [id, fn] of this.hooks.leave) { try { fn(entity); } catch (e) { this.fail(id, "en onLeave", e); } }
    this.buckets.delete(entity); this.waiting.delete(entity);
  }

  /** A FEATURE message from a player. Returns false if it is malformed (the caller counts it). */
  receive(from: number, bytes: Uint8Array): boolean {
    const e = this.entries[featureIndex(bytes)];
    if (!e || e.kind !== "intent") { this.stats.bad++; return false; }
    const raw = decodeFeatureMessage(bytes, e.fields);
    const v = raw ? validate(e.schema, raw) : null;
    if (!v || !v.ok) { this.stats.bad++; return false; }
    this.stats.received++;
    // rate limit per player and intent: a bucket of `burst` tokens refilled at `perSecond`
    const rate = e.rate ?? DEFAULT_RATE, now = this.host.tick();
    let mine = this.buckets.get(from);
    if (!mine) this.buckets.set(from, (mine = new Map()));
    let b = mine.get(e.index);
    if (!b) mine.set(e.index, (b = { tokens: rate.burst, tick: now }));
    b.tokens = Math.min(rate.burst, b.tokens + ((now - b.tick) * rate.perSecond) / TICK_HZ); b.tick = now;
    const queued = this.waiting.get(from) ?? 0;
    if (b.tokens < 1 || queued >= QUEUE_PER_PLAYER) { this.stats.dropped++; return true; }
    b.tokens -= 1;
    this.waiting.set(from, queued + 1);
    this.queue.push({ from, entry: e, msg: v.value });
    return true;
  }

  /** Called once per tick by the instance, after the simulation step: intents in arrival order, then tick hooks. */
  tick(): void {
    if (!this.active) return;
    const q = this.queue; this.queue = []; this.waiting.clear();
    for (const it of q) {
      const h = this.handlers.get(it.entry.index);
      if (!h) continue;
      try { h.fn(it.from, it.msg); } catch (e) { this.fail(h.feature, `en on('${it.entry.name}')`, e); }
    }
    const t = this.host.tick();
    for (const [id, fn] of this.hooks.tick) { try { fn(t); } catch (e) { this.fail(id, "en onTick", e); } }
  }

  /** HTTP for the features' routes; null when no route matches. */
  http(method: string, path: string, query: Record<string, string>, body: string): HttpReply | null {
    if (method !== "GET" && method !== "POST") return null;
    const parts = path.split("/").filter(Boolean);
    for (const r of this.routeList) {
      if (r.method !== method || r.parts.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < parts.length && ok; i++) {
        if (r.parts[i].startsWith(":")) { try { params[r.parts[i].slice(1)] = decodeURIComponent(parts[i]); } catch { ok = false; } }
        else ok = r.parts[i] === parts[i];
      }
      if (!ok) continue;
      try { return r.fn({ method, path, params, query, body }); }
      catch (e) { this.fail(r.feature, `en la ruta ${method} /${r.parts.join("/")}`, e); return { status: 500, type: "json", body: { error: `la función '${r.feature}' falló; el resto sigue` } }; }
    }
    return null;
  }

  routes(): string[] { return this.routeList.map((r) => `${r.method} /${r.parts.join("/")} (${r.feature})`); }
}

// ---------- client side (no DOM: runs in Node tests and in the browser) ----------
export type ViewHooks = {
  label(entity: number, text: string, ms: number): void;
  bounce(entity: number, ms: number): void;
  /** A column of light with a text at a world point (metres) for `ms`. Optional: a view that cannot draw it just skips it. */
  beacon?(x: number, z: number, text: string, ms: number): void;
  /** V1: an event as a person hears and reads it (the page puts it in an aria-live region; V3 speaks it). */
  announce?(a: Announcement): void;
};
export const NO_VIEW: ViewHooks = { label() {}, bounce() {} };
/** An event as a person hears and reads it (V1). `at` in metres; `who` = the entity it is about. */
export type Announcement = { feature: string; event: string; text: string; sound: Sound; importance: Importance; at?: { x: number; z: number }; who?: number };
/** A thing in the world as a screen reader or an agent reads it (V1). */
export type CardView = { feature: string; key: string; role: Role; name: string; description?: string; importance: Importance; actions: string[]; at?: { x: number; z: number } };
/** Fill `{field}` holes with the values (`{key}` = the state key). Unknown holes stay as they are. */
export const fillTemplate = (t: string, values: Record<string, unknown>): string => t.replace(/\{([a-zA-Z0-9]+)\}/g, (all, k) => (values[k] === undefined ? all : String(values[k])));
export type Action = { feature: string; id: string; label: string; key?: string; describe?: string; run: () => void };
export type ClientApi = {
  readonly id: string;
  on(event: string, fn: (msg: Msg) => void): void;
  /** Ask the server. Refused (with the reason) before the catalog arrives or if the server lacks it. */
  send(intent: string, msg: Msg): { ok: true } | { ok: false; why: string };
  state: { get(key: string): Msg | undefined; keys(): string[]; onChange(fn: (key: string, value: Msg | undefined) => void): void };
  /** Something the player can do: a key on desktop, a button on touch screens (the page draws it). */
  action(a: Omit<Action, "feature">): void;
  self(): number;
  readonly view: ViewHooks;
};
export type ClientPart = { feature: Feature; side: "client"; setup: (api: ClientApi) => void };
export const clientPart = (feature: Feature, setup: (api: ClientApi) => void): ClientPart => ({ feature, side: "client", setup });
export type ClientHost = { send(bytes: Uint8Array): void; self(): number; view?: ViewHooks };

export class ClientRuntime {
  catalog: Catalog | null = null;
  readonly log: { feature: string; event: string; msg: Msg }[] = []; // last 32 events: for checks and agents
  readonly announcements: Announcement[] = [];                         // last 32, as a person hears them (V1)
  readonly warnings: string[] = [];
  readonly stats = { events: 0, bad: 0, sent: 0, refused: 0, errors: 0 };
  private readonly host: ClientHost;
  private readonly local: Feature[] = [];
  private readonly listeners = new Map<string, ((msg: Msg) => void)[]>();          // "feature.event"
  private readonly changes = new Map<string, ((k: string, v: Msg | undefined) => void)[]>();
  private readonly mirror = new Map<string, Map<string, Msg>>();
  private readonly acts: Action[] = [];
  private byIndex: CatalogEntry[] = [];

  constructor(parts: readonly ClientPart[], host: ClientHost) {
    this.host = host;
    for (const p of parts) {
      const f = p.feature;
      if (f.issues.length) { this.warnings.push(`'${f.id}' no se carga: ${f.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`); continue; }
      this.local.push(f);
      this.mirror.set(f.id, new Map());
      try { p.setup(this.api(f)); } catch (e) { this.stats.errors++; this.warnings.push(`'${f.id}' falló al arrancar: ${String((e as Error)?.message ?? e)}`); }
    }
  }

  private api(f: Feature): ClientApi {
    const id = f.id, host = this.host;
    return {
      id,
      on: (event, fn) => {
        if (!f.events?.[event]) this.warnings.push(`'${id}': on('${event}') no está en events`);
        const k = `${id}.${event}`; this.listeners.set(k, [...(this.listeners.get(k) ?? []), fn]);
      },
      send: (intent, msg) => this.send(id, intent, msg),
      state: {
        get: (key) => this.mirror.get(id)?.get(key),
        keys: () => [...(this.mirror.get(id)?.keys() ?? [])],
        onChange: (fn) => { this.changes.set(id, [...(this.changes.get(id) ?? []), fn]); },
      },
      action: (a) => { this.acts.push({ ...a, feature: id }); },
      self: () => host.self(),
      get view() { return host.view ?? NO_VIEW; }, // read on each use: the page may attach its view later
    };
  }

  actions(): readonly Action[] { return this.acts; }

  /** V1: every thing the features put in the world, as a screen reader or an agent reads it. */
  cards(): CardView[] {
    const out: CardView[] = [];
    for (const f of this.catalog?.features ?? []) {
      const c = f.state?.card;
      if (!c) continue;
      for (const [key, v] of this.mirror.get(f.id) ?? []) {
        const vals = { key, ...v };
        const card: CardView = { feature: f.id, key, role: c.role, name: fillTemplate(c.name, vals), importance: c.importance ?? 1, actions: c.actions ?? [] };
        if (c.description) card.description = fillTemplate(c.description, vals);
        if (c.at) card.at = { x: Number(v[c.at[0]]), z: Number(v[c.at[1]]) };
        out.push(card);
      }
    }
    return out;
  }

  /** The shared state of one feature as this page knows it (for the page, checks and agents). */
  stateOf(feature: string): ReadonlyMap<string, Msg> { return this.mirror.get(feature) ?? new Map(); }

  send(feature: string, intent: string, msg: Msg): { ok: true } | { ok: false; why: string } {
    const refuse = (why: string) => { this.stats.refused++; return { ok: false as const, why }; };
    if (!this.catalog) return refuse("todavía no hay catálogo del servidor");
    const e = this.byIndex.find((x) => x.feature === feature && x.kind === "intent" && x.name === intent);
    if (!e) return refuse(`el servidor no tiene '${feature}.${intent}'`);
    const v = validate(defineSchema(`${feature}.${intent}`, 1, e.fields), msg);
    if (!v.ok) return refuse(v.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
    this.host.send(encodeFeatureMessage(e.index, e.fields, v.value));
    this.stats.sent++;
    return { ok: true };
  }

  /** CATALOG, FEATURE or STATE from the server. Returns false if it is not one of those. */
  receive(bytes: Uint8Array): boolean {
    const type = bytes[0];
    if (type === MSG.CATALOG) {
      const c = decodeCatalog(bytes);
      if (!c) { this.stats.bad++; return true; }
      this.catalog = c;
      this.byIndex = c.features.flatMap((f) => [...f.intents, ...f.events]).sort((a, b) => a.index - b.index);
      for (const f of this.local) {
        const s = c.features.find((x) => x.id === f.id);
        if (!s) this.warnings.push(`el servidor no tiene '${f.id}': sus acciones no harán nada`);
        else if (s.version !== f.version) this.warnings.push(`'${f.id}': aquí versión ${f.version}, en el servidor ${s.version}; leo con la del servidor`);
      }
      return true;
    }
    if (type === MSG.FEATURE) {
      const e = this.byIndex[featureIndex(bytes)];
      const msg = e && e.kind === "event" ? decodeFeatureMessage(bytes, e.fields) : null;
      if (!e || !msg) { this.stats.bad++; return true; }
      this.stats.events++;
      this.log.push({ feature: e.feature, event: e.name, msg }); if (this.log.length > 32) this.log.shift();
      const an = e.announce;
      if (an && an !== "silent") {
        const a: Announcement = { feature: e.feature, event: e.name, text: fillTemplate(an.text, msg), sound: an.sound, importance: an.importance ?? 1 };
        if (an.at) a.at = { x: Number(msg[an.at[0]]), z: Number(msg[an.at[1]]) };
        if (an.who) a.who = Number(msg[an.who]);
        this.announcements.push(a); if (this.announcements.length > 32) this.announcements.shift();
        try { this.host.view?.announce?.(a); } catch { this.stats.errors++; }
      }
      for (const fn of this.listeners.get(`${e.feature}.${e.name}`) ?? []) { try { fn(msg); } catch { this.stats.errors++; } }
      return true;
    }
    if (type === MSG.STATE) {
      const c = this.catalog;
      const s = c ? decodeState(bytes, (pos) => c.features[pos]?.state?.fields ?? null) : null;
      const f = s && c ? c.features[s.pos] : undefined;
      if (!s || !f) { this.stats.bad++; return true; }
      let table = this.mirror.get(f.id);
      if (!table) this.mirror.set(f.id, (table = new Map()));
      if (s.value) table.set(s.key, s.value); else table.delete(s.key);
      for (const fn of this.changes.get(f.id) ?? []) { try { fn(s.key, s.value ?? undefined); } catch { this.stats.errors++; } }
      return true;
    }
    return false;
  }
}

/** Escape text for an HTML reply (features that answer a QR with a small page). */
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
