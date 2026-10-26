// pintar (J18b, MIS-222 t_1b395abe, story 4 of §3.7, first slice): paint a stroke from code, with no VR and no gesture — the accessible path
// the brush needs anyway (AGENTS.md rule 1) and the part of «la mano-pincel» that can be tested without a headset. `empezar` →
// `punto` (as many as the hand gives) → `soltar` : the stroke is written as a `trazo@1` file (pincel.ts), uploaded with the guest token to
// `PUT /a/<sha256>.trazo` (once: a HEAD first), and placed as an `objetos` thing of kind «trazo» at its centre. Every other tab sees it
// when it lands (the loader of story 2–3); `cancelar` throws the stroke away. Painting needs the permission to build, like any object.
// Full stroke (600 points): `punto` closes it and starts another one by itself. The live tube under the hand and the trigger/pinch input
// (vr.ts, manos.ts) come next; they call this.
import { sha256Hex } from "../../packages/net/src/ficheros.ts";
import { crearPincel, opcionesValidas, type Opciones, type Pincel, type Punta } from "./pincel.ts";

type Res = { ok: true } | { ok: false; why: string };
type Msg = Record<string, unknown>;
export type OpcionesPintar = {
  session: { features: { send(feature: string, intent: string, msg: Msg): Res; readonly log: readonly { feature: string; event: string; msg: Msg }[]; readonly stats: { events: number } } };
  puede(): boolean;           // may this player build? (features/objetos client: estado.puede)
  origen: string;             // the instance's server, where /a/ lives
  billete(): string | null;   // the guest token the page keeps
  decir?(texto: string): void;
  fetch?: typeof fetch;       // tests
};
export type EstadoPintar = { pintando: boolean; puntos: number; trazos: number; rechazados: number; ultimo: string };

const huella = async (b: Uint8Array): Promise<string> => {
  const sutil = (globalThis.crypto as Crypto | undefined)?.subtle; // only in secure contexts (https, localhost)
  if (!sutil) return sha256Hex(b);
  return Array.from(new Uint8Array(await sutil.digest("SHA-256", b)), (x) => x.toString(16).padStart(2, "0")).join("");
};

export function montarPintar(o: OpcionesPintar) {
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  const decir = o.decir ?? (() => {});
  let pincel: Pincel | null = null;
  let envios: Promise<Res> = Promise.resolve({ ok: true });
  const cuenta = { trazos: 0, rechazados: 0, ultimo: "" };
  const no = (why: string): Res => { cuenta.rechazados++; cuenta.ultimo = why; decir(`No se pudo pintar: ${why}.`); return { ok: false, why }; };

  /** Wait for the server's answer to colocar: objetos.hecho (with the id) or objetos.rechazado (with why). */
  const respuesta = (desde: number) => new Promise<{ ok: boolean; texto: string }>((ok) => {
    const t0 = performance.now();
    const mirar = () => {
      const fe = o.session.features, nuevos = fe.stats.events - desde;
      const e = nuevos > 0 ? fe.log.slice(-Math.min(nuevos, fe.log.length)).find((x) => x.feature === "objetos" && (x.event === "rechazado" || (x.event === "hecho" && x.msg.accion === "colocar"))) : undefined;
      if (e) return ok({ ok: e.event === "hecho", texto: String(e.msg.motivo ?? e.msg.id ?? "") });
      if (performance.now() - t0 > 8000) return ok({ ok: false, texto: "el servidor no contestó" });
      setTimeout(mirar, 100);
    };
    mirar();
  });

  /** Upload (once) and place one finished stroke. */
  async function enviar(p: Pincel): Promise<Res> {
    const hecho = p.terminar();
    if (!hecho) return no("el trazo es demasiado corto, demasiado grande o pesa más que el tope");
    const billete = o.billete();
    if (!billete) return no("aún no sé quién eres; espera un segundo y vuelve a probar");
    const bytes = new TextEncoder().encode(hecho.fichero), sha = await huella(bytes), url = `${o.origen}/a/${sha}.trazo`;
    const ya = await f(url, { method: "HEAD", cache: "no-store" }).then((r) => r.status === 200, () => false);
    if (!ya) {
      const r = await f(url, { method: "PUT", headers: { authorization: `Bearer ${billete}`, "content-type": "application/json", "x-nombre-fichero": "trazo.trazo" }, body: bytes }).catch(() => null);
      if (!r || (r.status !== 200 && r.status !== 201)) { let m = ""; try { m = String(((await r?.json()) as { error?: unknown } | undefined)?.error ?? ""); } catch { /* not JSON */ } return no(m.replace(/\.$/, "") || `el servidor dijo ${r?.status ?? "nada"}`); }
    }
    const desde = o.session.features.stats.events;
    const s = o.session.features.send("objetos", "colocar", { modelo: sha, x: hecho.centro.x, y: hecho.centro.y, z: hecho.centro.z, ry: 0, nombre: "", decorado: true, tipo: "trazo", ext: "trazo" });
    if (!s.ok) return no(s.why);
    const r = await respuesta(desde);
    if (!r.ok) return no(r.texto.replace(/\.$/, ""));
    cuenta.trazos++; cuenta.ultimo = `colocado ${sha.slice(0, 8)} (${hecho.puntos} puntos)`;
    return { ok: true };
  }
  /** Close the current stroke and queue its upload (the next `soltar` waits for it, so strokes arrive in order). */
  const cerrar = (): void => { const p = pincel; pincel = null; if (p) envios = envios.then(() => enviar(p)); };

  return {
    /** Start a stroke with this colour (0–7) and thickness (m). One at a time: a second `empezar` throws the first away. */
    empezar(op: Opciones): Res {
      if (!o.puede()) return no("no puedes construir aquí, y pintar es construir");
      const v = opcionesValidas(op);
      if (!v) return no(`color de 0 a 7 y grosor en metros`);
      pincel = crearPincel(v);
      return { ok: true };
    },
    /** A tip of the brush (world metres, pressure 0–1). When the stroke is full it is sent and a new one starts where it ended. */
    punto(p: Punta): Res {
      if (!pincel) return { ok: false, why: "no estás pintando: llama a empezar primero" };
      const r = pincel.mover(p);
      if (r === "lleno") { const op = pincel.opciones; cerrar(); pincel = crearPincel(op); pincel.mover(p); }
      return { ok: true };
    },
    /** Let go: the stroke goes to the world. Resolves when the server has placed it (or said why not). */
    async soltar(): Promise<Res> {
      if (!pincel) return { ok: false, why: "no estás pintando" };
      cerrar();
      return envios;
    },
    /** B: throw the stroke in progress away (what already went to the world stays: undo is the builder's «deshacer»). */
    cancelar(): void { pincel?.cancelar(); pincel = null; },
    estado: (): EstadoPintar => ({ pintando: pincel !== null, puntos: pincel?.puntos ?? 0, trazos: cuenta.trazos, rechazados: cuenta.rechazados, ultimo: cuenta.ultimo }),
  };
}
export type Pintar = ReturnType<typeof montarPintar>;
