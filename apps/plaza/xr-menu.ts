// Rediseño v2 (story E, maquetas p6/p7): what the VR watch and the VR menu show, from the SAME sources the computer's
// panels read (`globalThis.__numinia`: ficha/estado/carga, viajar + gente, inventario, misiones, mapa, ajustes) — in VR
// the HTML panels are not drawn, so the menu (packages/render/src/menu-invocado.ts) is a canvas the page fills here.
// Also what the watch's buttons do: microphone = the Q key (voz.alternar), camera = the photo mode's shot, record = the K key
// (graboso.alternar; only drawn where the Graboso exists, red while it records), notices =
// the last things the page announced (paneles.ts alAnunciar), back to the city = mundo.ajustes.json `ciudadUrl`.
// Not yet tried on a real Quest (only the IWER emulator and pictures of the canvases).
import { alAnunciar } from "./paneles.ts";
import { horaVR } from "../../packages/client/src/reloj.ts";
import { pathsIcono } from "./iconos.ts";
import { resumenTexto } from "./inventario-resumen.ts";
import { sonar } from "./sonar.ts";
import { ESCALERA } from "./ficha.ts";
import { listaGenteVR, textos } from "./gente-ia.ts";
import { distanciaTexto } from "./amigos.ts";
import { NOTA_DEJADO as NOTA_DEJADO_PINTAR, NOTA_ENTRAR as NOTA_ENTRAR_PINTAR } from "./pintar-vr.ts";
import { AYUDA_PINTAR, AYUDA_RAYO, TEXTO_FUERA_DE_VR, esInvitado, vistaConstruirVR, vistaPintarVR } from "./construir-vr-logica.ts";
import { iconoDe, nombreDe } from "../../packages/render/src/menu-secciones.ts";
import { GROSORES_VR, NOMBRES_COLOR, indiceGrosor } from "../../packages/render/src/menu-paleta.ts";
import { PALETA_TRAZO } from "../../packages/render/src/trazo-tubo.ts";
import type { MenuVR, ContenidoMenuVR as Contenido } from "../../packages/render/src/index.ts";
import { siguienteValor, textoValor } from "../../packages/render/src/menu-vr.ts";
import { FRASES, ultimosMensajes, type LineaChat } from "../../packages/render/src/menu-chat.ts";
import { vistaObra, pedidoPoner, nombreObra, type HuecoObra, type ImagenObra } from "./obra-vr-logica.ts";
import { filasEsteMundoVR } from "../../features/funciones/menu-vr.ts";
import { textoCambio } from "../../features/funciones/panel.ts";
import { FUNCIONES } from "../../features/funciones/feature.ts";
import { cogibles } from "../../features/cogibles/client.ts"; // N3: a thing the server put in your hand (the page's Q) can be let go from the Bolsa too
import type { Funcion } from "../../features/funciones/feature.ts";
import { tx } from "../../packages/feature/src/idioma.ts";

type N = Record<string, any>;
type Fila = { texto: string; detalle?: string; icono?: string; color?: string; botones?: { texto?: string; icono?: string; accion: () => void; estilo?: "accion" | "normal" | "desactivado"; ancho?: number }[] };

/** The VR settings the menu shows, in order (ids of the settings registry: packages/client/src/ajustes-motor.ts). */
export const AJUSTES_VR = ["controles.modoMovimientoVR", "controles.vrManoMenu", "controles.giroVR", "controles.velocidadVR", "controles.confortVR", "controles.alturaVR"] as const;
/** How many notices the menu keeps. */
export const AVISOS_MAX = 30;

