// entorno (H4 + H12): the sky, the sun and its shadows, the light of the environment (from the sky itself or an HDR
// file), fog, the wind (a uniform for whatever the wind moves), the textured ground, tone and exposure — all from DATA
// (the flat fields of features/entorno, read by name) and chosen by device capability (calidad.ts). Phones get the
// sky baked into a cube once per change (no per-pixel atmosphere), no shadows and no HDR light by default.
import * as THREE from "three/webgpu";
import { uniform, mix, smoothstep, normalize, positionLocal, vec3 } from "three/tsl";
import { CALIDAD_POR_NIVEL, SOMBRA_PX, CIELO_LUZ_PX, nivelDe, capacidades, acotarCalidad } from "./calidad.ts";
import type { Calidad, Nivel } from "./calidad.ts";

/** The environment as features/entorno sends it (flat fields) plus the ground's files resolved by its client part. */
export type EntornoDatos = Record<string, unknown>;
export type EntornoHooks = {
  renderer: THREE.WebGPURenderer; scene: THREE.Scene; world: THREE.Group; camera: THREE.PerspectiveCamera;
  hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; ground: THREE.Mesh; grid: THREE.Object3D; hitos: THREE.Object3D[];
  aparato: { mobile: boolean; deviceMemoryGB?: number; saveData?: boolean };
  /** "<sha256>.<ext>" → its URL on the instance's server (/a/…). */
  fichero: (nombre: string) => string;
  /** Where the player is (the shadow box follows it). */
  foco: () => { x: number; z: number } | null;
};

const TONOS: Record<string, THREE.ToneMapping> = { agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping, neutro: THREE.NeutralToneMapping, ninguno: THREE.NoToneMapping };
const RAD = Math.PI / 180;
const noche1 = new THREE.Color(), noche2 = new THREE.Color(); // night ambient tints (see aplicar)
const n = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const hex = (c: THREE.Color) => `#${c.getHexString()}`;
/** Direction (unit) for an altitude over the horizon and a bearing from north (−z) towards east (+x), in degrees. */
export function direccion(altura: number, rumbo: number, out = new THREE.Vector3()): THREE.Vector3 {
  const a = altura * RAD, r = rumbo * RAD;
  return out.set(Math.cos(a) * Math.sin(r), Math.sin(a), -Math.cos(a) * Math.cos(r));
}

type Sky = THREE.Mesh & { turbidity: { value: number }; rayleigh: { value: number }; mieCoefficient: { value: number }; mieDirectionalG: { value: number }; sunPosition: { value: THREE.Vector3 }; cloudCoverage: { value: number }; cloudDensity: { value: number }; showSunDisc: { value: number } };

