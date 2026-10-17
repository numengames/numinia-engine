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
import { validarAjustes } from "./ajustes.ts";
import type { AjusteDecl } from "./ajustes.ts";
export type { AjusteDecl } from "./ajustes.ts"; // N2: the settings a feature declares (format and validation: ajustes.ts)

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
export type Card = { role: Role; name: string; description?: string; importance?: Importance; sound?: Sound; actions?: string[]; at?: [string, string]; interact?: Interact };
/** J4: something a person uses from close by (talk to someone, take a thing, open a door). The page shows «E: <prompt>»
 * for the nearest one in reach (a button on touch screens) and sends `intent` with the thing's state key in the
 * intent's text field `key`; the server checks the distance again (`api.within`). `radius`: metres, or the name of a
 * numeric state field (each thing its own). */
export type Interact = { intent: string; prompt: string; radius: number | string; key: string };
export const INTERACT_RADIUS_MAX = 16;   // J4: metres
export const INTERACT_SLACK_M = 1.5;     // J4: the server allows this much more than the page (latency, prediction)
/** Reach in height (vertical worlds): a thing whose state carries a numeric `y` (metres, its feet or its shelf) is in
 * reach only when the player's feet are within this many metres of it, so a person one floor up is out of reach from
 * below. The same number on the server (`api.within`) and on the page (`reachable`); a jump is 1.5 m. */
export const ALCANCE_ALTURA_M = 2.5;
/** The height rule: true when the thing has no `y` (any height) or the player stands within ALCANCE_ALTURA_M of it. A
 * player of unknown height stands on the ground (0). */
export const alAlcanceEnAltura = (playerY: number | undefined, thingY: unknown): boolean =>
  typeof thingY !== "number" || !Number.isFinite(thingY) || Math.abs((playerY ?? 0) - thingY) <= ALCANCE_ALTURA_M;
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
  state?: { describe: string; fields: Fields; card?: Card; persist?: boolean; radius?: number }; // radius (J9): things (entries set with `at`) reach players within it // shared state by key, replicated to every client; card = it is a thing in the world; persist = survives restarts (S4)
  store?: { describe: string };            // S4: server-only data that survives restarts (inventories, who claimed what and when); never sent to pages
  ajustes?: AjusteDecl[];                  // N2: settings this feature offers in the menu, in its own group (page side only; read with view.ajuste)
};
export type Feature = Readonly<Required<Pick<FeatureDecl, "id" | "version" | "describe" | "level">> & Omit<FeatureDecl, "level"> & { issues: Issue[] }>;

export const DEFAULT_RATE: Rate = { perSecond: 4, burst: 8 };
export const STORE_VALUE_MAX = 4096;      // bytes of JSON per stored key (S4)
export const STORE_KEYS_MAX = 10_000;     // keys per feature store (S4)
export const STATE_RADIUS_M = 64;         // J9: a thing in the world (state set with `at`) reaches players this close, by default
export const STATE_REFRESH_TICKS = 10;    // J9: who has which things is recomputed every 0.5 s as people move
export const FORGET_FACTOR = 1.25;        // J9: a thing a player has is forgotten only past radius × 1.25 (no flapping at the edge)
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
/** J4: an interactive thing names one of its feature's intents, the text field that gets the thing's key, a prompt and a reach. */
function checkInteract(decl: FeatureDecl, it: Interact, path: string, issues: Issue[]): void {
  const intent = decl.intents?.[String(it?.intent)];
  if (!intent) { issues.push({ path: `${path}.intent`, message: `'${String(it?.intent)}' is not an intent of this feature (the verb a person uses on the thing)` }); return; }
  if (intent.fields?.[it.key]?.kind !== "text") issues.push({ path: `${path}.key`, message: `the name of a text field of '${it.intent}' that receives the thing's key, e.g. key: "pnj"` });
  const sf = decl.state?.fields ?? {};
  checkTemplate(it.prompt, SPOKEN_MAX, ["key", ...Object.keys(sf)], `${path}.prompt`, issues, "what the page shows after «E:», e.g. \"hablar con {nombre}\"");
  const r = it.radius;
  if (typeof r === "number" ? !(r >= 0.5 && r <= INTERACT_RADIUS_MAX) : !(typeof r === "string" && (sf[r]?.kind === "fixed" || sf[r]?.kind === "int"))) issues.push({ path: `${path}.radius`, message: `metres between 0.5 and ${INTERACT_RADIUS_MAX}, or the name of a numeric state field` });
  if (!decl.state?.card?.at) issues.push({ path, message: "a thing used from close by needs its place: card.at: [xField, zField]" });
}

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
  if (decl.store !== undefined && !decl.store?.describe) issues.push({ path: `${id}.store.describe`, message: "say in one line what is kept (people and agents read it)" });
  if (decl.state?.persist !== undefined && typeof decl.state.persist !== "boolean") issues.push({ path: `${id}.state.persist`, message: "persist: true or false" });
  if (decl.state?.radius !== undefined && !(typeof decl.state.radius === "number" && decl.state.radius >= 8 && decl.state.radius <= 2000)) issues.push({ path: `${id}.state.radius`, message: "radius: metres between 8 and 2000 (who receives the things this feature puts in the world)" });
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
      if (c.interact !== undefined) checkInteract(decl, c.interact, `${p}.interact`, issues);
    }
  }
  if (decl.ajustes !== undefined) issues.push(...validarAjustes(decl.ajustes, `${id}.ajustes`, id)); // N2: settings, each with its spoken name
  return Object.freeze({ ...decl, id, level: decl.level ?? "base", issues });
}

