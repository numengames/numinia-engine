// avatares (J1): you and the nearest players drawn as VRM humanoids; everybody else stays a capsule.
// Decisions live in avatares-politica.ts (pure, tested); the heavy part (three-vrm, the glTF loader) is a dynamic
// import (avatares-vrm.ts) that starts after the first frame, so the start bundle does not grow.
// The capsules stay as anchors: labels, bounces, the camera and the jump read them; a capsule that has a VRM is only
// hidden from every camera (layers), never `.visible = false`, so those keep working.
import * as THREE from "three/webgpu";
import { ANIMAR_HASTA_M, FUNDIDO_S, clipPara, cupoVRM, elegirAvatar, elegirCercanos, estadoPor, nuevaMarcha, seguir } from "./avatares-politica.ts";
import type { Clip, Estado, Marcha } from "./avatares-politica.ts";
import type { Copia, Plantilla } from "./avatares-vrm.ts";
import type { VRMAnimation } from "@pixiv/three-vrm-animation";

/** What the page gives: the house avatars (VRM) and animations (VRMA), by URL. */
export type CatalogoAvatares = {
  modelos: { nombre: string; url: string }[];
  animaciones: Partial<Record<Clip, { url: string; pasoPorCadera: number }>>;
};
export type EstadoAvatar = { id: number | "yo"; modelo: string; estado: Estado; clip: Clip | null; dibujado: boolean; cerca: boolean };

const ALTURA_CAPSULA = 0.85; // capsule centre over the ground (index.ts): the VRM stands at capsule.y − this
const REPASO_MS = 500;       // who wears a VRM is decided twice a second
const POZA = 8;              // spare copies kept per file for players who come and go
const PRIMERO: Clip[] = ["quieto", "andar", "trotar"]; // asked for with the first avatar; the rest when first needed

type Vrm = typeof import("./avatares-vrm.ts");
type Avatar = {
  clave: number | "yo"; modelo: number; marcha: Marcha; estado: Estado; copia?: Copia;
  clip?: Clip; accion?: THREE.AnimationAction; saliente?: THREE.AnimationAction; fundidoHasta: number;
  ancla?: THREE.Object3D; mascara?: number; cerca: boolean;
};

