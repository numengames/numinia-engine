// roles (H3): a world's roles are numinia.com's, not roles of the engine's own. An organisation keeps them the way a
// Discord server does (numinia-archive ADR-071; rules STD-051, register STD-052; the code that decides there is
// numinia-web packages/domain/src/resolvers/organization-access.ts, `accessOf`): an ordered list, a base role «@todos»
// at position 0 that every member holds, the higher a role the more it may manage, «administrator» = every
// permission, owners above every role. This file is those rules inside the engine, pure; roles-mundo.ts keeps them
// for one world and answers the chat orders. Permission ids are STD-052's letter by letter, so a numinia.com pass
// (next cut, H3b) brings them as they are.
// The engine's one addition: a VISITOR (a guest with no role here, or an AI inhabitant) is treated as «@todos»
// while the world is open, and does not get in when it is for members only (`enter-worlds`).
import type { Issue, Result } from "../../core/src/index.ts";

/** The seventeen permissions of STD-052 («Permissions»), in its order. */
export const PERMISOS = [
  "administrator", "manage-organization", "view-organization-log", "manage-roles", "invite-members", "remove-members",
  "ban-members", "mute-members", "create-rituals", "manage-rituals", "enter-worlds", "build-in-worlds",
  "start-stop-worlds", "create-worlds", "view-balance", "top-up", "manage-balance",
] as const;
export type Permiso = (typeof PERMISOS)[number];

/** What the engine does with the permissions it understands; the others only mean something on numinia.com. */
export const ACCION_PERMISO = {
  entrar: "enter-worlds",          // get in when the world is for members only
  construir: "build-in-worlds",    // place, move, delete things; upload models
  silenciar: "mute-members",       // silence someone below you in the chat for a while
  echar: "remove-members",         // take someone below you out; they may come back later
  vetar: "ban-members",            // take someone below you out for good, saying why
  roles: "manage-roles",           // give and take roles below your own
  ajustar: "manage-organization",  // the world's settings (today: for members only or open)
  dirigir: "manage-rituals",       // N6: direct the adventure live (scenes, narration, summons): a ritual is a gathering with a convener (STD-026)
  escenario: "manage-rituals",     // put someone on stage / take them off (M17: their voice reaches everyone)
} as const satisfies Record<string, Permiso>;
export type Accion = keyof typeof ACCION_PERMISO;

/** How each action reads in Spanish (the /roles answer). */
export const ACCION_TEXTO: Record<Accion, string> = {
  entrar: "entrar si es solo para miembros", construir: "construir", silenciar: "silenciar", echar: "echar",
  vetar: "vetar", roles: "dar y quitar roles", ajustar: "cambiar los ajustes del mundo", dirigir: "dirigir (escenas, narrar, convocar)", escenario: "subir y bajar a alguien del escenario",
};

export const BASE = 0;            // the base role's position (STD-052 BASE_ROLE_POSITION)
export const ROLES_MAX = 250;     // roles besides the base role (STD-052 MAX_ORGANIZATION_ROLES)
export const NOMBRE_ROL_MAX = 100;

export type Rol = { id: string; nombre: string; color: string | null; posicion: number; destacado: boolean; permisos: Permiso[] };
/** What someone may do here: permissions, height (their highest role; owners above all) and whether they own it. */
export type Acceso = { permisos: ReadonlySet<Permiso>; altura: number; dueno: boolean };
/** Someone's place in the world: the roles given (besides the base one) and whether they are an owner. */
export type Miembro = { roles: readonly string[]; dueno?: boolean };

export const esBase = (r: Rol): boolean => r.posicion === BASE;
const TODOS: ReadonlySet<Permiso> = new Set(PERMISOS);

/** The roles a world is born with: STD-052's «Community» template (Administración, Moderación, @todos), in Spanish.
 * `construir` adds «build-in-worlds» to @todos (the installer's --construir todos). */
export function plantilla(construir: boolean): Rol[] {
  return [
    { id: "administracion", nombre: "Administración", color: null, posicion: 2, destacado: true, permisos: ["administrator"] },
    { id: "moderacion", nombre: "Moderación", color: null, posicion: 1, destacado: true, permisos: ["remove-members", "ban-members", "mute-members", "manage-rituals"] },
    { id: "todos", nombre: "@todos", color: null, posicion: BASE, destacado: false, permisos: construir ? ["enter-worlds", "top-up", "build-in-worlds"] : ["enter-worlds", "top-up"] },
  ];
}

/** What a member (or a visitor: null) may do. Owners hold everything (STD-051 ORG-002); `administrator` = every
 * permission; the height is the highest role held (the base role counts, so a visitor stands at 0). */