export function crearEntorno(h: EntornoHooks) {
  const { renderer, scene, world, camera, hemi, sun, ground, grid } = h;
  renderer.shadowMap.enabled = true; // each light's castShadow decides; turning it on later would recompile everything
  scene.add(sun.target);
  ground.receiveShadow = true; ground.userData.sinSombra = true;
  grid.userData.sinSombra = true;

  const solDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize(); // where the sun is (for the sky, water glints)
  const luzDir = solDir.clone();                                  // where the light comes from (the moon at night)
  const viento = new THREE.Vector3();                             // m/s on the ground plane: what the wind pushes
  const vientoU = uniform(viento);                                // the same, for shaders (particles, later grass)
  const solColorU = uniform(new THREE.Color(0xffffff));
  let d: EntornoDatos | null = null, pendiente = false, aplicados = 0, horneados = 0, hastaMs = 0;
  let nivel: Nivel = nivelDe({ ...h.aparato, xr: false });
  let pedido: Partial<Calidad> = {};
  let calidad: Calidad = { ...CALIDAD_POR_NIVEL[nivel] };
  const avisar = () => { hastaMs = performance.now() + 500; };

  // ---- sky: the atmosphere (three's SkyMesh, lazy), a gradient dome, or a flat colour ----
  let sky: Sky | null = null;
  const cargaCielo = import("three/addons/objects/SkyMesh.js").then((m) => {
    sky = new m.SkyMesh() as unknown as Sky;
    sky.scale.setScalar(300); sky.frustumCulled = false; sky.renderOrder = -10; sky.userData.sinSombra = true; sky.name = "cielo";
    if (d) aplicar(d);
  }).catch((e) => { console.warn(`[entorno] sin cielo de atmósfera: ${(e as Error)?.message ?? e}`); });
  const arribaU = uniform(new THREE.Color(0x5d8fc9)), horizonteU = uniform(new THREE.Color(0xc9d8e4));
  // N2: what the stylised water reads (agua-estilo.ts): the horizon colour (the fog's, else the gradient's), the sun's colour and direction
  const aguaLuz = { cielo: uniform(new THREE.Color(0xc9d8e4)), sol: solColorU, solDir: uniform(new THREE.Vector3().copy(solDir)) };
  const domoMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
  domoMat.colorNode = mix(horizonteU, arribaU, smoothstep(-0.02, 0.55, normalize(positionLocal).y));
  const domo = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), domoMat);
  domo.scale.setScalar(300); domo.frustumCulled = false; domo.renderOrder = -10; domo.userData.sinSombra = true; domo.name = "cielo-degradado";
  let modoCielo: "vivo" | "horneado" | "degradado" | "color" | "imagen" | "cargando" = "cargando";

  // baking: the sky into a cube (background on phones and in XR) and into the environment light (PMREM)
  const cieloEscena = new THREE.Scene();
  const cubo = new THREE.CubeRenderTarget(256, { type: THREE.HalfFloatType });
  const cuboCam = new THREE.CubeCamera(0.5, 1000, cubo);
  // where the sky is drawn live (desktop) the fog colour only needs a tiny cube to sample the horizon from
  const muestra = new THREE.CubeRenderTarget(16, { type: THREE.HalfFloatType });
  const muestraCam = new THREE.CubeCamera(0.5, 1000, muestra);
  cieloEscena.add(cuboCam, muestraCam);
  let version = 0; // bumps with every environment applied (async results of an older one are dropped)
  /** The fog takes the colour of the sky's horizon (the average of the four side faces' middle rows, linear HDR). */
  function nieblaDelHorizonte(v: number, rt: THREE.CubeRenderTarget): void {
    const s = rt.width;
    const caras = [0, 1, 4, 5].map((f) => renderer.readRenderTargetPixelsAsync(rt, 0, s / 2 - 1, s, 2, 0, f) as Promise<ArrayLike<number>>);
    Promise.all(caras).then((bufs) => {
      if (v !== version || !(scene.fog instanceof THREE.Fog)) return;
      let r = 0, g = 0, b = 0, k = 0;
      for (const buf of bufs) for (let i = 0; i + 3 < buf.length; i += 4) {
        const half = buf instanceof Uint16Array;
        r += half ? THREE.DataUtils.fromHalfFloat(buf[i]) : buf[i]; g += half ? THREE.DataUtils.fromHalfFloat(buf[i + 1]) : buf[i + 1]; b += half ? THREE.DataUtils.fromHalfFloat(buf[i + 2]) : buf[i + 2]; k++;
      }
      if (k && Number.isFinite(r + g + b)) { scene.fog.color.setRGB(r / k, g / k, b / k, THREE.LinearSRGBColorSpace); avisar(); }
    }).catch(() => { /* keep the colour the data gave */ });
  }
  let pmrem: THREE.PMREMGenerator | null = null;
  let envRT: THREE.RenderTarget | null = null;
  let hdrTex: { nombre: string; rt: THREE.RenderTarget | null; cargando: boolean } = { nombre: "", rt: null, cargando: false };
  let fondoTex: { nombre: string; tex: THREE.Texture | null } = { nombre: "", tex: null };
  let hornearEn = 0; // when to bake next (rate limit while sliders move)
  let horneadoClave = ""; // what the last bake was made from: a change that does not touch the sky bakes nothing

  function cielosEnEscena(o: THREE.Object3D | null) {
    for (const c of [sky, domo]) if (c && c !== o && c.parent) c.parent.remove(c);
    if (o && o.parent !== world) world.add(o);
  }

  function hornear(): void {
    if (!d) return;
    const tipo = String(d.cielo);
    const fuente: THREE.Object3D | null = tipo === "atmosfera" ? sky : tipo === "degradado" || tipo === "color" ? domo : null;
    if (!fuente) return;
    const auto = d.nieblaAuto !== false && tipo === "atmosfera" && scene.fog instanceof THREE.Fog;
    const luz = calidad.hdr && !String(d.hdr ?? "");
    // the sun moves in whole degrees for this purpose: a day cycle re-bakes every few steps, not every step
    const clave = JSON.stringify([tipo, Math.round(n(d.solAltura)), Math.round(n(d.solRumbo)), d.turbidez, d.nubes, d.cieloArriba, d.cieloHorizonte, modoCielo, auto, luz]);
    if (clave === horneadoClave) { if (luz && envRT) scene.environment = envRT.texture; if (modoCielo === "horneado") scene.background = cubo.texture; return; }
    horneadoClave = clave;
    const antes = fuente.parent;
    fuente.position.set(0, 0, 0);
    cieloEscena.add(fuente);
    if (sky && fuente === sky) sky.showSunDisc.value = 0;
    try {
      if (modoCielo === "horneado") { cuboCam.update(renderer as never, cieloEscena); scene.background = cubo.texture; }
      else if (auto) muestraCam.update(renderer as never, cieloEscena);
      if (auto) nieblaDelHorizonte(version, modoCielo === "horneado" ? cubo : muestra);
      if (luz) {
        pmrem ??= new THREE.PMREMGenerator(renderer);
        // a sky without its sun disc is smooth: a small cube lights as well as a big one, for a fraction of the work
        envRT = pmrem.fromScene(cieloEscena, 0, 0.1, 1000, { size: CIELO_LUZ_PX, renderTarget: envRT });
        scene.environment = envRT.texture;
      }
      horneados++;
    } catch (e) { console.warn(`[entorno] no se pudo hornear el cielo: ${(e as Error)?.message ?? e}`); }
    if (sky && fuente === sky) sky.showSunDisc.value = 1;
    cieloEscena.remove(fuente);
    if (antes) antes.add(fuente);
    avisar();
  }

  // ---- files: HDR light, equirect background, ground textures (lazy, cached by name) ----
  const texturas = new Map<string, Promise<THREE.Texture>>();
  let cargando = 0;
  const textura = (nombre: string, color: boolean): Promise<THREE.Texture> => {
    let p = texturas.get(nombre);
    if (!p) {
      cargando++;
      p = new THREE.TextureLoader().loadAsync(h.fichero(nombre)).then((t) => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.anisotropy = h.aparato.mobile ? 2 : 8;
        return t;
      }).finally(() => { cargando--; avisar(); });
      texturas.set(nombre, p);
    }
    return p;
  };
  function cargarHdr(nombre: string): void {
    if (hdrTex.nombre === nombre) return;
    hdrTex = { nombre, rt: null, cargando: true };
    cargando++;
    import("three/addons/loaders/HDRLoader.js").then((m) => new m.HDRLoader().loadAsync(h.fichero(nombre))).then((t) => {
      if (hdrTex.nombre !== nombre) return;
      t.mapping = THREE.EquirectangularReflectionMapping;
      pmrem ??= new THREE.PMREMGenerator(renderer);
      hdrTex.rt = pmrem.fromEquirectangular(t);
      t.dispose();
      if (d && calidad.hdr && String(d.hdr) === nombre) scene.environment = hdrTex.rt.texture;
    }).catch((e) => { console.warn(`[entorno] no se pudo cargar ${nombre}: ${(e as Error)?.message ?? e}`); })
      .finally(() => { hdrTex.cargando = false; cargando--; avisar(); });
  }

  // ---- ground: a texture set tiled over the plane, or a flat colour ----
  const sueloMat = ground.material as THREE.MeshStandardMaterial;
  let sueloPuesto = "";
  function suelo(v: EntornoDatos): void {
    const mapa = String(v.sueloMapa ?? ""), normal = h.aparato.mobile ? "" : String(v.sueloNormal ?? ""); // phones: no normal map (bytes, fragment cost)
    const reps = 1000 / Math.max(0.1, n(v.sueloMetros, 4));
    sueloMat.color.setHex(n(v.sueloColor, 0xffffff));
    sueloMat.roughness = n(v.sueloRugosidad, 0.95);
    const clave = `${mapa}|${normal}`;
    if (!mapa) { if (sueloMat.map || sueloMat.normalMap) { sueloMat.map = null; sueloMat.normalMap = null; sueloMat.needsUpdate = true; } if (String(v.suelo) === "liso" && v.sueloColor === 0xffffff) sueloMat.color.setHex(0xa7b89c); sueloPuesto = clave; return; }
    if (clave !== sueloPuesto) {
      sueloPuesto = clave;
      Promise.all([textura(mapa, true), normal ? textura(normal, false) : Promise.resolve(null)]).then(([m, nm]) => {
        if (sueloPuesto !== clave) return;
        m.repeat.set(reps, reps); if (nm) nm.repeat.set(reps, reps);
        sueloMat.map = m; sueloMat.normalMap = nm; sueloMat.needsUpdate = true;
      }).catch((e) => console.warn(`[entorno] suelo sin textura: ${(e as Error)?.message ?? e}`));
    } else if (sueloMat.map) { sueloMat.map.repeat.set(reps, reps); sueloMat.normalMap?.repeat.set(reps, reps); }
  }

  // ---- shadows by quality: the sun's box follows the player; every mesh casts unless it says sinSombra ----
  let sombrasEn = 0;
  function sombras(): void {
    const px = SOMBRA_PX[calidad.sombras];
    const on = px > 0 && sun.intensity > 0.05;
    // once on, castShadow stays true: in three r186 turning it off disposes the shadow node under materials that still
    // use it (firefox: "shadowMap is null"). «Off» then = no shadow pass (autoUpdate) and no darkening (intensity 0).
    if (on && !sun.castShadow) sun.castShadow = true;
    if (!sun.castShadow) return;
    sun.shadow.autoUpdate = on; sun.shadow.intensity = on ? 1 : 0;
    if (!on) return;
    sun.shadow.needsUpdate = true;
    if (sun.shadow.mapSize.x !== px) sun.shadow.mapSize.set(px, px); // the shadow node resizes its map on the next update
    const lado = calidad.sombras === "alta" ? 40 : calidad.sombras === "media" ? 30 : 20;
    const c = sun.shadow.camera as THREE.OrthographicCamera;
    if (c.right !== lado) { c.left = -lado; c.right = lado; c.top = lado; c.bottom = -lado; c.near = 1; c.far = 160; c.updateProjectionMatrix(); }
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  }
  function marcarSombras(): void {
    world.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.sinSombra) return;
      if (!m.castShadow) m.castShadow = true;
      if (!m.receiveShadow) m.receiveShadow = true;
    });
  }

  /** Apply an environment (flat fields). Safe to call at any time; with AR on, it waits until the world shows again. */
  function aplicar(v: EntornoDatos): void {
    d = v;
    if (!world.visible) { pendiente = true; return; }
    pendiente = false; aplicados++; version++;
    // sun (the sky's) and the light (the moon when the sun is down)
    const alt = n(v.solAltura, 45), rumbo = n(v.solRumbo, 30);
    direccion(alt, rumbo, solDir);
    aguaLuz.solDir.value.copy(solDir);
    if (alt > -1) direccion(Math.max(alt, 3), rumbo, luzDir); else direccion(40, rumbo + 180, luzDir);
    sun.color.setHex(n(v.solColor, 0xffffff)); solColorU.value.copy(sun.color);
    // F4b: when the clock drives the sun (hora.mueveElSol) the light also follows it: a dim bluish moon and ambient at night, no jump at the horizon. Free: two scalars here, every lit material (nature, avatars, props) follows. A hand-set sun (presets: «noche») is the world's own and is left alone.
    const hSol = v.solHora === true, tD = Math.min(1, Math.max(0, (alt + 6) / 18)), dia = hSol ? tD * tD * (3 - 2 * tD) : 1, kSol = hSol ? 0.1 + 0.9 * dia : 1, kAmb = hSol ? 0.28 + 0.72 * dia : 1;
    sun.intensity = n(v.solIntensidad, 3) * (hSol ? kSol : alt > -1 ? Math.min(1, (alt + 1) / 6) : 1);
    // ambient: hemisphere, lower when the HDR light is on (it is the ambient then)
    hemi.color.setHex(n(v.ambienteCielo, 0xbcd6ee)); hemi.groundColor.setHex(n(v.ambienteSuelo, 0x6b5a45));
    if (hSol && dia < 1) { hemi.color.lerp(noche1.setHex(0x33456e), 1 - dia); hemi.groundColor.lerp(noche2.setHex(0x0b0e14), 1 - dia); }
    const amb = n(v.ambiente, 1) * kAmb;
    hemi.intensity = amb * (calidad.hdr ? 0.3 : 0.9);
    scene.environmentIntensity = amb * 0.4;
    // fog
    const lejos = n(v.nieblaLejos, 0);
    if (lejos > 0) {
      const tipoCielo = String(v.cielo), auto = v.nieblaAuto !== false;
      // automatic: a gradient's horizon or a flat colour exactly; the atmosphere's is sampled after baking (nieblaDelHorizonte)
      const c = auto && tipoCielo === "degradado" ? n(v.cieloHorizonte, 0xc9d8e4) : auto && tipoCielo === "color" ? n(v.cieloArriba, 0xc9d8e4) : n(v.nieblaColor, 0xc9d8e4);
      const cerca = Math.min(n(v.nieblaCerca, 0), lejos - 0.5);
      const mantener = auto && tipoCielo === "atmosfera" && scene.fog instanceof THREE.Fog; // keep the sampled colour until the next sample
      if (scene.fog instanceof THREE.Fog) { if (!mantener) scene.fog.color.setHex(c); scene.fog.near = cerca; scene.fog.far = lejos; } else { scene.fog = new THREE.Fog(c, cerca, lejos); horneadoClave = ""; }
    } else if (scene.fog) scene.fog = null;
    // tone
    const tono = TONOS[String(v.tono)] ?? THREE.AgXToneMapping;
    if (renderer.toneMapping !== tono) renderer.toneMapping = tono;
    renderer.toneMappingExposure = n(v.exposicion, 1);
    // wind (where it blows towards, m/s)
    direccion(0, n(v.vientoRumbo, 0), viento).multiplyScalar(n(v.vientoFuerza, 0));
    // landmarks and the grid
    for (const p of h.hitos) p.visible = v.hitos !== false;
    grid.visible = v.rejilla === true;
    suelo(v);
    // sky
    arribaU.value.setHex(n(v.cieloArriba, 0x5d8fc9)); horizonteU.value.setHex(n(v.cieloHorizonte, 0xc9d8e4));
    const tipo = String(v.cielo), imagen = String(v.imagen ?? "");
    scene.backgroundNode = null;
    if (imagen) {
      modoCielo = "imagen"; cielosEnEscena(null);
      if (fondoTex.nombre !== imagen) {
        fondoTex = { nombre: imagen, tex: null };
        const carga = imagen.endsWith(".hdr") ? import("three/addons/loaders/HDRLoader.js").then((m) => new m.HDRLoader().loadAsync(h.fichero(imagen))) : new THREE.TextureLoader().loadAsync(h.fichero(imagen));
        cargando++;
        carga.then((t: THREE.Texture) => { t.mapping = THREE.EquirectangularReflectionMapping; if (!imagen.endsWith(".hdr")) t.colorSpace = THREE.SRGBColorSpace; fondoTex.tex = t; if (d && String(d.imagen) === imagen && world.visible) scene.background = t; })
          .catch((e: unknown) => console.warn(`[entorno] fondo sin imagen: ${(e as Error)?.message ?? e}`)).finally(() => { cargando--; avisar(); });
      } else if (fondoTex.tex) scene.background = fondoTex.tex;
    } else if (tipo === "atmosfera") {
      if (sky) {
        sky.turbidity.value = n(v.turbidez, 2); sky.rayleigh.value = alt < 8 ? 2.5 : 1.5; sky.mieCoefficient.value = 0.005; sky.mieDirectionalG.value = 0.8;
        sky.sunPosition.value.copy(solDir); sky.cloudCoverage.value = n(v.nubes, 0.3); sky.cloudDensity.value = 0.5;
        modoCielo = nivel === "A" ? "vivo" : "horneado";
        if (modoCielo === "vivo") { cielosEnEscena(sky); scene.background = null; } else cielosEnEscena(null);
      } else { modoCielo = "cargando"; cielosEnEscena(domo); scene.background = null; }
    } else if (tipo === "degradado") { modoCielo = "degradado"; cielosEnEscena(domo); scene.background = null; }
    else { modoCielo = "color"; cielosEnEscena(null); scene.background = new THREE.Color(n(v.cieloArriba, 0x5d8fc9)); }
    // environment light: an HDR file, or the sky itself (baked), or none
    const hdr = String(v.hdr ?? "");
    if (!calidad.hdr) scene.environment = null;
    else if (hdr) { cargarHdr(hdr); if (hdrTex.rt) scene.environment = hdrTex.rt.texture; }
    hornearEn = performance.now() + (horneados ? 200 : 0);
    sombras();
    avisar();
  }

  function cambiarCalidad(): void {
    const antes = { ...calidad };
    calidad = acotarCalidad(nivel, { ...CALIDAD_POR_NIVEL[nivel] }, pedido);
    if (d && JSON.stringify(antes) !== JSON.stringify(calidad)) aplicar(d);
  }
  let forzado: Nivel | null = null;
  /** The tier can change while running (entering VR = B) or be simulated (checks): new defaults, caps and sky mode. */
  function actualizarNivel(): void {
    const nv = forzado ?? nivelDe({ ...h.aparato, xr: renderer.xr.isPresenting });
    if (nv === nivel) return;
    nivel = nv; cambiarCalidad(); if (d) aplicar(d);
  }

  return {
    solDir, luzDir, viento, vientoU, solColorU, aguaLuz,
    get nivel(): Nivel { return nivel; },
    get calidadActual(): Calidad { return calidad; },
    aplicar,
    /** F4: the last environment data applied (the world's hour for the fauna reads it); null before the first. */
    get datos(): EntornoDatos | null { return d; },
    /** H12 + settings menu: choose quality (any subset); asking for more than this device allows is clamped. Returns what applies now. */
    calidad(c?: Partial<Calidad>): Calidad {
      if (c) { pedido = { ...pedido, ...c }; cambiarCalidad(); }
      return { ...calidad };
    },
    /** What this device can choose, its defaults and its particle caps. */
    capacidades() { return { ...capacidades(nivel), backend: (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend.isWebGPUBackend ? "WebGPU" : "WebGL2" }; },
    /** For checks and the bench: behave as another tier (its defaults, caps and sky mode); null = this device again. */
    simularNivel(nv: Nivel | null): void { forzado = nv; actualizarNivel(); },
    /** Read-only picture of what is drawn (for checks and agents). */
    estado() {
      const f = scene.fog as THREE.Fog | null;
      const fondo = scene.background instanceof THREE.Color ? hex(scene.background) : modoCielo === "degradado" || modoCielo === "cargando" ? hex(horizonteU.value) : modoCielo;
      return {
        preset: String(d?.preset ?? ""), cielo: String(d?.cielo ?? ""), modoCielo, fondo,
        niebla: f ? { cerca: f.near, lejos: f.far, color: hex(f.color) } : null,
        sol: { altura: n(d?.solAltura), rumbo: n(d?.solRumbo), intensidad: Math.round(sun.intensity * 100) / 100, color: hex(sun.color), sombras: sun.castShadow && sun.shadow.intensity > 0, mapa: sun.castShadow && sun.shadow.intensity > 0 ? sun.shadow.mapSize.x : 0 },
        ambiente: Math.round(hemi.intensity * 100) / 100,
        luzEntorno: !scene.environment ? "no" : String(d?.hdr ?? "") && hdrTex.rt && scene.environment === hdrTex.rt.texture ? "fichero" : "cielo",
        suelo: { tipo: String(d?.suelo ?? ""), textura: !!sueloMat.map, relieve: !!sueloMat.normalMap, metros: n(d?.sueloMetros) },
        tono: String(d?.tono ?? ""), exposicion: renderer.toneMappingExposure,
        viento: { x: Math.round(viento.x * 100) / 100, z: Math.round(viento.z * 100) / 100, fuerza: n(d?.vientoFuerza) },
        hitos: h.hitos[0]?.visible ?? false, rejilla: grid.visible, mapaCorte: Math.max(0, n(d?.mapaCorte, 0)),
        nivel, calidad: { ...calidad }, aplicados, horneados, cargando,
      };
    },
    /** True while a file is arriving or something just changed: the page must draw. */
    ocupado(): boolean { return cargando > 0 || performance.now() < hastaMs || hornearEn > 0; },
    /** U14: the height (m) where the world's maps are cut (`mapa.corte`); 0 = not cut. */
    corte(): number { return Math.max(0, n(d?.mapaCorte, 0)); },
    /** Once per frame, before drawing. */
    actualizar(): void {
      actualizarNivel();
      if (pendiente && world.visible && d) aplicar(d);
      void cargaCielo;
      const cielo = modoCielo === "vivo" ? sky : modoCielo === "degradado" || modoCielo === "cargando" ? domo : null;
      if (cielo) cielo.position.copy(camera.position);
      const niebla = scene.fog as THREE.Fog | null; // N2: the water's fresnel takes the colour of the horizon you see
      aguaLuz.cielo.value.copy(niebla?.color ?? (scene.background instanceof THREE.Color ? scene.background : horizonteU.value));
      if (hornearEn && performance.now() >= hornearEn) { hornearEn = 0; hornear(); }
      // the light follows the player: the shadow box is always around them
      const f = h.foco() ?? { x: camera.position.x, z: camera.position.z };
      sun.target.position.set(f.x, 0, f.z);
      sun.position.set(f.x + luzDir.x * 80, luzDir.y * 80, f.z + luzDir.z * 80);
      if (sun.castShadow && sun.shadow.autoUpdate) { const t = performance.now(); if (t - sombrasEn > 1000) { sombrasEn = t; marcarSombras(); } }
    },
  };
}
export type Entorno = ReturnType<typeof crearEntorno>;
