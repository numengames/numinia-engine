// chat — server part (J3). The server decides and limits; pages only ask and show.
// - Near chat: whoever is within 20 m of the speaker (the speaker too) gets `dicho`; features hear it with
//   api.listen("chat", "dicho") (the AI inhabitant, P5).
// - Zone channel: the zone is this instance until M16 brings zones. Limited per person AND for the whole zone, so
//   what each page receives is bounded (never O(N²)); the last 50 reach whoever enters (`historial`).
// - `/…` is never published: the features hear `orden` (scope "server"); /ayuda is answered here.
// - Names over heads: each page gets the names of who it draws (api.visible = its area of interest) within 24 m,
//   at most 64 at once, and is told to forget them past 30 m or when they leave (an entity number is reused).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg } from "../../packages/feature/src/index.ts";
import { chat, CERCA_M, NOMBRES_M, NOMBRES_MAX, NOMBRE_MAX, HISTORIAL_MAX, RITMO_ZONA_TODOS, AVISO_MAX } from "./feature.ts";
import { limpiar, cortar, Cubo } from "./texto.ts";

export const NOMBRES_CADA_TICKS = 10;   // each page's names are reviewed every 0.5 s (a tenth of the players per tick)
export const NOMBRES_POR_PASO = 8;      // new names per page and pass: the nearest first (a crowd's names arrive over a few passes)
export const OLVIDO = 1.25;             // a name is forgotten past 24 × 1.25 = 30 m (no flicker at the edge)
export const ROBOT_TRAS_TICKS = 20;     // someone without identity after 1 s is a robot (headless bots); people identify at once
export const AYUDA = "Escribe y pulsa Enter: te leen quienes están a menos de 20 m. «Cerca» cambia a «Zona»: toda la zona, uno cada 5 s. Órdenes: /ayuda, /roles (qué puedes hacer aquí), /ir <nombre> (ir junto a alguien), /bloquear <nombre> (no leerle ni oírle). Lo que empieza por / no lo lee nadie más.";
const TICKS_POR_SEGUNDO = 20; // the sim's TICK_HZ (features import only core, schema, feature)