export function acceso(roles: readonly Rol[], m: Miembro | null): Acceso {
  if (m?.dueno) return { permisos: TODOS, altura: Number.POSITIVE_INFINITY, dueno: true };
  const held = new Set(m?.roles ?? []);
  const own = roles.filter((r) => esBase(r) || held.has(r.id));
  const granted = new Set<Permiso>(own.flatMap((r) => r.permisos));
  return { permisos: granted.has("administrator") ? TODOS : granted, altura: Math.max(BASE, ...own.map((r) => r.posicion)), dueno: false };
}

export const tiene = (a: Acceso, accion: Accion): boolean => a.permisos.has(ACCION_PERMISO[accion]);

/** May `actor` act on `objetivo` (silence, take out, ban)? Only on someone strictly below, never on an owner (STD-051). */
export const porDebajo = (actor: Acceso, objetivo: Acceso): boolean => !objetivo.dueno && actor.altura > objetivo.altura;

/** May `actor` give or take `rol` to `objetivo`? null = yes; otherwise why not, in words (STD-051 ORG-003/004,
 * numinia-web `canAssignRole`). The caller has already refused acting on oneself. */
export function noPuedeDar(actor: Acceso, objetivo: Acceso, rol: Rol): string | null {
  if (!tiene(actor, "roles")) return "No tienes permiso para dar o quitar roles.";
  if (esBase(rol)) return "@todos lo tiene todo el mundo: no se da ni se quita.";
  if (objetivo.dueno) return "A un dueño no se le dan ni quitan roles: está por encima de todos.";
  if (rol.posicion >= actor.altura) return `«${rol.nombre}» está a tu altura o por encima: solo puedes dar roles por debajo del tuyo.`;
  if (objetivo.altura >= actor.altura) return "Esa persona está a tu altura o por encima.";
  return null;
}

/** A role by its name or id, without caring about case or accents. */
export function rolPorNombre(roles: readonly Rol[], texto: string): Rol | null {
  const k = plano(texto);
  return roles.find((r) => plano(r.nombre) === k || r.id === k || plano(r.nombre).replace(/^@/, "") === k) ?? null;
}
export const plano = (s: string): string => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const COLOR = /^#[0-9a-f]{6}$/;

/** A list of roles as stored or received. Permissions the engine does not know are dropped (numinia.com may add
 * some); everything else wrong is an issue with its path. Exactly one base role at 0, positions unique. */
export function validarRoles(v: unknown): Result<Rol[]> {
  const issues: Issue[] = [];
  if (!Array.isArray(v)) return { ok: false, issues: [{ path: "roles", message: "una lista de roles" }] };
  if (v.length > ROLES_MAX + 1) issues.push({ path: "roles", message: `como mucho ${ROLES_MAX} roles además de @todos` });
  const out: Rol[] = [];
  v.forEach((r: Record<string, unknown> | null, i) => {
    const p = `roles[${i}]`;
    if (!r || typeof r !== "object") { issues.push({ path: p, message: "un objeto con id, nombre, color, posicion, destacado, permisos" }); return; }
    if (typeof r.id !== "string" || !ID.test(r.id)) issues.push({ path: `${p}.id`, message: "minúsculas, cifras y guiones, 1-32" });
    if (typeof r.nombre !== "string" || !r.nombre.trim() || r.nombre.length > NOMBRE_ROL_MAX) issues.push({ path: `${p}.nombre`, message: `de 1 a ${NOMBRE_ROL_MAX} caracteres` });
    if (!(r.color === null || (typeof r.color === "string" && COLOR.test(r.color)))) issues.push({ path: `${p}.color`, message: "null o #rrggbb en minúsculas" });
    if (!(Number.isInteger(r.posicion) && (r.posicion as number) >= 0)) issues.push({ path: `${p}.posicion`, message: "un entero >= 0 (0 = @todos)" });
    if (typeof r.destacado !== "boolean") issues.push({ path: `${p}.destacado`, message: "true o false" });
    if (!Array.isArray(r.permisos)) issues.push({ path: `${p}.permisos`, message: "una lista de permisos de STD-052" });
    out.push({ id: String(r.id), nombre: String(r.nombre), color: (r.color as string | null) ?? null, posicion: Number(r.posicion), destacado: r.destacado === true,
      permisos: Array.isArray(r.permisos) ? [...new Set(r.permisos.filter((x): x is Permiso => (PERMISOS as readonly unknown[]).includes(x)))] : [] });
  });
  if (out.filter(esBase).length !== 1) issues.push({ path: "roles", message: "exactamente un rol en la posición 0 (@todos)" });
  if (new Set(out.map((r) => r.posicion)).size !== out.length) issues.push({ path: "roles", message: "cada rol en su propia posición" });
  if (new Set(out.map((r) => r.id)).size !== out.length) issues.push({ path: "roles", message: "cada rol con su propio id" });
  return issues.length ? { ok: false, issues } : { ok: true, value: out.sort((a, b) => b.posicion - a.posicion) };
}