// ---------- catalog: what the server runs, sent once per join; agents read their verbs here ----------
export type CatalogEntry = { index: number; feature: string; kind: "intent" | "event"; name: string; describe: string; fields: Fields; rate?: Rate; spoken?: string; announce?: Announce | "silent" };
export type CatalogFeature = { id: string; version: number; describe: string; level: Level; intents: CatalogEntry[]; events: CatalogEntry[]; state: { describe: string; fields: Fields; card?: Card; radius?: number } | null };
export type Catalog = { schema: "numinia-engine/catalog@1"; features: CatalogFeature[] };
type Entry = CatalogEntry & { schema: Schema };

/** Number every message: features in list order, then intents, then events, in declaration order. */
export function buildCatalog(features: readonly Feature[], log: (l: string) => void = () => {}): { catalog: Catalog; entries: Entry[]; used: Feature[] } {
  const entries: Entry[] = [], out: CatalogFeature[] = [], used: Feature[] = [], seen = new Set<string>();
  for (const f of features) {
    if (f.issues.length) { log(`[funciones] '${f.id}' no se carga: ${f.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`); continue; }
    if (seen.has(f.id)) { log(`[funciones] '${f.id}' está dos veces en la lista; uso la primera`); continue; }
    seen.add(f.id); used.push(f);
    const cf: CatalogFeature = { id: f.id, version: f.version, describe: f.describe, level: f.level, intents: [], events: [], state: f.state ? { describe: f.state.describe, fields: f.state.fields, ...(f.state.card ? { card: f.state.card, radius: f.state.radius ?? STATE_RADIUS_M } : {}) } : null };
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
/** S4: what a feature had saved (state entries and store entries) and how changes are recorded. The server
 * gives a file-backed one (packages/server/src/datos.ts); without one, everything lives in memory only. */
export type Saved = { version: number; state: [string, { value: Msg; at?: { x: number; z: number } }][]; store: [string, unknown][] };
export type StorageOp = { op: "s"; key: string; value: Msg; at?: { x: number; z: number } } | { op: "sd"; key: string } | { op: "k"; key: string; value: unknown } | { op: "kd"; key: string };
export interface FeatureStorage { load(feature: string): Saved | null; record(feature: string, version: number, op: StorageOp): void }
export type ServerHost = {
  players(): readonly number[];                                 // connected entities, join order
  position(entity: number): { x: number; y: number; z: number } | null; // metres (y = the feet's height); null if gone
  send(entity: number, bytes: Uint8Array): void;                // reliable, in order
  tick(): number;
  log(line: string): void;
  sign?(text: string): string;                                  // HMAC of `text` with the server's secret; "" when there is none
  storage?: FeatureStorage;                                     // S4: where persisted state and stores live (none = memory only)
  who?(entity: number): { id: string; nombre: string } | null;  // I1: the guest behind an entity (null for bots)
  puede?(entity: number, accion: string): boolean;              // H1: may this player do this ("construir"…)? none = no. H3 makes it roles
  activo?(sha256: string, ext: string): boolean;                // H9: is there a file /a/<sha256>.<ext> on this server? none = no
  medidas?(sha256: string, ext: string): { ancho: number; alto: number } | null; // U12: a picture's size in pixels; none = null
  visible?(entity: number): readonly number[];                  // J3: who this player's page draws (its last snapshot); none = []
  aventura?(carpeta: string): { fichero: string; texto: string }[]; // J5: the adventure's text files in one folder (AVENTURA_DIR); none = []
  recibo?(d: BienFirmable): string;                             // N10: a good's ownership receipt signed by the world (server/recibos.ts); none = ""
  verificarRecibo?(token: string): ReciboLeido;                 // N10: check any world's receipt (its key is inside); none = refused
  emisor?(): string;                                            // N10: the public key this world signs receipts with; none = ""
};
/** N10 (bienes digitales): what a feature asks the world to sign — the good (id = 24 hex, unique per world), its owner
 * (the guest id), the quest it came from and the instant (ISO 8601 UTC). The world adds v, tipo, mundo and emisor. */
export type BienFirmable = { id: string; objeto: { id: string; nombre: string; descripcion: string; modelo: string; licencia: string }; dueno: string; mision: string; instante: string };
/** A receipt read: valid (its payload, its sha256 and whether THIS world signed it) or why not. */
export type ReciboLeido = { ok: true; recibo: BienFirmable & { v: 1; tipo: "bien"; mundo: string; emisor: string }; huella: string; nuestro: boolean } | { ok: false; motivo: string };
/** Who gets an event: everyone, one player, the players near a player or a point, or (J3) "server": no page, only
 * the server-side listeners of other features (`api.listen`), e.g. a command typed in the chat. */
export type Scope = "all" | "server" | { to: number } | { near: number | { x: number; z: number }; radius?: number };
export const LISTEN_DEPTH = 4;            // J3: events that trigger events that trigger events… stop here
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
  /** S4: server-only data that survives restarts (declare `store` first). JSON values up to STORE_VALUE_MAX bytes, STORE_KEYS_MAX keys. Never sent to pages. */
  store: { get(key: string): unknown; set(key: string, value: unknown): boolean; delete(key: string): void; keys(): string[] };
  /** An HTTP route on the instance's own port (e.g. the URL a QR opens). Paths like "/e/:token". */
  route(method: "GET" | "POST", path: string, fn: (req: HttpRequest) => HttpReply): void;
  onJoin(fn: (entity: number) => void): void;
  /** I1: the page showed who it is (a guest id that stays the same across visits). Key per-person data by `who.id`, never by entity. */
  onIdentify(fn: (entity: number, who: { id: string; nombre: string }) => void): void;
  /** I1: the guest behind an entity, or null (bots, or before onIdentify). */
  who(entity: number): { id: string; nombre: string } | null;
  onLeave(fn: (entity: number) => void): void;
  onTick(fn: (tick: number) => void): void;
  players(): readonly number[];
  /** Where a player stands, in metres: x, z and `y` (the feet's height; 0 on the flat ground). null if gone. */
  position(entity: number): { x: number; y: number; z: number } | null;
  tick(): number;
  log(line: string): void;
  /** 24 hex characters: HMAC-SHA256 of `text` with the server's secret (env MOTOR_SECRET, 16+ characters). "" when the server has no secret: refuse whatever needed it. Use it to sign URLs/tokens; features cannot import node:crypto. */
  sign(text: string): string;
  /** H1: may this player do this? Actions today: "construir" (place, move, delete things in the world). The server
   * decides with the world's roles (H3; @todos building or not is stored in the world: MOTOR_CONSTRUIR only seeds a
   * new one, then /construir). Ask it on every intent that changes the world; never trust the page. */
  puede(entity: number, accion: string): boolean;
  /** H9: is there a file /a/<sha256>.<ext> on this server — the house library or something a builder uploaded?
   * (ext defaults to "glb"). Read-only; ask it before putting a model in the world. */
  activo(sha256: string, ext?: string): boolean;
  /** U12: how many pixels a picture on this server measures (png, jpg, webp: read from the file's header, never from a
   * page), or null (not here, not a picture). A phone photo turned by its EXIF orientation is measured standing. */
  medidas(sha256: string, ext: string): { ancho: number; alto: number } | null;
  /** J3: hear an event of another feature (or your own) on the server, e.g. ("chat", "orden") for commands or
   * ("chat", "dicho") for near chat (an AI inhabitant, P5). Runs inside that emit; return true if you handled it.
   * Text inside is untrusted: never put it in an agent's instructions (STD-050). */
  listen(feature: string, event: string, fn: (msg: Msg) => boolean | void): void;
  /** J3: the entities this player's page draws now (its last snapshot: the area of interest, at most K). */
  visible(entity: number): readonly number[];
  /** J5: the text files an adventure ships in one of its folders (`<AVENTURA_DIR>/<carpeta>/`, sorted by name; the
   * server's own folder, never the page's). Read-only and unvalidated: check them against your format. [] without one. */
  aventura(carpeta: string): { fichero: string; texto: string }[];
  /** J4: is this player within reach of this thing of yours (its card's interact radius plus INTERACT_SLACK_M, and, when
   * the thing's state has a `y`, within ALCANCE_ALTURA_M of it in height)? Ask it on every intent a thing receives: the
   * page shows the prompt, the server decides. */
  within(entity: number, key: string): boolean;
  /** N10: the world's signed proof that a good belongs to `d.dueno` ("nb1.…", Ed25519, packages/server/src/recibos.ts),
   * or "" when the world has no secret (MOTOR_SECRET): then give no good. No chain, no wallet: a receipt anyone checks. */
  recibo(d: BienFirmable): string;
  /** N10: check a receipt from this world or any other (the signer's public key is inside; `nuestro` = signed here). */
  verificarRecibo(token: string): ReciboLeido;
  /** N10: the public key this world signs its receipts with («ed25519:<43>»), "" when it signs none. */
  emisor(): string;
};
export type ServerPart = { feature: Feature; side: "server"; setup: (api: ServerApi) => void };
export const serverPart = (feature: Feature, setup: (api: ServerApi) => void): ServerPart => ({ feature, side: "server", setup });

type Route = { method: string; parts: string[]; feature: string; fn: (req: HttpRequest) => HttpReply };
type Entry2 = { value: Msg; at?: { x: number; z: number }; bytes?: Uint8Array }; // bytes: the STATE message, encoded once (H1: a zone's list goes to everyone who enters)

/** J9: the things one feature has put in the world, in square cells as wide as its radius, so "what is near
 * this player" looks at 9 cells instead of every thing. */
export class NearIndex {
  readonly radius: number;
  private readonly cells = new Map<string, Set<string>>();
  private readonly cellOf = new Map<string, string>();
  constructor(radius: number) { this.radius = radius; }
  get size(): number { return this.cellOf.size; }
  private cell(cx: number, cz: number): string { return `${cx},${cz}`; }
  put(key: string, at: { x: number; z: number }): void {
    this.remove(key);
    const c = this.cell(Math.floor(at.x / this.radius), Math.floor(at.z / this.radius));
    let s = this.cells.get(c);
    if (!s) this.cells.set(c, (s = new Set()));
    s.add(key); this.cellOf.set(key, c);
  }
  remove(key: string): void {
    const c = this.cellOf.get(key);
    if (c === undefined) return;
    const s = this.cells.get(c)!; s.delete(key); if (s.size === 0) this.cells.delete(c);
    this.cellOf.delete(key);
  }
  /** Keys in the 3×3 cells around a point: everything within `radius` is among them. */
  around(x: number, z: number): string[] {
    const cx = Math.floor(x / this.radius), cz = Math.floor(z / this.radius), out: string[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const s = this.cells.get(this.cell(cx + dx, cz + dz)); if (s) for (const k of s) out.push(k); }
    return out;
  }
}

export class ServerRuntime {
  readonly catalog: Catalog;
  readonly active: boolean;
  readonly stats = { received: 0, dropped: 0, bad: 0, events: 0, errors: 0 };
  private readonly host: ServerHost;
  private readonly entries: Entry[];
  private readonly catalogBytes: Uint8Array;
  private readonly handlers = new Map<number, { feature: string; fn: (from: number, msg: Msg) => void }>();
  private readonly hooks: { join: [string, (e: number) => void][]; leave: [string, (e: number) => void][]; tick: [string, (t: number) => void][]; identify: [string, (e: number, w: { id: string; nombre: string }) => void][] } = { join: [], leave: [], tick: [], identify: [] };
  private readonly routeList: Route[] = [];
  private readonly shared = new Map<string, Map<string, Entry2>>();
  /** U10: grows on every shared-state change (the instance rebuilds the solid boxes when it moves). */
  stateVersion = 0;
  /** U10: every shared-state entry of every feature, as [key, value] (keys prefixed by the feature id). */
  *allState(): Generator<[string, Msg]> { for (const [f, t] of this.shared) for (const [k, e] of t) yield [`${f}:${k}`, e.value]; }
  private readonly near = new Map<string, { index: NearIndex; pos: number; fields: Fields; table: Map<string, Entry2> }>(); // J9
  private readonly known = new Map<number, Map<string, Set<string>>>(); // J9: player -> feature -> things it has
  private queue: { from: number; entry: Entry; msg: Msg }[] = [];
  private readonly waiting = new Map<number, number>();
  private readonly buckets = new Map<number, Map<number, { tokens: number; tick: number }>>();
  private readonly failed = new Set<string>();
  private readonly listeners = new Map<string, { feature: string; fn: (msg: Msg) => boolean | void }[]>(); // J3: "feature.event" -> server-side listeners
  private depth = 0;

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
    if (scope === "server") return [];
    if (typeof scope === "object" && "to" in scope) return this.host.position(scope.to) ? [scope.to] : []; // in the world = connected; no list scan (J3 sends names one by one)
    const all = this.host.players();
    if (scope === "all") return all.slice();
    const c = typeof scope.near === "number" ? this.host.position(scope.near) : scope.near;
    if (!c) return [];
    const r2 = (scope.radius ?? NEAR_RADIUS_M) ** 2;
    return all.filter((e) => { const p = this.host.position(e); return !!p && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 <= r2; });
  }

  private api(f: Feature): ServerApi {
    const id = f.id, log = (l: string) => this.host.log(`[${id}] ${l}`);
    const pos = this.catalog.features.findIndex((c) => c.id === id);
    const stateSchema = f.state ? defineSchema(`${id}.state`, f.version, f.state.fields) : null;
    const table = new Map<string, Entry2>();
    this.shared.set(id, table);
    const index = f.state ? new NearIndex(f.state.radius ?? STATE_RADIUS_M) : null;
    if (index && f.state) this.near.set(id, { index, pos, fields: f.state.fields, table });
    // S4: bring back what was saved. State values are checked against today's schema: a value that no longer
    // fits (the feature changed shape) is dropped and counted, never sent to anyone.
    const persist = !!f.state?.persist, keeps = persist || !!f.store, storage = this.host.storage;
    const saved = keeps && storage ? storage.load(id) : null;
    if (keeps && !storage) log("sin carpeta de datos: lo que guarda esta función se pierde al reiniciar (DATOS_DIR)");
    const box = new Map<string, unknown>(f.store && saved ? saved.store : []);
    if (saved && persist && stateSchema) {
      let dropped = 0;
      for (const [k, s] of saved.state) { const v = validate(stateSchema, s.value); if (v.ok) { table.set(k, s.at ? { value: v.value, at: s.at } : { value: v.value }); if (s.at) index?.put(k, s.at); } else dropped++; }
      if (dropped) log(`${dropped} claves guardadas ya no cumplen el esquema (versión ${saved.version} → ${f.version}): no se cargan`);
    }
    if (saved) log(`recupero lo guardado: ${table.size} claves de estado, ${box.size} del almacén`);
    const save = (op: StorageOp) => storage?.record(id, f.version, op);
    const keyOk = (key: string, what: string) => { if (key.length === 0 || new TextEncoder().encode(key).length > STATE_KEY_BYTES) { log(`${what}: la clave debe tener 1-${STATE_KEY_BYTES} bytes`); return false; } return true; };
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
        const to = this.recipients(scope);
        if (to.length) { const bytes = encodeFeatureMessage(e.index, e.fields, v.value); for (const p of to) this.host.send(p, bytes); }
        this.stats.events++;
        return to.length + this.tell(`${id}.${event}`, v.value);
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
          const before = table.get(key);
          const bytes = encodeState(pos, key, f.state.fields, v.value);
          table.set(key, { value: v.value, at: opts?.at, bytes }); this.stateVersion++;
          if (persist) save(opts?.at ? { op: "s", key, value: v.value, at: opts.at } : { op: "s", key, value: v.value });
          if (opts?.at && index) { // J9: only who is near
            if (before && !before.at) for (const pl of this.host.players()) this.knows(pl, id).add(key); // it was global: everyone had it, the far ones must forget it
            index.put(key, opts.at); this.pushThing(id, key, bytes); return true;
          }
          if (before?.at) { index?.remove(key); for (const m of this.known.values()) m.get(id)?.delete(key); }
          for (const p of this.host.players()) this.host.send(p, bytes);
          return true;
        },
        delete: (key) => {
          const before = table.get(key);
          if (!table.delete(key)) return;
          this.stateVersion++;
          if (persist) save({ op: "sd", key });
          const bytes = encodeState(pos, key, null);
          if (before?.at) { // J9: only those who had it
            index?.remove(key);
            for (const [p, m] of this.known) if (m.get(id)?.delete(key)) this.host.send(p, bytes);
            return;
          }
          for (const p of this.host.players()) this.host.send(p, bytes);
        },
      },
      store: {
        get: (key) => box.get(key),
        keys: () => [...box.keys()],
        set: (key, value) => {
          if (!f.store) { log("store.set: declara store: { describe } en la función para guardar datos"); return false; }
          if (!keyOk(key, "store.set")) return false;
          let json: string | undefined;
          try { json = JSON.stringify(value); } catch { json = undefined; }
          if (json === undefined || new TextEncoder().encode(json).length > STORE_VALUE_MAX) { log(`store.set('${key}'): el valor debe ser JSON de como mucho ${STORE_VALUE_MAX} bytes`); return false; }
          if (!box.has(key) && box.size >= STORE_KEYS_MAX) { log(`store.set('${key}'): el almacén ya tiene ${STORE_KEYS_MAX} claves; borra alguna`); return false; }
          const clean = JSON.parse(json);
          box.set(key, clean); save({ op: "k", key, value: clean });
          return true;
        },
        delete: (key) => { if (box.delete(key)) save({ op: "kd", key }); },
      },
      route: (method, path, fn) => {
        const clean = "/" + path.split("/").filter(Boolean).join("/");
        if (RESERVED_PATHS.includes(clean) || clean === "/a" || clean.startsWith("/a/")) { log(`route: ${clean} es del motor (/a/ son los ficheros por su sha256)`); return; }
        const parts = clean.split("/").slice(1);
        if (this.routeList.some((r) => r.method === method && r.parts.join("/") === parts.join("/"))) { log(`route: ${method} ${clean} ya existe`); return; }
        this.routeList.push({ method, parts, feature: id, fn });
      },
      onJoin: (fn) => { this.hooks.join.push([id, fn]); },
      onIdentify: (fn) => { this.hooks.identify.push([id, fn]); },
      who: (e) => this.host.who?.(e) ?? null,
      onLeave: (fn) => { this.hooks.leave.push([id, fn]); },
      onTick: (fn) => { this.hooks.tick.push([id, fn]); },
      players: () => this.host.players(),
      position: (e) => this.host.position(e),
      tick: () => this.host.tick(),
      sign: (text) => this.host.sign?.(text) ?? "",
      recibo: (d) => { try { return this.host.recibo?.(d) ?? ""; } catch (e) { log(`recibo: ${String((e as Error)?.message ?? e)}`); return ""; } },
      verificarRecibo: (token) => { try { return this.host.verificarRecibo?.(token) ?? { ok: false, motivo: "este mundo no comprueba recibos" }; } catch { return { ok: false, motivo: "no se pudo comprobar" }; } },
      emisor: () => this.host.emisor?.() ?? "",
      puede: (e, accion) => { try { return this.host.puede?.(e, accion) ?? false; } catch { return false; } },
      activo: (sha256, ext = "glb") => { try { return /^[0-9a-f]{64}$/.test(sha256) && (this.host.activo?.(sha256, ext) ?? false); } catch { return false; } },
      medidas: (sha256, ext) => { try { return /^[0-9a-f]{64}$/.test(sha256) ? this.host.medidas?.(sha256, ext) ?? null : null; } catch { return null; } },
      listen: (feature, event, fn) => {
        if (!this.entries.some((x) => x.feature === feature && x.kind === "event" && x.name === event)) log(`listen('${feature}', '${event}'): este servidor no tiene ese evento (¿falta la función '${feature}'?); no oirás nada`);
        const k = `${feature}.${event}`;
        this.listeners.set(k, [...(this.listeners.get(k) ?? []), { feature: id, fn }]);
      },
      visible: (e) => this.host.visible?.(e) ?? [],
      aventura: (carpeta) => {
        if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(carpeta)) { log(`aventura('${carpeta}'): una carpeta en minúsculas, sin barras`); return []; }
        try { return this.host.aventura?.(carpeta) ?? []; } catch (e) { log(`aventura('${carpeta}'): ${String((e as Error)?.message ?? e)}`); return []; }
      },
      within: (e, key) => {
        const s = table.get(key), me = this.host.position(e), it = f.state?.card?.interact;
        if (!s?.at || !me || !it) return false;
        const r = (typeof it.radius === "number" ? it.radius : Number(s.value[it.radius])) + INTERACT_SLACK_M;
        return (s.at.x - me.x) ** 2 + (s.at.z - me.z) ** 2 <= r * r && alAlcanceEnAltura(me.y, s.value.y);
      },
      log,
    };
  }

  /** J3: run the server-side listeners of one feature's event (in the order they listened). Returns how many said
   * they handled it. A listener that throws is logged once; chains deeper than LISTEN_DEPTH are cut. */
  private tell(key: string, msg: Msg): number {
    const ls = this.listeners.get(key);
    if (!ls) return 0;
    if (this.depth >= LISTEN_DEPTH) { this.host.log(`[funciones] '${key}': más de ${LISTEN_DEPTH} eventos encadenados; corto aquí`); return 0; }
    const copy = Object.freeze({ ...msg });
    let handled = 0;
    this.depth++;
    try { for (const l of ls) { try { if (l.fn(copy) === true) handled++; } catch (e) { this.fail(l.feature, `en listen('${key}')`, e); } } }
    finally { this.depth--; }
    return handled;
  }

  /** Someone joined: send what the server runs and the current shared state, then tell the features. */
  join(entity: number): void {
    if (!this.active) return;
    this.host.send(entity, this.catalogBytes);
    const me = this.host.position(entity);
    this.catalog.features.forEach((cf, pos) => {
      const table = this.shared.get(cf.id);
      if (!table || !cf.state) return;
      for (const [key, s] of table) if (!s.at) this.host.send(entity, (s.bytes ??= encodeState(pos, key, cf.state.fields, s.value))); // global state: everyone (encoded once)
      const n = this.near.get(cf.id);
      if (n && me) { // J9: things in the world, only the near ones
        const r2 = n.index.radius ** 2, mine = this.knows(entity, cf.id);
        for (const key of n.index.around(me.x, me.z)) {
          const s = table.get(key);
          if (s?.at && (s.at.x - me.x) ** 2 + (s.at.z - me.z) ** 2 <= r2) { this.host.send(entity, encodeState(pos, key, cf.state.fields, s.value)); mine.add(key); }
        }
      }
    });
    for (const [id, fn] of this.hooks.join) { try { fn(entity); } catch (e) { this.fail(id, "en onJoin", e); } }
  }

  /** I1: the instance bound a guest identity to this entity. */
  identify(entity: number): void {
    const w = this.host.who?.(entity);
    if (!this.active || !w) return;
    for (const [id, fn] of this.hooks.identify) { try { fn(entity, w); } catch (e) { this.fail(id, "en onIdentify", e); } }
  }

  leave(entity: number): void {
    for (const [id, fn] of this.hooks.leave) { try { fn(entity); } catch (e) { this.fail(id, "en onLeave", e); } }
    this.buckets.delete(entity); this.waiting.delete(entity); this.known.delete(entity);
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
    this.refreshNear(t % STATE_REFRESH_TICKS); // a tenth of the players each tick: each one every 0.5 s, no spike
  }

  private knows(player: number, feature: string): Set<string> {
    let m = this.known.get(player);
    if (!m) this.known.set(player, (m = new Map()));
    let s = m.get(feature);
    if (!s) m.set(feature, (s = new Set()));
    return s;
  }

  /** J9: a thing was set at a place: send it to who is near (or already had it, up to the forget distance); tell who moved out of reach to forget it. */
  private pushThing(feature: string, key: string, bytes: Uint8Array): void {
    const n = this.near.get(feature)!, s = n.table.get(key)!, r2 = n.index.radius ** 2, f2 = (n.index.radius * FORGET_FACTOR) ** 2;
    for (const p of this.host.players()) {
      const me = this.host.position(p);
      if (!me || !s.at) continue;
      const d2 = (s.at.x - me.x) ** 2 + (s.at.z - me.z) ** 2, mine = this.knows(p, feature);
      if (d2 <= r2 || (mine.has(key) && d2 <= f2)) { this.host.send(p, bytes); mine.add(key); }
      else if (mine.delete(key)) this.host.send(p, encodeState(n.pos, key, null));
    }
  }

  /** J9: people moved; each gets the things that came near and forgets the far ones. `slice` = only the players
   * whose position in the list is slice modulo STATE_REFRESH_TICKS (the instance passes tick % 10); none = all. */
  refreshNear(slice?: number): number {
    let sent = 0;
    for (const [id, n] of this.near) {
      if (n.index.size === 0) continue;
      const r2 = n.index.radius ** 2, f2 = (n.index.radius * FORGET_FACTOR) ** 2;
      const players = this.host.players();
      for (let i = 0; i < players.length; i++) {
        if (slice !== undefined && i % STATE_REFRESH_TICKS !== slice) continue;
        const p = players[i], me = this.host.position(p);
        if (!me) continue;
        const mine = this.knows(p, id);
        for (const key of mine) {
          const s = n.table.get(key);
          if (!s?.at) { mine.delete(key); continue; }
          if ((s.at.x - me.x) ** 2 + (s.at.z - me.z) ** 2 > f2) { mine.delete(key); this.host.send(p, encodeState(n.pos, key, null)); sent++; }
        }
        for (const key of n.index.around(me.x, me.z)) {
          if (mine.has(key)) continue;
          const s = n.table.get(key)!;
          if (s.at && (s.at.x - me.x) ** 2 + (s.at.z - me.z) ** 2 <= r2) { mine.add(key); this.host.send(p, encodeState(n.pos, key, n.fields, s.value)); sent++; }
        }
      }
    }
    return sent;
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
  /** N2: the current value of a setting this feature declared (`<feature>.<id>`, e.g. "despertar.columna"); undefined
   * when the page has no settings menu. Read it when you need it (pull); the person may change it at any time. */
  ajuste?(id: string): string | number | boolean | undefined;
  /** H1: put a thing in the world (a model by its sha256, placed in metres and degrees), move it, or take it away
   * (`null`). The page decides where the file comes from (today `/a/<sha256>.glb` on the instance's server). */
  place?(key: string, o: PlacedObject | null): void;
  /** H1: where this player is now (metres), so a feature can put things in front of them. */
  here?(): { x: number; y: number; z: number } | null;
  /** J3: the name over an avatar (null takes it away). The page decides from how far it is drawn. */
  nameTag?(entity: number, text: string | null): void;
  /** J3: a speech bubble over an avatar for `ms` (several lines; the latest replaces the one before). */
  bubble?(entity: number, text: string, ms: number): void;
  /** J5: a name that stays over a thing (a person you can talk to), facing whoever looks; `null` takes it away. U14 (4),
   * optional: `sub` = a second, smaller line under the name (a person's trade); `mark` = «!» (something for you now) or
   * «✓» (done) above it. The page redraws a label only when its text or mark changes. */
  tag?(key: string, t: { text: string; x: number; y: number; z: number; sub?: string; mark?: "!" | "✓" | "" } | null): void;
  /** H4: the zone's environment (sky, sun, fog, wind, ground, tone) by field name — features/entorno; render/entorno.ts reads it. */
  entorno?(valores: Msg): void;
  /** H4/H8: an element of the world (water, fire, smoke, dust) by key, or `null` to take it away — features/elementos. */
  elemento?(key: string, valores: Msg | null): void;
};
/** H1: a thing in the world as the page draws it. Rotation in degrees, applied yaw (ry), then pitch (rx), then roll (rz). */
export type PlacedObject = { model: string; x: number; y: number; z: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number; animate: boolean;
  /** U10 (optional): what it is (modelo = a .glb; imagen, video: a plane; sonido: a sphere of sound, radius = sx), the file's
   * extension, hidden while playing (a sphere), and volume 0-1. Without them: a .glb model. */
  kind?: "modelo" | "imagen" | "video" | "sonido"; ext?: string; hidden?: boolean; volume?: number;
  /** U11 (optional): who hears it (burbuja: inside the bubble; zona, todos: everyone, at the same volume) and a video's bubble radius (m). */
  reach?: "burbuja" | "zona" | "todos"; radius?: number };