export function montarMenuVR(o: {
  vr: MenuVR;
  /** `globalThis.__numinia`, read at each use (the panels of other branches may come later). */
  n: () => N;
  /** This world's city (null = none: the watch does not draw that button). */
  ciudadUrl: string | null;
  /** The line under your name, as «Tú» writes it on the computer (avatar · world · how long). */
  linea: () => string;
  /** The full-body portrait of your avatar (/retratos/<id>-cuerpo.webp) or null (the menu draws the silhouette). */
  retrato: () => string | null;
  /** Whether you may build here (constructor.estado.puede). */
  puedeConstruir: () => boolean;
  /** The builder's hands (constructor-xr.ts): «Construir» turns them on and off. */
  construirVR: { activo(): boolean; entrar(): { ok: boolean; why?: string }; salir(): void };
  /** J18b: painting with the controller (pintar-vr.ts); a second row under «Construir». The two modes exclude each other (both want the right trigger). */
  pintarVR?: { activo(): boolean; entrar(): { ok: boolean; why?: string }; salir(): void;
    /** Story 5, the palette: what the brush holds now, set it (colour 0–7, thickness in metres) and undo your last change. */
    opciones?(): { color: number; grosor: number }; ajustar?(o: { color: number; grosor: number }): { ok: boolean; why?: string }; deshacer?(): { ok: boolean; why?: string } };
  /** Your name. */
  nombre: () => string;
  /** MIS-222: the «Obra» view — a hole you pressed in VR and the images already on the server to put in it. */
  obra?: { hueco(id: string): HuecoObra | null; imagenes(): ImagenObra[]; poner(id: string, sha: string, ext: string, nombre: string): Promise<{ ok: boolean; texto: string }> };
}) {
  const { vr } = o;
  vr.iconos(pathsIcono);
  // row buttons are outlined («normal»): one filled main button per view at most (BRIEF: tema Nocturno)
  // notices: what the page announced while you were in VR (the HTML stack is not drawn in the headset)
  const avisos: { texto: string; t: number }[] = [];
  let vistos = 0, totalAvisos = 0;
  alAnunciar((texto) => { if (!texto) return; avisos.unshift({ texto, t: Date.now() }); totalAvisos++; if (avisos.length > AVISOS_MAX) avisos.length = AVISOS_MAX; });
  const nota = (t: string) => { try { vr.nota(t); } catch { /* VR off */ } };

  // the Graboso (apps/plaza/graboso.ts) is `__numinia.graboso`; a browser that cannot record the canvas (`soporta` false) has no button
  const grabosoAqui = () => { const g = o.n().graboso; return !!g?.graboso?.alternar && g.soporta !== false && g.libre?.() !== false; }; // t_f87ffb93: a world that defines the Graboso as a relic gives the button only with the relic
  const grabosoSaca = () => { const f = o.n().graboso.graboso.estado.fase; return f === "grabando" || f === "despertando"; };

  // the clock of the watch and of the menu's header: the same HH:MM as the HUD's #reloj (apps/plaza/reloj.ts), same `interfaz.hora` setting
  const hora = (): string => {
    const a = o.n().ajustes;
    let modo: unknown; try { modo = a?.get?.("interfaz.hora"); } catch { /* settings not ready: local */ }
    return horaVR(Date.now(), modo);
  };
  vr.relojEstado(() => {
    const n = o.n(), voz = n.voz, foto = n.foto;
    return { hora: hora(), micro: voz?.estado ? !!voz.estado.encendido : null, camara: !!foto?.disparar, graboso: grabosoAqui() ? grabosoSaca() : null, avisos: Math.min(99, totalAvisos - vistos), ciudad: !!o.ciudadUrl };
  });
  vr.onPulsa(() => { try { sonar("ui-pulsar"); } catch { /* no sound here */ } });
  vr.onReloj((b) => {
    const n = o.n();
    if (b === "micro") { if (n.voz?.alternar) { n.voz.alternar(); setTimeout(() => nota(n.voz.estado.encendido ? tx("Microphone on", "Micrófono abierto") : tx("Microphone off", "Micrófono cerrado")), 400); } else nota(tx("No voice chat here.", "Aquí no hay voz.")); }
    else if (b === "camara") {
      const f = n.foto;
      if (!f?.disparar) { nota(tx("No photo mode here.", "Aquí no hay modo foto.")); return; }
      const ya = f.activo?.();
      nota(tx("Taking the photo…", "Sacando la foto…"));
      // MIS-222: inside VR `disparar` takes one picture of the headset's view (with the frame); it is kept for the page
      void f.disparar().then((r: { ok: boolean; error?: string; deVR?: boolean }) => { if (!ya) f.cerrar?.(); nota(r.ok ? (r.deVR ? tx("Photo taken: it is on the page when you leave VR.", "Foto hecha: al salir de VR la tienes en la página.") : tx("Photo taken: it is in the page's photo mode.", "Foto hecha: está en el modo foto de la página.")) : tx(`Could not take the photo: ${r.error ?? "?"}`, `No se pudo hacer la foto: ${r.error ?? "?"}`)); });
    } else if (b === "graboso") {
      if (!grabosoAqui()) { nota(tx("The Graboso is not here.", "Aquí no está el Graboso.")); return; }
      const g = n.graboso.graboso, antes = g.estado.fase;
      if (antes === "despertando") return; // it is starting: a second press would stop nothing yet
      void Promise.resolve(g.alternar()).then(() => nota(antes === "grabando" ? (g.estado.error || tx("Clip saved: it is on the page (Download).", "Clip guardado: lo tienes en la página (Descargar).")) : g.estado.fase === "grabando" ? tx("Recording what you see: press again to save.", "Grabando lo que ves: pulsa otra vez para guardar.") : (g.estado.error || tx("Could not record.", "No se pudo grabar."))));
    } else if (b === "avisos") vistos = totalAvisos;
    else if (b === "ciudad" && o.ciudadUrl) { const u = o.ciudadUrl; void vr.exit().finally(() => { location.href = u; }); }
  });

  // ── each section's content ──
  // the server answers a trip later (and may refuse: «Espera 7 s…», «No hay sitio libre…», «no se deja encontrar»); the computer announces
  // it, the headset shows no toast stack, so a refusal is told with the VR note (v8: Pablo's «el teletransporte no funciona» was silent)
  let vigilando = false;
  const vigilarViaje = () => {
    const v = o.n().viajar;
    if (vigilando || typeof v?.alCambiar !== "function") return;
    vigilando = true;
    v.alCambiar((q: string) => { const x = v.estado?.viaje; if (q === "viaje" && x && !x.ok) nota(x.texto); });
  };
  const ir = (quien: number, nombre: string) => () => {
    vigilarViaje();
    const r = o.n().viajar?.ir?.(quien);
    if (r && !r.ok) nota(r.why ?? tx("Could not.", "No se pudo.")); else { nota(tx(`Going to ${nombre}…`, `Vas con ${nombre}…`)); vr.menu.cerrar(); }
  };
  function tu(): Contenido {
    const n = o.n();
    const e = n.estado?.actual?.() as string | undefined, i = e ? ESCALERA.indexOf(e as (typeof ESCALERA)[number]) : -1;
    const chip = i < 0 ? { texto: tx("Stable", "Estable"), tono: "ok" as const } : { texto: ESCALERA[i], tono: (i >= 2 ? "mal" : "aviso") as "mal" | "aviso" };
    const inv = n.inventario, r = typeof inv?.resumen === "function" ? inv.resumen() : null;
    const c = n.carga?.actual?.() as { valor: number; max: number } | null | undefined;
    let ins: string[] = [];
    try { const s = n.misiones?.resumen?.(); if (s && Array.isArray(s.insignias)) ins = s.insignias.map(String); } catch { /* no quests */ }
    const who = n.session?.who as { id: string } | null | undefined;
    return {
      tipo: "tu", nombre: o.nombre(), linea: who ? o.linea() || "VR" : tx("Waiting for the server…", "Esperando al servidor…"), chip,
      reserva: r ? resumenTexto(r) : null, carga: c && c.max > 0 ? { valor: c.valor, max: c.max } : null,
      insignias: ins.map((nombre) => ({ nombre, conseguida: true })), retrato: o.retrato(),
    } as Contenido;
  }
  function gente(): Contenido {
    const n = o.n(), v = n.viajar;
    if (!n.gente || !v) return { tipo: "lista", titulo: tx("People", "Gente"), vacio: tx("This world does not show who is connected.", "Este mundo no enseña a la gente conectada."), filas: [] } as Contenido;
    const activo = v.activo?.() !== false, lista = (v.estado?.gente ?? []) as { quien: number; nombre: string }[];
    // the same as the computer's «Aquí ahora»: people first, then the AIs with their «IA» mark, state and distance (features/ia + gente-ia.ts)
    const yo = n.session?.entity >= 0 ? n.session.selfPosition?.(1) : null, ras = (n.session?.remotePositions?.() ?? []) as { id: number; x: number; z: number }[];
    const lejos = (q: number): number | null => { const r = ras.find((x) => x.id === q); return yo && r ? Math.hypot(r.x - yo.x, r.z - yo.z) : null; };
    const dist = (q: number) => { const d = lejos(q); return d === null ? "" : distanciaTexto(d); };
    const { cuenta, filas: gente } = listaGenteVR(lista, v.estado?.todos ?? 0, (q) => n.ia?.de?.(q) ?? null, dist, document.documentElement.lang);
    const baliza = (p: { quien: number; nombre: string }) => () => { // an AI where trips are off: a beacon at its place, to walk there
      const r = ras.find((x) => x.id === p.quien);
      if (!r || !n.view?.beacon) { nota(textos(document.documentElement.lang).sinPosicion); return; }
      n.view.beacon(r.x, r.z, p.nombre, 60_000); nota(`${textos(document.documentElement.lang).vasConBaliza}: ${p.nombre}.`); vr.menu.cerrar();
    };
    const filas: Fila[] = gente.map((p) => p.ia
      ? { texto: p.nombre, detalle: p.detalle, icono: "robot", botones: [{ texto: textos(document.documentElement.lang).ir, accion: activo ? ir(p.quien, p.nombre) : baliza(p), estilo: "normal", ancho: 300 }] }
      : { texto: p.nombre, detalle: p.detalle || undefined, icono: "user", botones: [{ texto: tx("Go to them", "Ir a su lado"), accion: ir(p.quien, p.nombre), estilo: activo ? "normal" : "desactivado", ancho: 260 }] });
    return { tipo: "lista", titulo: tx(`People here${v.estado?.todos || gente.length ? ` · ${cuenta}` : ""}`, `Gente aquí${v.estado?.todos || gente.length ? ` · ${cuenta}` : ""}`), nota: activo ? tx("«Go to them» takes you next to that person.", "«Ir a su lado» te lleva junto a esa persona.") : tx("Travelling to others is off in this world right now.", "En este mundo ahora no se puede ir junto a otros."),
      vacio: v.estado?.pedida ? tx("There is nobody else in this world right now.", "Ahora no hay nadie más en este mundo.") : tx("Asking for the list…", "Pidiendo la lista…"), filas } as Contenido;
  }
  // MIS-200 «Cambiar de mano»: the same handover as the free hand's grip next to what you carry (manos.ts), for whoever cannot do
  // the gesture. The first row of the Bolsa: what is in which hand, and a button that passes it to the other one.
  function filaCambiarMano(): Fila | null {
    const m = (o.n().view as { manos?: { llevando(): { que: string; lado: "izq" | "der" }[]; cambiarMano(): { ok: boolean; why?: string; que?: string; a?: "izq" | "der" } } } | undefined)?.manos;
    if (!m?.llevando) return null;
    const lleva = m.llevando();
    const lado = (l: string) => (l === "izq" ? tx("left", "izquierda") : tx("right", "derecha"));
    return { texto: tx("Switch hands", "Cambiar de mano"), icono: "hand-grabbing",
      detalle: lleva.length ? lleva.map((x) => tx(`${x.que}: ${lado(x.lado)} hand`, `${x.que}: mano ${lado(x.lado)}`)).join(" · ") : tx("You are not holding anything", "No llevas nada en la mano"),
      botones: [{ texto: tx("Pass", "Pasar"), estilo: lleva.length ? "normal" : "desactivado", ancho: 160, accion: () => { const r = m.cambiarMano(); nota(r.ok ? tx(`Passed to the ${lado(r.a ?? "")} hand`, `Pasado a la mano ${lado(r.a ?? "")}`) : r.why ?? tx("Could not.", "No se pudo.")); } }] };
  }
  // N3 «Soltar»: let go of whatever is in a hand — the rod back on its holder, the dart, a quest thing — with the button, for hands
  // that have no stick to click (and for whoever prefers it). A thing the server put in your hand (cogibles) is let go the page's way.
  function filaSoltar(): Fila | null {
    const m = (o.n().view as { manos?: { llevando(): { que: string; lado: "izq" | "der" }[]; soltar(l?: "izq" | "der"): { ok: boolean; why?: string; que?: string } } } | undefined)?.manos;
    if (!m?.llevando) return null;
    const lleva = m.llevando(), suelo = cogibles.mias().length;
    const lado = (l: string) => (l === "izq" ? tx("left", "izquierda") : tx("right", "derecha"));
    return { texto: tx("Drop", "Soltar"), icono: "hand-grabbing",
      detalle: lleva.length ? lleva.map((x) => tx(`${x.que}: ${lado(x.lado)} hand`, `${x.que}: mano ${lado(x.lado)}`)).join(" · ") : suelo ? tx("You are holding something", "Llevas algo en la mano") : tx("You are not holding anything", "No llevas nada en la mano"),
      botones: [{ texto: tx("Drop", "Soltar"), estilo: lleva.length || suelo ? "normal" : "desactivado", ancho: 160, accion: () => {
        if (lleva.length) { const r = m.soltar(); nota(r.ok ? tx(`Dropped: ${r.que}`, `Soltado: ${r.que}`) : r.why ?? tx("Could not.", "No se pudo.")); return; }
        const r = cogibles.soltar(); nota(r.ok ? tx("Dropped", "Soltado") : r.why);
      } }] };
  }
  function bolsa(): Contenido {
    const inv = o.n().inventario, r = typeof inv?.resumen === "function" ? inv.resumen() : null;
    const cambio = filaCambiarMano(), soltar = filaSoltar();
    const arriba = [...(cambio ? [cambio] : []), ...(soltar ? [soltar] : [])];
    if (!r) return { tipo: "lista", titulo: tx("Backpack", "Bolsa"), vacio: tx("This server keeps no inventory.", "Este servidor no lleva inventario."), filas: arriba } as Contenido;
    const lista = (inv.lista?.() ?? []) as { nombre: string; n: number; portado: boolean; tipo?: string }[];
    return { tipo: "lista", titulo: tx("Backpack", "Bolsa"), nota: resumenTexto(r), vacio: resumenTexto(r),
      filas: [...arriba, ...lista.map((x) => ({ texto: x.n > 1 ? `${x.nombre} × ${x.n}` : x.nombre, detalle: x.portado ? tx("With you", "Contigo") : tx("Stored", "Guardado"), icono: x.tipo === "captura" ? "fish" : "package" }))] } as Contenido;
  }
  function misiones(): Contenido {
    const m = o.n().misiones;
    if (!m?.libro) return { tipo: "lista", titulo: tx("Quests", "Misiones"), vacio: tx("No quests in this area yet.", "Todavía no hay misiones en esta zona."), filas: [] } as Contenido;
    const libro = m.libro() as { id: string; titulo: string; estado: string; paso: number; pasos: number; seguida: boolean; lista: { n: number; texto: string; hecho: boolean }[] }[];
    const seg = libro.find((x) => x.seguida && x.estado === "activa"), filas: Fila[] = [];
    if (seg) for (const p of seg.lista) filas.push({ texto: p.texto, icono: p.hecho ? "check" : p.n === seg.paso ? "target" : "scroll", color: p.hecho ? "#8FC46B" : p.n === seg.paso ? "#F9EBDC" : "#C4B5A6" });
    for (const x of libro.filter((x) => x.estado === "activa" && x !== seg))
      filas.push({ texto: x.titulo, detalle: tx(`Step ${x.paso + 1} of ${x.pasos}`, `Paso ${x.paso + 1} de ${x.pasos}`), icono: "scroll", botones: [{ texto: tx("Follow", "Seguir"), accion: () => { m.seguir(x.id); }, ancho: 180 }] });
    const hechas = libro.filter((x) => x.estado === "hecha").length;
    return { tipo: "lista", titulo: seg ? `★ ${seg.titulo} · ${seg.paso + 1}/${seg.pasos}` : tx("Quests", "Misiones"), nota: hechas ? tx(`Completed: ${hechas}`, `Terminadas: ${hechas}`) : undefined,
      vacio: libro.length ? tx("You are not following any quest.", "No sigues ninguna misión.") : tx("You have no quests: talk to someone who has one for you.", "No llevas ninguna misión: habla con quien tenga una para ti."), filas } as Contenido;
  }
  function mapa(): Contenido {
    const mp = o.n().mapa;
    if (!mp?.marcadores) return { tipo: "lista", titulo: nombreDe("mapa"), vacio: tx("This world does not show where you are.", "Este mundo no enseña dónde estás."), filas: [] } as Contenido;
    const marc = mp.marcadores() as { id: string; tipo: string; nombre: string; x: number; z: number; yaw?: number }[];
    const tipo = (t: string) => mp.registro?.tipo?.(t) ?? { color: "#C4B5A6", enLista: true, orden: 0 };
    const tu = marc.find((x) => x.tipo === "tu"), puede = mp.puedeIr?.() ?? false;
    const sitios = marc.filter((x) => x.tipo !== "tu" && tipo(x.tipo).enLista).sort((a, b) => tipo(b.tipo).orden - tipo(a.tipo).orden);
    const filas: Fila[] = sitios.map((s) => ({ texto: s.nombre, detalle: tipo(s.tipo).nombre, color: undefined, icono: "map-pin",
      botones: [{ texto: tx("Go", "Ir"), accion: () => { vigilarViaje(); mp.ir?.(s); nota(tx(`Going to ${s.nombre}…`, `Vas a ${s.nombre}…`)); vr.menu.cerrar(); }, estilo: puede ? "normal" : "desactivado", ancho: 120 }] }));
    if (mp.puedeVolver?.()) filas.unshift({ texto: tx("Where you were", "Donde estabas"), icono: "arrow-u-up-left", botones: [{ texto: tx("Back", "Volver"), accion: () => { mp.volver(); vr.menu.cerrar(); }, ancho: 160 }] });
    return { tipo: "mapa", titulo: tx("Places", "Sitios"), yo: tu ? { x: tu.x, z: tu.z, rumbo: tu.yaw !== undefined ? (tu.yaw * 180) / Math.PI : 0 } : null,
      puntos: sitios.slice(0, 80).map((s) => ({ nombre: s.nombre, x: s.x, z: s.z, color: tipo(s.tipo).color })), filas, vacio: tx("No marked places in this area.", "No hay sitios marcados en esta zona.") } as Contenido;
  }
  // J18b story 5: while you paint, «Construir» is the brush's palette — colours and thicknesses set the next stroke (written into its trazo@1), then two verbs
  function paleta(_: boolean): Contenido {
    const p = o.pintarVR!, op = p.opciones!(), gi = indiceGrosor(op.grosor);
    const pon = (cambio: Partial<{ color: number; grosor: number }>) => () => { const r = p.ajustar!({ ...op, ...cambio }); if (!r.ok) nota(r.why ?? tx("Could not change the brush.", "No se pudo cambiar el pincel.")); };
    return { tipo: "paleta", titulo: tx("Brush", "Pincel"), nota: tx("Close the menu and squeeze the right trigger to paint with this colour.", "Cierra el menú y aprieta el gatillo derecho para pintar con este color."),
      colores: PALETA_TRAZO.map((hex, i) => ({ nombre: NOMBRES_COLOR[i], hex, activo: op.color === i, accion: pon({ color: i }) })),
      grosores: GROSORES_VR.map((g, i) => ({ texto: g.texto, detalle: g.detalle, m: g.m, activo: gi === i, accion: pon({ grosor: g.m }) })),
      acciones: [
        { texto: tx("Undo", "Deshacer"), icono: "arrow-counter-clockwise", estilo: p.deshacer ? "normal" : "desactivado", accion: () => { const r = p.deshacer?.(); if (r && !r.ok) nota(r.why ?? tx("Could not undo.", "No se pudo deshacer.")); else nota(tx("Asked: undo your last change.", "Pedido: deshacer lo último que hiciste.")); } },
        { texto: tx("Stop painting", "Dejar de pintar"), icono: "x", estilo: "normal", accion: () => { p.salir(); nota(NOTA_DEJADO_PINTAR); vr.menu.cerrar(); } },
      ] } as Contenido;
  }
  function construir(): Contenido {
    const who = o.n().session?.who as { id: string; nombre: string } | null | undefined;
    const v = vistaConstruirVR({ puede: o.puedeConstruir(), invitado: esInvitado(who), activo: o.construirVR.activo() });
    if (v.tipo === "negado") return { tipo: "lista", titulo: tx("Build", "Construir"), vacio: v.texto, filas: [] } as Contenido;
    const empezar = v.tipo === "listo", pv = o.pintarVR ? vistaPintarVR(o.pintarVR.activo()) : null;
    if (pv?.activo && o.pintarVR?.opciones && o.pintarVR.ajustar) return paleta(pv.activo);
    const filaConstruir = { texto: v.titulo, detalle: v.detalle, icono: iconoDe("construir"),
      botones: [{ texto: v.boton, estilo: empezar ? "accion" : "normal", ancho: 260, accion: () => {
        if (!empezar) { o.construirVR.salir(); nota(tx("You stopped building.", "Has dejado de construir.")); vr.menu.cerrar(); return; }
        o.pintarVR?.salir(); // one right trigger, one job
        const r = o.construirVR.entrar();
        if (r.ok) { nota(tx("Build: point at something and squeeze the trigger.", "Construir: apunta a una cosa y aprieta el gatillo.")); vr.menu.cerrar(); } else nota(r.why ?? TEXTO_FUERA_DE_VR);
      } }] };
    const filaPintar = pv && o.pintarVR ? { texto: pv.titulo, detalle: pv.detalle, icono: iconoDe("construir"),
      botones: [{ texto: pv.boton, estilo: pv.activo ? "normal" : "accion", ancho: 260, accion: () => {
        if (pv.activo) { o.pintarVR!.salir(); nota(NOTA_DEJADO_PINTAR); vr.menu.cerrar(); return; }
        o.construirVR.salir(); // one right trigger, one job
        const r = o.pintarVR!.entrar();
        if (r.ok) { nota(NOTA_ENTRAR_PINTAR); vr.menu.cerrar(); } else nota(r.why ?? TEXTO_FUERA_DE_VR);
      } }] } : null;
    return { tipo: "lista", titulo: pv?.activo ? tx("Painting", "Pintando") : empezar ? tx("Build in VR", "Construir en VR") : tx("Building", "Construyendo"), nota: pv?.activo ? AYUDA_PINTAR : AYUDA_RAYO, vacio: "",
      filas: filaPintar ? [filaConstruir, filaPintar] : [filaConstruir] } as Contenido;
  }
  // v7 «Chat»: the last lines of the page's chat (the same list the computer's box shows) and the quick phrases. A phrase goes the
  // computer's way — `chat.decir(texto, "cerca")` — so the page's pace and the server's rules apply (a silenced person or a closed
  // entry bubble sends nothing; the server's own notice comes back as a line). No virtual keyboard yet: typing stays on the computer.
  function chat(): Contenido {
    const c = o.n().chat as { lineas: readonly LineaChat[]; decir(t: string, canal?: "cerca" | "zona"): { ok: boolean; why?: string } } | undefined;
    if (!c?.lineas) return { tipo: "chat", titulo: "Chat", mensajes: [], vacio: tx("This world has no chat.", "Este mundo no tiene chat."), frases: FRASES.map((texto) => ({ texto, accion: () => {}, estilo: "desactivado" as const })) } as Contenido;
    return { tipo: "chat", titulo: "Chat", mensajes: ultimosMensajes(c.lineas), vacio: tx("No messages yet. Tap a phrase to say something.", "Aún no hay mensajes. Toca una frase para decir algo."),
      nota: tx("People within 20 m can read you. To type: the computer keyboard.", "Te leen quienes están a menos de 20 m. Para escribir: el teclado del ordenador."),
      frases: FRASES.map((texto) => ({ texto, accion: () => { const r = c.decir(texto, "cerca"); if (!r.ok) nota(r.why ?? tx("Could not say it.", "No se pudo decir.")); } })) } as Contenido;
  }
  function ajustes(): Contenido {
    const a = o.n().ajustes;
    if (!a?.lista) return { tipo: "lista", titulo: tx("VR settings", "Ajustes de VR"), vacio: tx("Settings are not ready yet.", "Los ajustes aún no están listos."), filas: [] } as Contenido;
    const todos = a.lista() as { id: string; nombre: string; tipo: string; valor: unknown; visible: boolean; min?: number; max?: number; paso?: number; unidad?: string; opciones?: { valor: unknown; nombre: string }[] }[];
    const filas: Fila[] = [];
    for (const id of AJUSTES_VR) {
      const s = todos.find((x) => x.id === id);
      if (!s) continue;
      const cambia = (p: 1 | -1) => () => { const r = a.set(id, siguienteValor(s, p)); if (r && r.ok === false) nota(r.why ?? tx("Could not.", "No se pudo.")); };
      filas.push({ texto: s.nombre, detalle: textoValor(s), icono: "gear",
        botones: s.tipo === "booleano" ? [{ texto: s.valor ? tx("Yes", "Sí") : tx("No", "No"), accion: cambia(1), estilo: s.valor ? "accion" : "normal", ancho: 140 }]
          : [{ icono: "minus", accion: cambia(-1) }, { icono: "plus", accion: cambia(1) }] });
    }
    filas.push(...esteMundo());
    return { tipo: "lista", titulo: tx("VR settings", "Ajustes de VR"), nota: tx("The other settings are on the computer (O key).", "Los demás ajustes, en el ordenador (tecla O)."), vacio: tx("This device has no VR settings.", "Este aparato no tiene ajustes de VR."), filas } as Contenido;
  }
  // «Este mundo» (funciones/v3): the Entorno panel's «Funciones de este mundo» rows, from the same pure panel (features/funciones/panel.ts):
  // same rows, same words, the server's own state; only builders see it; a function the server fixes has its button off. It only asks.
  function esteMundo(): Fila[] {
    const f = o.n().funciones as { estado: { ultimoRechazo: string }; actual(): Record<string, boolean>; fija(x: Funcion): boolean; ponerFuncion(x: Funcion, si: boolean): { ok: boolean; why?: string } } | undefined;
    if (!f?.actual) return [];
    const lang = typeof document !== "undefined" ? document.documentElement?.lang : "";
    const fija: Partial<Record<Funcion, boolean>> = {}; for (const x of FUNCIONES) fija[x] = f.fija(x);
    return filasEsteMundoVR({ actual: f.actual(), fija, puede: o.puedeConstruir() }, lang).map((r): Fila => {
      if (r.tipo === "encabezado") return { texto: r.texto, detalle: r.detalle, icono: "globe-hemisphere-west" };
      if (r.tipo === "nota") return { texto: r.texto, icono: "lock-key", color: "#C4B5A6" };
      const fn = r.funcion!;
      const pulsa = () => {
        if (f.fija(fn)) { nota(textoCambio(fn, "fija", lang)); return; }
        const res = f.ponerFuncion(fn, r.quiero!);
        if (!res.ok) { nota(`No: ${res.why ?? tx("could not", "no se pudo")}`); return; }
        nota(textoCambio(fn, r.quiero ? "encendiendo" : "apagando", lang));
        setTimeout(() => { // the server answers on its own time: say what it did, or why it refused
          if (f.estado.ultimoRechazo) { nota(`No: ${f.estado.ultimoRechazo}`); f.estado.ultimoRechazo = ""; }
          else if (f.actual()[fn] === r.quiero) nota(textoCambio(fn, r.quiero ? "encendida" : "apagada", lang));
        }, 500);
      };
      return { texto: r.texto, detalle: r.detalle, icono: "gear", botones: [{ texto: r.boton, accion: pulsa, estilo: r.estilo, ancho: 200 }] };
    });
  }
  function verAvisos(): Contenido {
    vistos = totalAvisos;
    const hora = (t: number) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
    return { tipo: "lista", titulo: tx("Notices", "Avisos"), vacio: tx("No notices yet.", "No hay avisos todavía."), filas: avisos.map((x) => ({ texto: x.texto, detalle: hora(x.t), icono: "bell" })) } as Contenido;
  }
  // MIS-222 «Obra»: pressing a hole in VR opens the menu here (huecos.ts → elegirObra): no file picker exists in a headset, so the
  // images the world already has are listed, each with «Poner». The server measures and fits it; the note says how it went.
  let huecoObra = "";
  function obra(): Contenido {
    const v = vistaObra(o.obra ? o.obra.hueco(huecoObra) : null, o.obra ? o.obra.imagenes() : []);
    return { tipo: "lista", titulo: v.titulo, nota: v.nota, vacio: v.vacio, filas: v.filas.map((f): Fila => ({ texto: f.texto, detalle: f.detalle, icono: f.icono,
      botones: f.boton ? [{ texto: f.boton.texto, ancho: f.boton.ancho, estilo: f.boton.estilo, accion: () => ponerObra(f.boton!.poner) }] : undefined })) } as Contenido;
  }
  function ponerObra(i: ImagenObra): void {
    const h = o.obra?.hueco(huecoObra) ?? null, p = pedidoPoner(h, i, o.puedeConstruir());
    if (!p.ok || !o.obra) { nota(p.ok ? tx("Artworks cannot be placed here.", "Aquí no se pueden poner obras.") : p.why); return; }
    nota(tx(`Placing «${nombreObra(i)}»…`, `Poniendo «${nombreObra(i)}»…`));
    void o.obra.poner(p.id, p.sha, p.ext, p.nombre).then((r) => {
      if (r.ok) { nota(tx(`Hung in the slot: «${nombreObra(i)}».`, `Colgada en el hueco: «${nombreObra(i)}».`)); vr.menu.cerrar(); } // done: back to the gallery, the picture is on the wall
      else nota(tx(`Could not: ${r.texto || "the server did not answer"}`, `No se pudo: ${r.texto || "el servidor no contestó"}`));
    });
  }
  /** A hole was pressed inside VR: open the menu on its «Obra» view. */
  const elegirObra = (id: string): void => {
    huecoObra = id;
    if (vr.menu.abierto) vr.menu.ir("obra"); else vr.alternarMenu("obra");
  };
  const porVista: Record<string, () => Contenido> = { tu, gente, bolsa, misiones, mapa, construir, ajustes, chat, avisos: verAvisos, obra };
  vr.menuProveedor({
    contenido: (v) => (porVista[v] ?? tu)(),
    // «Construir» is never greyed out: pressed without the role it says why (an invited guest: «Entra con tu nombre para construir»)
    desactivadas: () => new Set(),
    hora,
    alAbrir: (v) => { if (v === "gente") { const r = o.n().viajar?.pedirGente?.(); if (r && !r.ok && r.why) nota(r.why); } },
  });
  // `contenido`: what a view shows now (for checks, e.g. the text «Construir» gives a guest)
  return { avisos: () => avisos.map((x) => x.texto), contenido: (v: string) => (porVista[v] ?? tu)(), elegirObra };
}
