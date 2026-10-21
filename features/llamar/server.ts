// llamar — server part (ia-llamar S10). Detects a call to an AI and delivers it to the AI only. See feature.ts for the four ways and the limits.
// Sources (all server-side, nothing the page decides):
//   chat «dicho»   (near chat, 20 m)  → the AI's name or key phrase as words in what a person said
//   chat «orden»   (`/…`, never published) → `/nombre mensaje`; handled (true) whenever the first word is an AI's name, so the chat does not
//                                            answer «Nadie atiende», and refused with a notice when it cannot go out
//   intent `llamar {ia, texto}`            → the «Hablar con ella» button and the E key (S11)
//   burbuja «entraEnBurbuja/saleDeBurbuja» → who is inside each AI's bubble (a mirror: features never import each other)
//   roles «iaLlamada» (server-only)        → each AI's `ia.llamada` block (at identify and with every fresh pass); the house default before it
//   roles «silencio» / «nombreCambiado»    → a silenced person calls nobody; the name people see
// Which AI: among those that match and can hear the caller (inside its bubble when it asks for that, else within 20 m), the one whose bubble
// holds the caller first, then the nearest; `/nombre` and the button name one AI, so only same-named AIs compete. One message calls one AI.
// Only people call (an AI calling an AI would loop two keepers' brains). Cost: with no AI connected every hook returns at once.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { Msg, ServerApi } from "../../packages/feature/src/index.ts";
import { BUZON_MAX, BUZON_TTL_TICKS, CERCA_M, DEFECTO, HORA_TICKS, NOMBRE_MAX, NOMBRE_MIN, PAUSA_PERSONA_TICKS, POR_HORA_IA, TEXTO_MAX, TICK_HZ, aparece, leerLlamada, linea, llamar, nombreLimpio, palabras, trasNombre } from "./feature.ts";
import type { Entrada, EntradaBuzon, Llamada, Modo } from "./feature.ts";

const esIA = (id: string | undefined): boolean => !!id && id.startsWith("ia-"); // identidad.ts agenteDe

type IA = { e: number; nombre: string; norm: string; cfg: Llamada; dentro: Set<number>; buzon: EntradaBuzon[]; horas: number[] };
type Candidata = { ia: IA; modo: Modo; texto: string; apagada: boolean };

