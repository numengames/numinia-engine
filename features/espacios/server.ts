// espacios — server part (v1, Y50+Y51). The server owns every space: who owns it, who may be inside, what stands in it.
// Everything is kept in the feature's store (`e:<id>`), so ownership and placed things survive a restart. Once a second
// (PASO_TICKS) anyone inside an owned space who is not the owner, a guest or someone who directs is put back outside its
// edge with the reason. The placement rules are the pure functions of esquema.ts (integers, centimetres). A feature never
// touches the simulation: the only door into it is `api.ordenar` / `api.teletransportar`, which the instance applies.
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { NO_PUEDE, puedeInterruptor } from "../interruptor.ts";
import { espacios, ESPACIO_INVITADOS_MAX, PASO_TICKS } from "./feature.ts";
import { cortar, leerGuardado, puedeColocar, puedeRetirar, TIPOS_DEFECTO } from "./esquema.ts";
import type { EspacioFichero, Guardado, Tipo } from "./esquema.ts";

const NO_DIRIGE = "Dar o quitar un espacio es cosa de quien dirige aquí (permiso «Gestionar rituales», o el báculo del Director) o de quien manda en el mundo.";
const cm = (m: number) => Math.round(m * 100);

export const crearEspacios = (opts: { espacios?: EspacioFichero[]; tipos?: Record<string, Tipo> } = {}) => serverPart(espacios, (api: ServerApi) => {
  const lista = opts.espacios ?? [], tipos = opts.tipos ?? { ...TIPOS_DEFECTO };
  const datos = new Map<string, Guardado>();
  const fichero = (id: string) => lista.find((f) => f.id === id);
  const guardado = (f: EspacioFichero): Guardado => {
    let g = datos.get(f.id);
    if (!g) { g = leerGuardado(api.store.get(`e:${f.id}`), f.nombre); datos.set(f.id, g); }
    return g;
  };
  const tope = (f: EspacioFichero) => f.tope;
  const publicar = (f: EspacioFichero) => {
    const g = guardado(f);
    const ok = api.state.set(f.id, { nombre: cortar(g.nom || f.nombre, 40), x: f.x, y: f.y ?? 0, z: f.z, radio: f.radio, estado: g.d ? "privado" : "libre", duenoNombre: g.d ? cortar(g.dn, 48) : "", cosas: g.c.length, tope: tope(f), invitados: g.inv.length }, { at: { x: f.x, z: f.z } });
    if (!ok) api.log(`espacios: «${f.id}» no cabe en el esquema`);
  };
  const guardar = (f: EspacioFichero) => { if (!api.store.set(`e:${f.id}`, guardado(f))) api.log(`espacios: no pude guardar «${f.id}»`); publicar(f); };
  for (const f of lista) publicar(f);

  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 200) }, { to: e }); };
  const aviso = (e: number, id: string, texto: string) => { api.emit("aviso", { id, texto: cortar(texto, 160) }, { to: e }); };
  const quienEs = (e: number) => api.who(e);
  const esDueno = (e: number, g: Guardado) => { const w = quienEs(e); return !!w && !!g.d && w.id === g.d; };
  const dirige = (e: number) => puedeInterruptor(api, e);
  const permitido = (e: number, g: Guardado) => !g.d || esDueno(e, g) || dirige(e) || (() => { const w = quienEs(e); return !!w && g.inv.some(([i]) => i === w.id); })();
  const cambio = (f: EspacioFichero, que: string) => { api.emit("cambio", { id: f.id, que, dueno: guardado(f).d }, "server"); };

  /** The space `id` as the caller's order needs it: it exists, or the reason it does not. */
  const buscar = (e: number, id: string): EspacioFichero | null => {
    const f = fichero(id);
    if (!f) rechazar(e, `No hay ningún espacio «${cortar(id, 16)}». ${lista.length ? `Los de este mundo: ${lista.map((x) => x.id).join(", ")}.` : "Este mundo no tiene espacios."}`);
    return f ?? null;
  };
  /** The space `id` when the caller is its owner, else null (and the reason told). */
  const propio = (e: number, id: string): { f: EspacioFichero; g: Guardado } | null => {
    const f = buscar(e, id); if (!f) return null;
    const g = guardado(f);
    if (!g.d) { rechazar(e, `${f.id} no tiene dueño todavía: lo asigna quien dirige el mundo.`); return null; }
    if (!esDueno(e, g)) { rechazar(e, `${f.id} no es tuyo: solo su dueño puede hacerlo.`); return null; }
    return { f, g };
  };
  const dentroDe = (e: number, f: EspacioFichero) => { const p = api.position(e); return !!p && Math.hypot(p.x - f.x, p.z - f.z) <= f.radio; };

  api.on("asignar", (e, m) => {
    if (!dirige(e)) return rechazar(e, NO_DIRIGE);
    const f = buscar(e, String(m.id ?? "")); if (!f) return;
    const dest = Number(m.quien), w = quienEs(dest);
    if (!api.players().includes(dest) || !w) return rechazar(e, "Esa persona no está conectada o aún no se ha identificado: no se le puede dar un espacio.");
    const g = guardado(f);
    if (g.d) return rechazar(e, `${f.id} ya tiene dueño. Libéralo primero si quieres darlo a otra persona.`);
    const otro = lista.find((x) => guardado(x).d === w.id);
    if (otro) return rechazar(e, `Esa persona ya tiene un espacio (${otro.id}): solo uno por persona.`);
    g.d = w.id; g.dn = cortar(w.nombre, 48); g.inv = []; g.c = []; g.sig = 1; g.nom = f.nombre;
    guardar(f); cambio(f, "asignado");
    api.emit("concedido", { id: f.id, texto: cortar(`Te han dado un espacio propio: ${f.id}. Es privado. Puedes ponerle nombre, invitar a gente y colocar cosas.`, 160) }, { to: dest });
    if (dest !== e) aviso(e, f.id, `${f.id} es ahora de ${cortar(w.nombre, 48)}.`);
    api.log(`${f.id} asignado`);
  });
  api.on("liberar", (e, m) => {
    if (!dirige(e)) return rechazar(e, NO_DIRIGE);
    const f = buscar(e, String(m.id ?? "")); if (!f) return;
    const g = guardado(f);
    if (!g.d) return rechazar(e, `${f.id} ya está libre.`);
    const hubo = g.c.length;
    datos.set(f.id, leerGuardado(undefined, f.nombre));
    guardar(f); cambio(f, "liberado");
    aviso(e, f.id, `${f.id} vuelve a estar libre${hubo ? ` y se vaciaron ${hubo} objetos` : ""}.`);
    api.log(`${f.id} liberado`);
  });
  const nombrar = (e: number, id: string, texto: unknown) => {
    const p = propio(e, id); if (!p) return;
    const nombre = cortar(texto, 40);
    if (!nombre) return rechazar(e, "Escribe un nombre para el espacio (hasta 40 caracteres).");
    p.g.nom = nombre; guardar(p.f);
    aviso(e, p.f.id, `Tu espacio se llama ahora ${nombre}.`);
  };
  const invitar = (e: number, id: string, dest: number) => {
    const p = propio(e, id); if (!p) return;
    const w = quienEs(dest);
    if (!api.players().includes(dest) || !w) return rechazar(e, "Esa persona no está conectada o aún no se ha identificado: espera a que esté y vuelve a invitarla.");
    if (w.id === p.g.d) return rechazar(e, "Ya eres el dueño: no hace falta invitarte.");
    if (p.g.inv.some(([i]) => i === w.id)) return rechazar(e, `${cortar(w.nombre, 48)} ya está invitada.`);
    if (p.g.inv.length >= ESPACIO_INVITADOS_MAX) return rechazar(e, `La lista está llena: ${ESPACIO_INVITADOS_MAX} invitados. Quita a alguien primero.`);
    p.g.inv.push([w.id, cortar(w.nombre, 48)]); guardar(p.f); cambio(p.f, "invitado");
    aviso(e, p.f.id, `${cortar(w.nombre, 48)} puede entrar en tu espacio.`);
    api.emit("concedido", { id: p.f.id, texto: cortar(`${cortar(p.g.dn, 48)} te ha invitado a su espacio ${p.f.id}. Entra con la orden entrar.`, 160) }, { to: dest });
  };
  const quitar = (e: number, id: string, texto: unknown) => {
    const p = propio(e, id); if (!p) return;
    const n = cortar(texto, 48).toLowerCase(), antes = p.g.inv.length;
    p.g.inv = p.g.inv.filter(([, nombre]) => nombre.toLowerCase() !== n);
    if (p.g.inv.length === antes) return rechazar(e, `No hay ningún invitado llamado «${cortar(texto, 48)}». Pide «mirar» para ver la lista.`);
    guardar(p.f); cambio(p.f, "invitado");
    aviso(e, p.f.id, `${cortar(texto, 48)} ya no está en la lista de invitados.`);
  };
  api.on("nombrar", (e, m) => nombrar(e, String(m.id ?? ""), m.nombre));
  api.on("invitar", (e, m) => invitar(e, String(m.id ?? ""), Number(m.quien)));
  api.on("quitar", (e, m) => quitar(e, String(m.id ?? ""), m.nombre));
  const entrar = (e: number, id: string) => {
    const f = buscar(e, id); if (!f) return;
    const g = guardado(f);
    if (!permitido(e, g)) return rechazar(e, `${f.id} es un espacio privado. Pide a su dueño que te invite.`);
    const p = api.teletransportar(e, { x: f.x, y: f.y ?? 0, z: f.z });
    if (!p) return rechazar(e, "No he encontrado un sitio libre dentro del espacio ahora mismo. Prueba otra vez en un momento.");
    aviso(e, f.id, `Has entrado en ${cortar(g.nom || f.nombre, 40)}.`);
  };
  api.on("entrar", (e, m) => entrar(e, String(m.id ?? "")));
  api.on("colocar", (e, m) => {
    const p = propio(e, String(m.id ?? "")); if (!p) return;
    if (!dentroDe(e, p.f)) return rechazar(e, "Para colocar cosas tienes que estar dentro de tu espacio. Usa la orden entrar.");
    const tipo = String(m.tipo ?? "");
    const r = puedeColocar({ cx: cm(p.f.x), cz: cm(p.f.z), radio: cm(p.f.radio), tope: tope(p.f) }, p.g.c, tipos, tipo, cm(Number(m.x)), cm(Number(m.z)), Number(m.sobre));
    if (!r.ok) return rechazar(e, r.motivo);
    const n = p.g.sig++;
    p.g.c.push({ n, t: tipo, x: cm(Number(m.x)), z: cm(Number(m.z)), y: r.y, s: Number(m.sobre) });
    guardar(p.f); cambio(p.f, "colocado");
    aviso(e, p.f.id, `Has colocado ${tipo} número ${n} (${p.g.c.length} de ${tope(p.f)}).`);
  });
  api.on("retirar", (e, m) => {
    const p = propio(e, String(m.id ?? "")); if (!p) return;
    const n = Number(m.n), r = puedeRetirar(p.g.c, n);
    if (!r.ok) return rechazar(e, r.motivo);
    p.g.c = p.g.c.filter((c) => c.n !== n);
    guardar(p.f); cambio(p.f, "retirado");
    aviso(e, p.f.id, `Has retirado la cosa número ${n} (${p.g.c.length} de ${tope(p.f)}).`);
  });
  const mirar = (e: number, id: string) => {
    const f = buscar(e, id); if (!f) return;
    const g = guardado(f);
    if (!g.d) return aviso(e, f.id, `${f.id} está libre: sin dueño, invitados ni cosas.`);
    if (!esDueno(e, g) && !dirige(e)) return rechazar(e, `${f.id} es privado: solo su dueño lo puede mirar por dentro.`);
    const inv = g.inv.length ? g.inv.map(([, n]) => n).join(", ") : "nadie";
    const cosas = g.c.length ? g.c.map((c) => `${c.n} ${c.t}${c.s ? ` sobre ${c.s}` : ""}`).join("; ") : "nada";
    aviso(e, f.id, `${cortar(g.nom, 40)}. Invitados: ${inv}. Cosas (${g.c.length} de ${tope(f)}): ${cosas}.`);
  };
  api.on("mirar", (e, m) => mirar(e, String(m.id ?? "")));

  // Privacy: once a second, whoever is inside an owned space without the right is put back just outside its edge.
  api.onTick((t) => {
    if (t % PASO_TICKS !== 0) return;
    for (const f of lista) {
      const g = guardado(f);
      if (!g.d) continue;
      for (const e of api.overlapSphere(f.x, f.y ?? 0, f.z, f.radio)) {
        if (permitido(e, g)) continue;
        const p = api.position(e); if (!p) continue;
        let dx = p.x - f.x, dz = p.z - f.z; const d = Math.hypot(dx, dz);
        if (d < 0.01) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
        const fuera = f.radio + 1.5;
        api.ordenar(e, { cerca: { x: f.x + dx * fuera, y: p.y, z: f.z + dz * fuera } });
        rechazar(e, `${f.id} es un espacio privado. Pide a su dueño que te invite.`);
      }
    }
  });

  // The chat (a keyboard, VR included): /espacio · /espacio <id> entrar|mirar|nombre <texto>|invitar <persona>|quitar <nombre>
  api.listen("chat", "orden", (m) => {
    const t = String(m.texto ?? "").trim().split(/\s+/), from = Number(m.quien);
    if ((t[0] ?? "").toLowerCase() !== "espacio") return false;
    const w = quienEs(from);
    const mio = lista.find((f) => w && guardado(f).d === w.id);
    const id = (t[1] ?? "").toLowerCase() || mio?.id || "";
    if (!id) { rechazar(from, `Escribe /espacio y el nombre del espacio: ${lista.map((f) => f.id).join(", ") || "este mundo no tiene espacios"}.`); return true; }
    const verbo = (t[2] ?? "mirar").toLowerCase(), resto = t.slice(3).join(" ");
    if (verbo === "entrar") entrar(from, id);
    else if (verbo === "mirar") mirar(from, id);
    else if (verbo === "nombre") nombrar(from, id, resto);
    else if (verbo === "quitar") quitar(from, id, resto);
    else if (verbo === "invitar") {
      const q = resto.toLowerCase();
      const cerca = api.players().filter((e2) => e2 !== from && quienEs(e2)?.nombre.toLowerCase().startsWith(q));
      if (!q) rechazar(from, `Escribe /espacio ${id} invitar y el nombre de la persona.`);
      else if (cerca.length !== 1) rechazar(from, cerca.length ? "Hay varias personas con ese nombre: usa la orden invitar con su entidad." : `No encuentro a nadie conectado que se llame «${cortar(resto, 48)}».`);
      else invitar(from, id, cerca[0]);
    } else rechazar(from, "Órdenes de /espacio: entrar, mirar, nombre <texto>, invitar <persona>, quitar <nombre>. Para asignar o colocar usa las órdenes del espacio.");
    return true;
  });
});

export default crearEspacios();
