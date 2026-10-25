// Rediseño v2 (story E, maquetas p6/p7): what the VR watch and the VR menu show, from the SAME sources the computer's
// panels read (`globalThis.__numinia`: ficha/estado/carga, viajar + gente, inventario, misiones, mapa, ajustes) — in VR
// the HTML panels are not drawn, so the menu (packages/render/src/menu-invocado.ts) is a canvas the page fills here.
// Also what the watch's buttons do: microphone = the Q key (voz.alternar), camera = the photo mode's shot, notices =
// the last things the page announced (paneles.ts alAnunciar), back to the city = mundo.ajustes.json `ciudadUrl`.
// Not yet tried on a real Quest (only the IWER emulator and pictures of the canvases).
import { alAnunciar } from "./paneles.ts";
import { pathsIcono } from "./iconos.ts";
import { resumenTexto } from "./inventario.ts";
import { sonar } from "./sonar.ts";
import { ESCALERA } from "./ficha.ts";
import { listaGenteVR, textos } from "./gente-ia.ts";
import { distanciaTexto } from "./amigos.ts";
import { AYUDA_RAYO, TEXTO_FUERA_DE_VR, esInvitado, vistaConstruirVR } from "./construir-vr-logica.ts";
import { iconoDe } from "../../packages/render/src/menu-secciones.ts";
import type { MenuVR, ContenidoMenuVR as Contenido } from "../../packages/render/src/index.ts";
import { siguienteValor, textoValor } from "../../packages/render/src/menu-vr.ts";
import { FRASES, ultimosMensajes, type LineaChat } from "../../packages/render/src/menu-chat.ts";
import { filasEsteMundoVR } from "../../features/funciones/menu-vr.ts";
import { textoCambio } from "../../features/funciones/panel.ts";
import { FUNCIONES } from "../../features/funciones/feature.ts";
import type { Funcion } from "../../features/funciones/feature.ts";

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
  /** Your name. */
  nombre: () => string;
}) {
  const { vr } = o;
  vr.iconos(pathsIcono);
  // row buttons are outlined («normal»): one filled main button per view at most (BRIEF: tema Nocturno)
  // notices: what the page announced while you were in VR (the HTML stack is not drawn in the headset)
  const avisos: { texto: string; t: number }[] = [];
  let vistos = 0, totalAvisos = 0;
  alAnunciar((texto) => { if (!texto) return; avisos.unshift({ texto, t: Date.now() }); totalAvisos++; if (avisos.length > AVISOS_MAX) avisos.length = AVISOS_MAX; });
  const nota = (t: string) => { try { vr.nota(t); } catch { /* VR off */ } };

  vr.relojEstado(() => {
    const n = o.n(), voz = n.voz, foto = n.foto;
    return { micro: voz?.estado ? !!voz.estado.encendido : null, camara: !!foto?.disparar, avisos: Math.min(99, totalAvisos - vistos), ciudad: !!o.ciudadUrl };
  });
  vr.onPulsa(() => { try { sonar("ui-pulsar"); } catch { /* no sound here */ } });
  vr.onReloj((b) => {
    const n = o.n();
    if (b === "micro") { if (n.voz?.alternar) { n.voz.alternar(); setTimeout(() => nota(n.voz.estado.encendido ? "Micrófono abierto" : "Micrófono cerrado"), 400); } else nota("Aquí no hay voz."); }
    else if (b === "camara") {
      const f = n.foto;
      if (!f?.disparar) { nota("Aquí no hay modo foto."); return; }
      const ya = f.activo?.();
      void f.disparar().then((r: { ok: boolean; error?: string }) => { if (!ya) f.cerrar?.(); nota(r.ok ? "Foto hecha: está en el modo foto de la página." : `No se pudo hacer la foto: ${r.error ?? "?"}`); });
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
    if (r && !r.ok) nota(r.why ?? "No se pudo."); else { nota(`Vas con ${nombre}…`); vr.menu.cerrar(); }
  };
  function tu(): Contenido {
    const n = o.n();
    const e = n.estado?.actual?.() as string | undefined, i = e ? ESCALERA.indexOf(e as (typeof ESCALERA)[number]) : -1;
    const chip = i < 0 ? { texto: "Estable", tono: "ok" as const } : { texto: ESCALERA[i], tono: (i >= 2 ? "mal" : "aviso") as "mal" | "aviso" };
    const inv = n.inventario, r = typeof inv?.resumen === "function" ? inv.resumen() : null;
    const c = n.carga?.actual?.() as { valor: number; max: number } | null | undefined;
    let ins: string[] = [];
    try { const s = n.misiones?.resumen?.(); if (s && Array.isArray(s.insignias)) ins = s.insignias.map(String); } catch { /* no quests */ }
    const who = n.session?.who as { id: string } | null | undefined;
    return {
      tipo: "tu", nombre: o.nombre(), linea: who ? o.linea() || "En VR" : "Esperando al servidor…", chip,
      reserva: r ? resumenTexto(r) : null, carga: c && c.max > 0 ? { valor: c.valor, max: c.max } : null,
      insignias: ins.map((nombre) => ({ nombre, conseguida: true })), retrato: o.retrato(),
    } as Contenido;
  }
  function gente(): Contenido {
    const n = o.n(), v = n.viajar;
    if (!n.gente || !v) return { tipo: "lista", titulo: "Gente", vacio: "Este mundo no enseña a la gente conectada.", filas: [] } as Contenido;
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
      : { texto: p.nombre, detalle: p.detalle || undefined, icono: "user", botones: [{ texto: "Ir a su lado", accion: ir(p.quien, p.nombre), estilo: activo ? "normal" : "desactivado", ancho: 260 }] });
    return { tipo: "lista", titulo: `Gente aquí${v.estado?.todos || gente.length ? ` · ${cuenta}` : ""}`, nota: activo ? "«Ir a su lado» te lleva junto a esa persona." : "En este mundo ahora no se puede ir junto a otros.",
      vacio: v.estado?.pedida ? "Ahora no hay nadie más en este mundo." : "Pidiendo la lista…", filas } as Contenido;
  }
  function bolsa(): Contenido {
    const inv = o.n().inventario, r = typeof inv?.resumen === "function" ? inv.resumen() : null;
    if (!r) return { tipo: "lista", titulo: "Bolsa", vacio: "Este servidor no lleva inventario.", filas: [] } as Contenido;
    const lista = (inv.lista?.() ?? []) as { nombre: string; n: number; portado: boolean; tipo?: string }[];
    return { tipo: "lista", titulo: "Bolsa", nota: resumenTexto(r), vacio: resumenTexto(r),
      filas: lista.map((x) => ({ texto: x.n > 1 ? `${x.nombre} × ${x.n}` : x.nombre, detalle: x.portado ? "Contigo" : "Guardado", icono: x.tipo === "captura" ? "fish" : "package" })) } as Contenido;
  }
  function misiones(): Contenido {
    const m = o.n().misiones;
    if (!m?.libro) return { tipo: "lista", titulo: "Misiones", vacio: "Todavía no hay misiones en esta zona.", filas: [] } as Contenido;
    const libro = m.libro() as { id: string; titulo: string; estado: string; paso: number; pasos: number; seguida: boolean; lista: { n: number; texto: string; hecho: boolean }[] }[];
    const seg = libro.find((x) => x.seguida && x.estado === "activa"), filas: Fila[] = [];
    if (seg) for (const p of seg.lista) filas.push({ texto: p.texto, icono: p.hecho ? "check" : p.n === seg.paso ? "target" : "scroll", color: p.hecho ? "#8FC46B" : p.n === seg.paso ? "#F9EBDC" : "#C4B5A6" });
    for (const x of libro.filter((x) => x.estado === "activa" && x !== seg))
      filas.push({ texto: x.titulo, detalle: `Paso ${x.paso + 1} de ${x.pasos}`, icono: "scroll", botones: [{ texto: "Seguir", accion: () => { m.seguir(x.id); }, ancho: 180 }] });
    const hechas = libro.filter((x) => x.estado === "hecha").length;
    return { tipo: "lista", titulo: seg ? `★ ${seg.titulo} · ${seg.paso + 1}/${seg.pasos}` : "Misiones", nota: hechas ? `Terminadas: ${hechas}` : undefined,
      vacio: libro.length ? "No sigues ninguna misión." : "No llevas ninguna misión: habla con quien tenga una para ti.", filas } as Contenido;
  }
  function mapa(): Contenido {
    const mp = o.n().mapa;
    if (!mp?.marcadores) return { tipo: "lista", titulo: "Mapa", vacio: "Este mundo no tiene mapa.", filas: [] } as Contenido;
    const marc = mp.marcadores() as { id: string; tipo: string; nombre: string; x: number; z: number; yaw?: number }[];
    const tipo = (t: string) => mp.registro?.tipo?.(t) ?? { color: "#C4B5A6", enLista: true, orden: 0 };
    const tu = marc.find((x) => x.tipo === "tu"), puede = mp.puedeIr?.() ?? false;
    const sitios = marc.filter((x) => x.tipo !== "tu" && tipo(x.tipo).enLista).sort((a, b) => tipo(b.tipo).orden - tipo(a.tipo).orden);
    const filas: Fila[] = sitios.map((s) => ({ texto: s.nombre, detalle: tipo(s.tipo).nombre, color: undefined, icono: "map-pin",
      botones: [{ texto: "Ir", accion: () => { vigilarViaje(); mp.ir?.(s); nota(`Vas a ${s.nombre}…`); vr.menu.cerrar(); }, estilo: puede ? "normal" : "desactivado", ancho: 120 }] }));
    if (mp.puedeVolver?.()) filas.unshift({ texto: "Donde estabas", icono: "arrow-u-up-left", botones: [{ texto: "Volver", accion: () => { mp.volver(); vr.menu.cerrar(); }, ancho: 160 }] });
    return { tipo: "mapa", titulo: "Sitios", yo: tu ? { x: tu.x, z: tu.z, rumbo: tu.yaw !== undefined ? (tu.yaw * 180) / Math.PI : 0 } : null,
      puntos: sitios.slice(0, 80).map((s) => ({ nombre: s.nombre, x: s.x, z: s.z, color: tipo(s.tipo).color })), filas, vacio: "No hay sitios marcados en esta zona." } as Contenido;
  }
  function construir(): Contenido {
    const who = o.n().session?.who as { id: string; nombre: string } | null | undefined;
    const v = vistaConstruirVR({ puede: o.puedeConstruir(), invitado: esInvitado(who), activo: o.construirVR.activo() });
    if (v.tipo === "negado") return { tipo: "lista", titulo: "Construir", vacio: v.texto, filas: [] } as Contenido;
    const empezar = v.tipo === "listo";
    return { tipo: "lista", titulo: empezar ? "Construir en VR" : "Construyendo", nota: AYUDA_RAYO, vacio: "",
      filas: [{ texto: v.titulo, detalle: v.detalle, icono: iconoDe("construir"),
        botones: [{ texto: v.boton, estilo: empezar ? "accion" : "normal", ancho: 260, accion: () => {
          if (!empezar) { o.construirVR.salir(); nota("Has dejado de construir."); vr.menu.cerrar(); return; }
          const r = o.construirVR.entrar();
          if (r.ok) { nota("Construir: apunta a una cosa y aprieta el gatillo."); vr.menu.cerrar(); } else nota(r.why ?? TEXTO_FUERA_DE_VR);
        } }] }] } as Contenido;
  }
  // v7 «Chat»: the last lines of the page's chat (the same list the computer's box shows) and the quick phrases. A phrase goes the
  // computer's way — `chat.decir(texto, "cerca")` — so the page's pace and the server's rules apply (a silenced person or a closed
  // entry bubble sends nothing; the server's own notice comes back as a line). No virtual keyboard yet: typing stays on the computer.
  function chat(): Contenido {
    const c = o.n().chat as { lineas: readonly LineaChat[]; decir(t: string, canal?: "cerca" | "zona"): { ok: boolean; why?: string } } | undefined;
    if (!c?.lineas) return { tipo: "chat", titulo: "Chat", mensajes: [], vacio: "Este mundo no tiene chat.", frases: FRASES.map((texto) => ({ texto, accion: () => {}, estilo: "desactivado" as const })) } as Contenido;
    return { tipo: "chat", titulo: "Chat", mensajes: ultimosMensajes(c.lineas), vacio: "Aún no hay mensajes. Toca una frase para decir algo.",
      nota: "Te leen quienes están a menos de 20 m. Para escribir: el teclado del ordenador.",
      frases: FRASES.map((texto) => ({ texto, accion: () => { const r = c.decir(texto, "cerca"); if (!r.ok) nota(r.why ?? "No se pudo decir."); } })) } as Contenido;
  }
  function ajustes(): Contenido {
    const a = o.n().ajustes;
    if (!a?.lista) return { tipo: "lista", titulo: "Ajustes de VR", vacio: "Los ajustes aún no están listos.", filas: [] } as Contenido;
    const todos = a.lista() as { id: string; nombre: string; tipo: string; valor: unknown; visible: boolean; min?: number; max?: number; paso?: number; unidad?: string; opciones?: { valor: unknown; nombre: string }[] }[];
    const filas: Fila[] = [];
    for (const id of AJUSTES_VR) {
      const s = todos.find((x) => x.id === id);
      if (!s) continue;
      const cambia = (p: 1 | -1) => () => { const r = a.set(id, siguienteValor(s, p)); if (r && r.ok === false) nota(r.why ?? "No se pudo."); };
      filas.push({ texto: s.nombre, detalle: textoValor(s), icono: "gear",
        botones: s.tipo === "booleano" ? [{ texto: s.valor ? "Sí" : "No", accion: cambia(1), estilo: s.valor ? "accion" : "normal", ancho: 140 }]
          : [{ icono: "minus", accion: cambia(-1) }, { icono: "plus", accion: cambia(1) }] });
    }
    filas.push(...esteMundo());
    return { tipo: "lista", titulo: "Ajustes de VR", nota: "Los demás ajustes, en el ordenador (tecla O).", vacio: "Este aparato no tiene ajustes de VR.", filas } as Contenido;
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
        if (!res.ok) { nota(`No: ${res.why ?? "no se pudo"}`); return; }
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
    return { tipo: "lista", titulo: "Avisos", vacio: "No hay avisos todavía.", filas: avisos.map((x) => ({ texto: x.texto, detalle: hora(x.t), icono: "bell" })) } as Contenido;
  }
  const porVista: Record<string, () => Contenido> = { tu, gente, bolsa, misiones, mapa, construir, ajustes, chat, avisos: verAvisos };
  vr.menuProveedor({
    contenido: (v) => (porVista[v] ?? tu)(),
    // «Construir» is never greyed out: pressed without the role it says why (an invited guest: «Entra con tu nombre para construir»)
    desactivadas: () => new Set(),
    alAbrir: (v) => { if (v === "gente") { const r = o.n().viajar?.pedirGente?.(); if (r && !r.ok && r.why) nota(r.why); } },
  });
  // `contenido`: what a view shows now (for checks, e.g. the text «Construir» gives a guest)
  return { avisos: () => avisos.map((x) => x.texto), contenido: (v: string) => (porVista[v] ?? tu)() };
}