/** One per server. `part` goes into the list of parts; the others are the queries for S12 (and tests). */
export function crearLlamar() {
  let ias = new Map<number, IA>();
  let reloj = (): number => 0;
  let cuenta = 0;

  const vigente = (ia: IA, ahora: number): void => {
    let k = 0;
    while (k < ia.buzon.length && ahora - ia.buzon[k].t > BUZON_TTL_TICKS) k++;
    if (k) ia.buzon.splice(0, k);
  };

  const part = serverPart(llamar, (api: ServerApi) => {
    ias = new Map(); cuenta = 0; reloj = () => api.tick();
    const ultima = new Map<string, number>();       // person (identity, else entity) → tick of its last accepted call
    const callados = new Map<number, number>();     // entity → tick until which it is silenced (the roles' «silencio»)
    const propios = new Map<number, string>();      // entity → name chosen with /nombre (roles' «nombreCambiado»)

    const publicar = (ia: IA): void => { api.state.set(String(ia.e), { nombre: ia.cfg.nombre, barra: ia.cfg.barra, boton: ia.cfg.boton, dentro: ia.cfg.soloDentro, frase: ia.cfg.frase }); };
    const nombreDe = (e: number): string => nombreLimpio(propios.get(e) ?? api.who(e)?.nombre ?? "") || `Persona ${e}`;
    const avisar = (a: number, texto: string): void => { api.emit("aviso", { texto: linea(texto, 300) }, { to: a }); };
    const alta = (e: number, nombre: string): IA => {
      const prev = ias.get(e);
      if (prev) { prev.nombre = nombre; prev.norm = palabras(nombre); return prev; }
      const ia: IA = { e, nombre, norm: palabras(nombre), cfg: { ...DEFECTO }, dentro: new Set(), buzon: [], horas: [] };
      ias.set(e, ia); publicar(ia);
      return ia;
    };

    api.onIdentify((e, who) => { if (esIA(who.id)) alta(e, nombreLimpio(propios.get(e) ?? who.nombre)); });
    api.onLeave((e) => {
      propios.delete(e); callados.delete(e);
      if (ias.delete(e)) api.state.delete(String(e));
      for (const ia of ias.values()) ia.dentro.delete(e);
    });
    api.listen("roles", "iaLlamada", (m) => {
      const e = Number(m.quien), ia = ias.get(e);
      if (!ia) return false; // only an AI that identified has a record; a stray event changes nothing
      ia.cfg = leerLlamada(m); publicar(ia);
      return true;
    });
    api.listen("roles", "silencio", (m) => { const e = Number(m.quien), s = Number(m.segundos); if (s > 0) callados.set(e, api.tick() + s * TICK_HZ); else callados.delete(e); return true; });
    api.listen("roles", "nombreCambiado", (m) => {
      const e = Number(m.quien), n = linea(m.nombre, NOMBRE_MAX);
      if (!n) return true;
      propios.set(e, n);
      const ia = ias.get(e);
      if (ia) { ia.nombre = nombreLimpio(n); ia.norm = palabras(ia.nombre); }
      return true;
    });
    api.listen("burbuja", "entraEnBurbuja", (m) => { ias.get(Number(m.ia))?.dentro.add(Number(m.quien)); return true; });
    api.listen("burbuja", "saleDeBurbuja", (m) => { ias.get(Number(m.ia))?.dentro.delete(Number(m.quien)); return true; });

    /** Take the call: the limits, the mailbox, the event to the AI, the confirmation to the caller. */
    const entregar = (c: Candidata, quien: number, texto: string): void => {
      const ahora = api.tick(), ia = c.ia;
      const llave = api.who(quien)?.id ?? `e${quien}`;
      const prev = ultima.get(llave);
      if (prev !== undefined && ahora - prev < PAUSA_PERSONA_TICKS) { avisar(quien, "Vas muy deprisa: puedes llamar a una IA una vez cada 10 segundos."); return; }
      while (ia.horas.length && ahora - ia.horas[0] >= HORA_TICKS) ia.horas.shift();
      if (ia.horas.length >= POR_HORA_IA) { avisar(quien, `${ia.nombre} ya ha recibido muchas llamadas esta hora. Vuelve a probar más tarde.`); return; }
      ultima.set(llave, ahora); ia.horas.push(ahora);
      if (ultima.size > 256) for (const [k, t] of ultima) if (ahora - t >= PAUSA_PERSONA_TICKS) ultima.delete(k);
      const entrada: Entrada = { ia: ia.e, quien, nombre: nombreDe(quien), texto: linea(texto, TEXTO_MAX), modo: c.modo, t: ahora };
      vigente(ia, ahora);
      ia.buzon.push({ ...entrada, n: ++cuenta });
      if (ia.buzon.length > BUZON_MAX) ia.buzon.shift();
      api.emit("llamada", entrada, { to: ia.e });
      avisar(quien, `Has llamado a ${ia.nombre}.`);
    };

    /** The decision. `estricto` = the person asked for this AI by name or button (`/nombre`, the button): every refusal says why; a mention
     * in the chat that cannot go out stays silent (it was only a word). Returns true when the words were for an AI (handled). */
    const intentar = (quien: number, cands: Candidata[], estricto: boolean): boolean => {
      if (cands.length === 0) return false;
      if (esIA(api.who(quien)?.id)) { if (estricto) avisar(quien, "Una IA no puede llamar a otra IA: solo las personas."); return estricto; }
      const yo = api.position(quien);
      if (!yo) return true;
      const hasta = callados.get(quien);
      if (estricto && hasta !== undefined && api.tick() < hasta) { avisar(quien, "Estás en silencio: ahora no puedes llamar a nadie."); return true; }
      const activas = cands.filter((c) => !c.apagada);
      if (activas.length === 0) {
        if (estricto) { const c = cands[0]; avisar(quien, c.modo === "boton" ? `${c.ia.nombre} no se deja llamar con el botón.` : `${c.ia.nombre} no se deja llamar con «/${c.ia.nombre}».`); }
        return true;
      }
      type Medida = { c: Candidata; d: number; dentro: boolean };
      const medidas: Medida[] = [];
      for (const c of activas) {
        const p = api.position(c.ia.e);
        if (p) medidas.push({ c, d: Math.hypot(p.x - yo.x, p.z - yo.z), dentro: c.ia.dentro.has(quien) });
      }
      const oyen = medidas.filter((x) => (x.c.ia.cfg.soloDentro ? x.dentro : x.dentro || x.d <= CERCA_M));
      if (oyen.length === 0) {
        if (estricto && medidas.length) {
          const x = medidas.reduce((a, b) => (b.d < a.d ? b : a));
          avisar(quien, x.c.ia.cfg.soloDentro ? `${x.c.ia.nombre} solo te oye desde dentro de su burbuja: acércate a ella.` : `${x.c.ia.nombre} está demasiado lejos: acércate a menos de ${CERCA_M} m.`);
        }
        return true;
      }
      oyen.sort((a, b) => Number(b.dentro) - Number(a.dentro) || a.d - b.d || a.c.ia.e - b.c.ia.e);
      entregar(oyen[0].c, quien, oyen[0].c.texto);
      return true;
    };

    // (a) its name or key phrase in what a person said near
    api.listen("chat", "dicho", (m) => {
      if (ias.size === 0) return false;
      const quien = Number(m.quien), texto = String(m.texto ?? "");
      const hay = ` ${palabras(texto)} `;
      const cands: Candidata[] = [];
      for (const ia of ias.values()) {
        if (ia.e === quien) continue;
        if (ia.cfg.nombre && ia.norm.length >= NOMBRE_MIN && hay.includes(` ${ia.norm} `)) cands.push({ ia, modo: "nombre", texto, apagada: false });
        else if (ia.cfg.frase && aparece(texto, ia.cfg.frase)) cands.push({ ia, modo: "frase", texto, apagada: false });
      }
      intentar(quien, cands, false);
      return false; // the chat line is the chat's: it was published already and nobody else's listener is bypassed
    });

    // (b) `/nombre mensaje`: the chat never publishes it; only the caller and the AI see what follows the name
    api.listen("chat", "orden", (m) => {
      if (ias.size === 0) return false;
      const quien = Number(m.quien), orden = String(m.texto ?? "");
      const cands: Candidata[] = [];
      for (const ia of ias.values()) {
        if (ia.e === quien) continue;
        const resto = trasNombre(orden, ia.nombre);
        if (resto !== null) cands.push({ ia, modo: "barra", texto: resto, apagada: !ia.cfg.barra });
      }
      return intentar(quien, cands, true);
    });

    // (d) the button and the E key
    api.on("llamar", (from: number, msg: Msg) => {
      const ia = ias.get(Number(msg.ia));
      if (!ia) { avisar(from, ias.size === 0 ? "Aquí no hay ninguna IA." : "Esa persona no es una IA de este mundo."); return; }
      if (ia.e === from) return;
      intentar(from, [{ ia, modo: "boton", texto: linea(msg.texto, TEXTO_MAX), apagada: !ia.cfg.boton }], true);
    });
  });

  return {
    part,
    /** The calls waiting for this AI: at most 20, none older than 10 minutes, oldest first. `desdeN` = only those after that number (each call
     * has a growing `n`; 0 = all). Reading does not remove them: the bridge keeps the last `n` it handed over. [] for an entity that is no AI here. */
    llamadasDe: (ia: number, desdeN = 0): EntradaBuzon[] => {
      const r = ias.get(ia);
      if (!r) return [];
      vigente(r, reloj());
      return r.buzon.filter((x) => x.n > desdeN).map((x) => ({ ...x }));
    },
    /** How this AI is called here now (the pass's block, or the house default), or null when the entity is no AI here. */
    llamadaDe: (ia: number): Llamada | null => { const r = ias.get(ia); return r ? { ...r.cfg } : null; },
  };
}

/** The server's instance, for the composition root (features/servidor.ts). `crearLlamar()` again gives an independent one (tests). */
const unica = crearLlamar();
export const llamadasDe = unica.llamadasDe, llamadaDeIA = unica.llamadaDe;
export default unica.part;