export default serverPart(chat, (api) => {
  const historia: Msg[] = [];
  const zona = new Cubo(RITMO_ZONA_TODOS);
  const llegada = new Map<number, number>();         // entity -> tick it joined
  const conocidos = new Map<number, Set<number>>();  // player -> entities whose name its page holds
  const callados = new Map<number, number>();        // H3: entity -> tick until which it is silenced (the roles' «silencio»)
  const bloqueados = new Map<number, Set<number>>(); // F1: listener entity -> speakers it does not read (the roles' «bloqueo»)
  const nombresPropios = new Map<number, string>();  // H3c: entity -> name chosen with /nombre (roles-mundo.ts), overrides the identity's
  const r2 = NOMBRES_M ** 2, olvido2 = (NOMBRES_M * OLVIDO) ** 2;

  /** The name people see: a chosen one (H3c /nombre) first, else the identity's (I1); a robot's after a second
   * without one; null = not yet. */
  const nombreDe = (e: number): string | null => {
    const propio = nombresPropios.get(e);
    if (propio) return propio;
    const w = api.who(e);
    if (w) return limpiar(w.nombre, NOMBRE_MAX) || `Persona ${e}`;
    const t = llegada.get(e);
    return t !== undefined && api.tick() - t >= ROBOT_TRAS_TICKS ? `Robot ${e}` : null;
  };
  const avisar = (to: number, texto: string) => api.emit("aviso", { texto: cortar(texto, AVISO_MAX) }, { to });

  const orden = (from: number, texto: string) => {
    const palabra = (texto.split(" ")[0] ?? "").toLowerCase();
    if (palabra === "" || palabra === "ayuda") { avisar(from, AYUDA); return; }
    if (api.emit("orden", { quien: from, texto }, "server") === 0) avisar(from, `Nadie atiende «/${cortar(palabra, 24)}» todavía. Escribe /ayuda para ver las órdenes.`);
  };
  const decir = (canal: "cerca" | "zona") => (from: number, msg: Msg) => {
    const texto = limpiar(String(msg.texto ?? ""));
    if (!texto) return;                                    // empty after cleaning: nothing to say
    if (texto.startsWith("/")) { orden(from, texto.slice(1).trim()); return; }
    const hasta = callados.get(from);
    if (hasta !== undefined && api.tick() < hasta) { avisar(from, `Estás en silencio ${Math.ceil((hasta - api.tick()) / TICKS_POR_SEGUNDO / 60)} min más: nadie te lee.`); return; }
    const m = { quien: from, nombre: nombreDe(from) ?? `Robot ${from}`, texto };
    const except: number[] = []; // F1: whoever blocked the speaker never gets the line (the server decides, the page never sees it)
    for (const [p, s] of bloqueados) if (s.has(from)) except.push(p);
    if (canal === "cerca") { api.emit("dicho", m, { near: from, radius: CERCA_M, except }); return; }
    if (!zona.tomar(api.tick())) { avisar(from, "La zona va muy deprisa: espera unos segundos y vuelve a probar."); return; }
    historia.push(m);
    if (historia.length > HISTORIAL_MAX) historia.shift();
    api.emit("zona", m, { all: true, except }); // the zone = this instance (M16); bounded by RITMO_ZONA_TODOS for the whole zone
  };
  api.on("decir", decir("cerca"));
  api.on("decirZona", decir("zona"));
  // H3: the world's roles (packages/server/src/roles-mundo.ts) answer orders and silence people through these
  api.listen("roles", "aviso", (m) => { avisar(Number(m.quien), String(m.texto ?? "")); return true; });
  api.listen("director", "aviso", (m) => { avisar(Number(m.quien), String(m.texto ?? "")); return true; }); // N6: /escena, /narrar, /convocar
  api.listen("teletransporte", "aviso", (m) => { avisar(Number(m.quien), String(m.texto ?? "")); return true; }); // N16: /ir, /teletransporte, /encontrable
  api.listen("web", "aviso", (m) => { avisar(Number(m.quien), String(m.texto ?? "")); return true; }); // N17: /web
  api.listen("roles", "bloqueo", (m) => {
    const p = Number(m.quien), h = Number(m.a);
    if (Number(m.si)) { let s = bloqueados.get(p); if (!s) bloqueados.set(p, (s = new Set())); s.add(h); }
    else { const s = bloqueados.get(p); if (s) { s.delete(h); if (!s.size) bloqueados.delete(p); } }
    return true;
  });
  api.listen("roles", "silencio", (m) => {
    const e = Number(m.quien), s = Number(m.segundos);
    if (s > 0) callados.set(e, api.tick() + s * TICKS_POR_SEGUNDO); else callados.delete(e);
    return true;
  });
  // H3c: /nombre (roles-mundo.ts) — a chosen name, over heads and in what they say, until they leave or choose another.
  api.listen("roles", "nombreCambiado", (m) => {
    const e = Number(m.quien), n = limpiar(String(m.nombre ?? ""), NOMBRE_MAX);
    if (!n) return true;
    nombresPropios.set(e, n);
    for (const [p, s] of conocidos) if (s.has(e)) api.emit("nombre", { quien: e, nombre: n }, { to: p });
    return true;
  });
  // H3c: /chat borrar (roles-mundo.ts, manage-organization) — the zone's history, empty for whoever enters next.
  api.listen("roles", "borrarHistorial", () => { historia.length = 0; return true; });

  api.onJoin((e) => {
    llegada.set(e, api.tick());
    for (const m of historia) api.emit("historial", m, { to: e });
  });
  // a name appeared or changed (the page showed its identity): whoever holds the old one gets the new one
  api.onIdentify((e) => {
    const n = nombreDe(e);
    if (n) for (const [p, s] of conocidos) if (s.has(e)) api.emit("nombre", { quien: e, nombre: n }, { to: p });
  });
  api.onLeave((e) => {
    llegada.delete(e); conocidos.delete(e); callados.delete(e); bloqueados.delete(e); nombresPropios.delete(e);
    for (const s of bloqueados.values()) s.delete(e);
    for (const [p, s] of conocidos) if (s.delete(e)) api.emit("nombre", { quien: e, nombre: "" }, { to: p });
  });

  // D4: the positions a pass reads, read once per tick hook. A crowd's pages hold the same people: with 1,000 players
  // each tick's tenth asked api.position ~9,000 times (a fresh object each) for ~1,000 entities. Nothing in this hook
  // moves anyone (it only emits names to pages), so within one call a position cannot change; the stamp makes the
  // next call read them again. NaN in px = gone (api.position gave null).
  let vuelta = 0, marca = new Float64Array(0), px = new Float64Array(0), pz = new Float64Array(0);
  const leer = (e: number): boolean => {
    if (e >= marca.length) {
      const n = Math.max(e + 1, marca.length * 2, 64), m = new Float64Array(n), x = new Float64Array(n), z = new Float64Array(n);
      m.set(marca); x.set(px); z.set(pz); marca = m; px = x; pz = z;
    }
    if (marca[e] !== vuelta) {
      marca[e] = vuelta;
      const o = api.position(e);
      if (o) { px[e] = o.x; pz[e] = o.z; } else px[e] = NaN;
    }
    return px[e] === px[e];
  };

  /** One player's names: who its page draws within 24 m gets named (the nearest first, at most NOMBRES_POR_PASO per
   * pass, so a crowd entering at once spreads over a few passes); past 30 m (or gone) is forgotten. */
  const candidatos: { e: number; d2: number }[] = [];
  const repasar = (p: number) => {
    if (!leer(p)) return;
    const mx = px[p], mz = pz[p];
    let mine = conocidos.get(p);
    if (!mine) conocidos.set(p, (mine = new Set()));
    for (const e of mine) {
      if (!leer(e) || (px[e] - mx) ** 2 + (pz[e] - mz) ** 2 > olvido2) { mine.delete(e); api.emit("nombre", { quien: e, nombre: "" }, { to: p }); }
    }
    // D4: a page that already holds NOMBRES_MAX names gets no new one this pass (the loop below would stop before its
    // first); with a crowd that is most passes, so skip looking for candidates (their positions, the sort) altogether
    if (mine.size >= NOMBRES_MAX) return;
    candidatos.length = 0;
    for (const e of api.visible(p)) {
      if (mine.has(e) || e === p) continue;
      const d2 = leer(e) ? (px[e] - mx) ** 2 + (pz[e] - mz) ** 2 : Infinity;
      if (d2 <= r2) candidatos.push({ e, d2 });
    }
    candidatos.sort((a, b) => a.d2 - b.d2 || a.e - b.e);
    let enviados = 0;
    for (const { e } of candidatos) {
      if (mine.size >= NOMBRES_MAX || enviados >= NOMBRES_POR_PASO) break;
      const n = nombreDe(e);
      if (!n) continue;
      api.emit("nombre", { quien: e, nombre: n }, { to: p });
      mine.add(e); enviados++;
    }
  };
  api.onTick((t) => {
    const players = api.players();
    vuelta++;
    for (let i = t % NOMBRES_CADA_TICKS; i < players.length; i += NOMBRES_CADA_TICKS) repasar(players[i]);
  });
});
