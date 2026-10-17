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
export const AYUDA = "Escribe y pulsa Enter: te leen quienes están a menos de 20 m. El botón «Cerca» cambia a «Zona»: toda la zona, como mucho un mensaje cada 5 s. Órdenes: /ayuda (esto), /roles (qué eres aquí y qué puedes hacer). Lo que empieza por / no lo lee nadie más.";
const TICKS_POR_SEGUNDO = 20; // the sim's TICK_HZ (features import only core, schema, feature)

export default serverPart(chat, (api) => {
  const historia: Msg[] = [];
  const zona = new Cubo(RITMO_ZONA_TODOS);
  const llegada = new Map<number, number>();         // entity -> tick it joined
  const conocidos = new Map<number, Set<number>>();  // player -> entities whose name its page holds
  const callados = new Map<number, number>();        // H3: entity -> tick until which it is silenced (the roles' «silencio»)
  const r2 = NOMBRES_M ** 2, olvido2 = (NOMBRES_M * OLVIDO) ** 2;

  /** The name people see: the identity's (I1); a robot's after a second without one; null = not yet. */
  const nombreDe = (e: number): string | null => {
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
    if (canal === "cerca") { api.emit("dicho", m, { near: from, radius: CERCA_M }); return; }
    if (!zona.tomar(api.tick())) { avisar(from, "La zona va muy deprisa: espera unos segundos y vuelve a probar."); return; }
    historia.push(m);
    if (historia.length > HISTORIAL_MAX) historia.shift();
    api.emit("zona", m, "all"); // the zone = this instance (M16); bounded by RITMO_ZONA_TODOS for the whole zone
  };
  api.on("decir", decir("cerca"));
  api.on("decirZona", decir("zona"));
  // H3: the world's roles (packages/server/src/roles-mundo.ts) answer orders and silence people through these
  api.listen("roles", "aviso", (m) => { avisar(Number(m.quien), String(m.texto ?? "")); return true; });
  api.listen("director", "aviso", (m) => { avisar(Number(m.quien), String(m.texto ?? "")); return true; }); // N6: /escena, /narrar, /convocar
  api.listen("roles", "silencio", (m) => {
    const e = Number(m.quien), s = Number(m.segundos);
    if (s > 0) callados.set(e, api.tick() + s * TICKS_POR_SEGUNDO); else callados.delete(e);
    return true;
  });

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
    llegada.delete(e); conocidos.delete(e); callados.delete(e);
    for (const [p, s] of conocidos) if (s.delete(e)) api.emit("nombre", { quien: e, nombre: "" }, { to: p });
  });

  /** One player's names: who its page draws within 24 m gets named (the nearest first, at most NOMBRES_POR_PASO per
   * pass, so a crowd entering at once spreads over a few passes); past 30 m (or gone) is forgotten. */
  const candidatos: { e: number; d2: number }[] = [];
  const repasar = (p: number) => {
    const me = api.position(p);
    if (!me) return;
    let mine = conocidos.get(p);
    if (!mine) conocidos.set(p, (mine = new Set()));
    for (const e of mine) {
      const o = api.position(e);
      if (!o || (o.x - me.x) ** 2 + (o.z - me.z) ** 2 > olvido2) { mine.delete(e); api.emit("nombre", { quien: e, nombre: "" }, { to: p }); }
    }
    candidatos.length = 0;
    for (const e of api.visible(p)) {
      if (mine.has(e) || e === p) continue;
      const o = api.position(e);
      const d2 = o ? (o.x - me.x) ** 2 + (o.z - me.z) ** 2 : Infinity;
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
    for (let i = t % NOMBRES_CADA_TICKS; i < players.length; i += NOMBRES_CADA_TICKS) repasar(players[i]);
  });
});