export const NO_VIEW: ViewHooks = { label() {}, bounce() {} };
/** An event as a person hears and reads it (V1). `at` in metres; `who` = the entity it is about. */
export type Announcement = { feature: string; event: string; text: string; sound: Sound; importance: Importance; at?: { x: number; z: number }; who?: number };
/** A thing in the world as a screen reader or an agent reads it (V1). */
export type CardView = { feature: string; key: string; role: Role; name: string; description?: string; importance: Importance; actions: string[]; at?: { x: number; z: number } };
/** J4: a thing in reach as the page offers it: «E: <prompt>»; `use(feature, key)` sends its intent. */
export type Reachable = { feature: string; key: string; intent: string; prompt: string; name: string; distance: number };
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
  /** U10: grows on every shared-state change this page hears (the session rebuilds the solid boxes when it moves). */
  stateVersion = 0;
  /** U10: every shared-state entry of every feature, as [key, value] (keys prefixed by the feature id). */
  *allState(): Generator<[string, Msg]> { for (const [f, t] of this.mirror) for (const [k, v] of t) yield [`${f}:${k}`, v]; }
  private readonly acts: Action[] = [];
  private byIndex: CatalogEntry[] = [];
  private readonly taps: ((feature: string, event: string, msg: Msg) => void)[] = [];

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

  /** P4: hear every event of every feature the server runs, without a client part (agents read the catalog, not code). */
  tap(fn: (feature: string, event: string, msg: Msg) => void): void { this.taps.push(fn); }

  /** V1: every thing the features put in the world, as a screen reader or an agent reads it. */
  cards(): CardView[] {
    const out: CardView[] = [];
    for (const f of this.catalog?.features ?? []) {
      const c = f.state?.card;
      if (!c) continue;
      for (const [key, v] of this.mirror.get(f.id) ?? []) {
        const vals = { key, ...v };
        const name = fillTemplate(c.name, vals).trim();
        if (!name) continue; // H1: no name = decorative (like alt=""): not listed for screen readers nor agents
        const card: CardView = { feature: f.id, key, role: c.role, name, importance: c.importance ?? 1, actions: c.actions ?? [] };
        if (c.description) card.description = fillTemplate(c.description, vals);
        if (c.at) card.at = { x: Number(v[c.at[0]]), z: Number(v[c.at[1]]) };
        out.push(card);
      }
    }
    return out;
  }

  /** The shared state of one feature as this page knows it (for the page, checks and agents). */
  stateOf(feature: string): ReadonlyMap<string, Msg> { return this.mirror.get(feature) ?? new Map(); }

  /** J4: the things a person at (x, z) can use right now (each within its interact radius), nearest first. With `y` (the
   * feet's height, metres), a thing whose state has a `y` counts only within ALCANCE_ALTURA_M of it (a floor above is out). */
  reachable(x: number, z: number, y?: number): Reachable[] {
    const out: Reachable[] = [];
    for (const f of this.catalog?.features ?? []) {
      const c = f.state?.card, it = c?.interact;
      if (!c || !it || !c.at) continue;
      for (const [key, v] of this.mirror.get(f.id) ?? []) {
        const r = typeof it.radius === "number" ? it.radius : Number(v[it.radius]);
        const d = Math.hypot(Number(v[c.at[0]]) - x, Number(v[c.at[1]]) - z);
        if (!(d <= r) || (y !== undefined && !alAlcanceEnAltura(y, v.y))) continue;
        const vals = { key, ...v };
        out.push({ feature: f.id, key, intent: it.intent, prompt: fillTemplate(it.prompt, vals), name: fillTemplate(c.name, vals).trim(), distance: d });
      }
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  /** J4: use a thing (talk, take, open): sends the intent its card declares, with its key. The server checks the reach. */
  use(feature: string, key: string): { ok: true } | { ok: false; why: string } {
    const it = this.catalog?.features.find((f) => f.id === feature)?.state?.card?.interact;
    if (!it) { this.stats.refused++; return { ok: false, why: `'${feature}' no tiene cosas que se usen de cerca` }; }
    return this.send(feature, it.intent, { [it.key]: key });
  }

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
      for (const fn of this.taps) { try { fn(e.feature, e.name, msg); } catch { this.stats.errors++; } }
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
      this.stateVersion++;
      for (const fn of this.changes.get(f.id) ?? []) { try { fn(s.key, s.value ?? undefined); } catch { this.stats.errors++; } }
      return true;
    }
    return false;
  }
}

/** Escape text for an HTML reply (features that answer a QR with a small page). */
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