export function createAvatares(o: { world: THREE.Object3D; mobile: boolean; xr: () => boolean; catalogo?: CatalogoAvatares; yo?: () => number; compilar?: (raiz: THREE.Object3D) => Promise<unknown>; suelo?: (x: number, z: number, y: number) => number }) {
  const cat = o.catalogo;
  const n = cat?.modelos.length ?? 0;
  let vrm: Promise<{ m: Vrm; carga: ReturnType<Vrm["crearCargador"]> }> | null = null;
  let modulo: Vrm | null = null; // the heavy half, once it has arrived
  const herramientas = () => (vrm ??= import("./avatares-vrm.ts").then((m) => { modulo = m; return { m, carga: m.crearCargador() }; }));
  const plantillas = new Map<number, Plantilla>(), pedidas = new Set<number>(), fallidas = new Set<number>();
  const anims = new Map<Clip, VRMAnimation>(), animPedidas = new Set<Clip>();
  const poza = new Map<number, Copia[]>();
  const avatares = new Map<number | "yo", Avatar>();
  let cargando = 0, errores = 0, cuadros = 0, ultimoRepaso = -Infinity, antes = -1, ocupado = false;
  let conVrm = new Set<number>();
  const natural: Partial<Record<Clip, number>> = {};
  for (const [c, a] of Object.entries(cat?.animaciones ?? {})) natural[c as Clip] = a!.pasoPorCadera;

  const fallo = (que: string, e: unknown) => { errores++; console.warn(`[avatares] ${que}: ${(e as Error)?.message ?? e}`); };
  function pedirModelo(i: number): void {
    if (pedidas.has(i) || !cat) return;
    pedidas.add(i); cargando++;
    for (const c of PRIMERO) pedirAnim(c);
    herramientas().then(async ({ m, carga }) => {
      const p = await carga.modelo(cat.modelos[i].url);
      // compile its shaders before the first draw (a first draw that compiles stalls the page and the 20 Hz input
      // ticks behind it are lost); compiled away from the camera, so nothing culls it; the copy waits in the pool
      const primera = m.copiar(p);
      primera.raiz.traverse((x) => { x.frustumCulled = false; });
      await o.compilar?.(primera.raiz).catch(() => {});
      primera.raiz.traverse((x) => { x.frustumCulled = true; });
      poza.set(i, [...(poza.get(i) ?? []), primera]);
      plantillas.set(i, p);
    })
      .catch((e) => { fallidas.add(i); fallo(`no se pudo cargar ${cat.modelos[i].url}`, e); })
      .finally(() => { cargando--; });
  }
  function pedirAnim(c: Clip): void {
    const a = cat?.animaciones[c];
    if (!a || animPedidas.has(c)) return;
    animPedidas.add(c); cargando++;
    herramientas().then(({ carga }) => carga.animacion(a.url))
      .then((x) => { anims.set(c, x); })
      .catch((e) => fallo(`no se pudo cargar la animación ${c}`, e))
      .finally(() => { cargando--; });
  }

  function vestir(a: Avatar, m: Vrm, p: Plantilla): void {
    a.copia = poza.get(a.modelo)?.pop() ?? m.copiar(p);
    o.world.add(a.copia.raiz);
  }
  function desvestir(a: Avatar): void {
    if (a.ancla && a.mascara !== undefined) a.ancla.layers.mask = a.mascara; // the capsule comes back
    a.mascara = undefined;
    const c = a.copia;
    if (!c) return;
    c.mixer.stopAllAction();
    c.raiz.removeFromParent();
    const libres = poza.get(a.modelo) ?? [];
    if (libres.length < POZA) { libres.push(c); poza.set(a.modelo, libres); }
    else void herramientas().then(({ m }) => m.soltar(c));
    a.copia = undefined; a.accion = undefined; a.saliente = undefined; a.clip = undefined;
  }

  function poner(a: Avatar, clip: Clip, ahora: number, m: Vrm): void {
    const c = a.copia!;
    const nueva = c.mixer.clipAction(m.clipDe(c.plantilla, clip, anims.get(clip)!));
    if (a.saliente && a.saliente !== nueva) a.saliente.stop(); // a third clip mid-fade: the oldest goes
    a.saliente = undefined;
    nueva.reset(); nueva.setEffectiveWeight(1); nueva.setEffectiveTimeScale(1); nueva.play();
    if (a.accion && a.accion !== nueva) { nueva.crossFadeFrom(a.accion, FUNDIDO_S, false); a.saliente = a.accion; a.fundidoHasta = ahora + FUNDIDO_S * 1000; }
    a.accion = nueva; a.clip = clip;
  }

  function actualizar(a: Avatar, ancla: THREE.Object3D, oculto: boolean, desde: { x: number; z: number } | null, ahora: number, dt: number, m: Vrm | null): void {
    const pos = ancla.position;
    seguir(a.marcha, pos.x, pos.z, dt);
    const altura = pos.y - ALTURA_CAPSULA;
    a.estado = estadoPor(a.marcha.velocidad, altura - (o.suelo?.(pos.x, pos.z, altura) ?? 0)); // over the ground under you
    a.cerca = a.clave === "yo" || !desde || Math.hypot(pos.x - desde.x, pos.z - desde.z) <= ANIMAR_HASTA_M;
    if (fallidas.has(a.modelo)) return;
    const p = plantillas.get(a.modelo);
    if (!p) { pedirModelo(a.modelo); return; }
    if (!m) return;
    const hay = (c: Clip) => anims.has(c);
    const quiere = clipPara(a.estado, a.marcha.velocidad, p.cadera, natural, (c) => !!cat?.animaciones[c]);
    if (quiere && !hay(quiere.clip)) pedirAnim(quiere.clip);
    if (!a.copia) {
      // dressed only when a first clip is there: never a frame of T-pose
      const primero = clipPara(a.estado, a.marcha.velocidad, p.cadera, natural, hay);
      if (!primero) return;
      vestir(a, m, p);
      poner(a, primero.clip, ahora, m);
    }
    const c = a.copia!;
    if (a.ancla !== ancla) { if (a.ancla && a.mascara !== undefined) a.ancla.layers.mask = a.mascara; a.ancla = ancla; a.mascara = undefined; }
    if (a.mascara === undefined) { a.mascara = ancla.layers.mask; ancla.layers.mask = 0; }
    c.raiz.position.set(pos.x, altura, pos.z);
    c.raiz.rotation.y = a.marcha.rumbo;
    c.raiz.visible = !oculto;
    // keep the old clip until the new one has loaded, then fade (SABER §3.4)
    if (quiere && quiere.clip !== a.clip && hay(quiere.clip)) poner(a, quiere.clip, ahora, m);
    if (a.saliente && ahora > a.fundidoHasta) { a.saliente.stop(); a.saliente = undefined; }
    if (a.accion && quiere && quiere.clip === a.clip) a.accion.setEffectiveTimeScale(quiere.ritmo);
    if (a.cerca && !oculto) { c.mixer.update(dt); c.humanoid.update(); } // far ones stand still (cold phones)
  }

  return {
    /** After the capsules are placed: who wears a VRM, where, facing where, with which clip. */
    sync(yo: THREE.Object3D | null, otros: Map<number, THREE.Object3D>, primeraPersona: boolean, ahora: number): void {
      if (!n) return;
      const dt = antes < 0 ? 0 : Math.min(0.25, (ahora - antes) / 1000);
      antes = ahora;
      if (++cuadros < 2) return; // after the first frame: the plaza shows before any avatar is asked for
      const desde = yo ? { x: yo.position.x, z: yo.position.z } : null;
      if (ahora - ultimoRepaso >= REPASO_MS) {
        ultimoRepaso = ahora;
        const lista = [...otros].map(([id, m]) => ({ id, x: m.position.x, z: m.position.z }));
        conVrm = elegirCercanos(desde, lista, cupoVRM({ mobile: o.mobile, xr: o.xr() }), conVrm);
      }
      const quien = new Set<number | "yo">();
      if (yo) {
        quien.add("yo");
        const modelo = elegirAvatar(Math.max(0, o.yo?.() ?? 0), n);
        let a = avatares.get("yo");
        if (a && a.modelo !== modelo) { desvestir(a); avatares.delete("yo"); a = undefined; }
        if (!a) { a = { clave: "yo", modelo, marcha: nuevaMarcha(), estado: "quieto", fundidoHasta: 0, cerca: true }; avatares.set("yo", a); }
        actualizar(a, yo, primeraPersona || o.xr(), desde, ahora, dt, modulo);
      }
      for (const id of conVrm) {
        const ancla = otros.get(id);
        if (!ancla) continue;
        quien.add(id);
        let a = avatares.get(id);
        if (!a) { a = { clave: id, modelo: elegirAvatar(id, n), marcha: nuevaMarcha(), estado: "quieto", fundidoHasta: 0, cerca: true }; avatares.set(id, a); }
        actualizar(a, ancla, false, desde, ahora, dt, modulo);
      }
      for (const [k, a] of avatares) if (!quien.has(k)) { desvestir(a); avatares.delete(k); }
      ocupado = cargando > 0 || [...avatares.values()].some((a) => a.copia && a.cerca && (a.estado !== "quieto" || ahora < a.fundidoHasta));
    },
    /** Loading, fading, or someone near moving: keep drawing. A near avatar standing idle does not (it breathes at the idle frame rate). */
    busy(): boolean { return ocupado; },
    /** For checks and the HUD: files, clips, and who wears what. */
    stats(): { cupo: number; modelos: { pedidos: number; cargados: number; fallidos: number }; animaciones: string[]; dibujados: number; errores: number; lista: EstadoAvatar[] } {
      const lista: EstadoAvatar[] = [...avatares.values()].map((a) => ({ id: a.clave, modelo: cat?.modelos[a.modelo]?.nombre ?? "", estado: a.estado, clip: a.clip ?? null, dibujado: !!a.copia?.raiz.visible && !!a.copia?.raiz.parent, cerca: a.cerca }));
      return { cupo: cupoVRM({ mobile: o.mobile, xr: o.xr() }), modelos: { pedidos: pedidas.size, cargados: plantillas.size, fallidos: fallidas.size }, animaciones: [...anims.keys()], dibujados: lista.filter((a) => a.dibujado).length, errores, lista };
    },
  };
}
