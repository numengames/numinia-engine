// vitrina (N18): look at one of your goods in 3D inside the player sheet — a small canvas of its own where the model
// turns slowly and you turn it yourself (drag with a finger or the mouse, or the arrow keys when it has the focus).
// A second WebGPURenderer from the same three (no extra bundle), alive only while the sheet shows it: `cerrar()` (or the
// canvas leaving the page) disposes it, so a phone never keeps two GPU contexts busy for nothing. The model is fitted
// to the view whatever its size.
import * as THREE from "three/webgpu";

export type Vitrina = { cerrar(): void; estado(): { listo: boolean; fallo: string; giro: number; mallas: number } };

export function crearVitrina(canvas: HTMLCanvasElement, cargar: () => Promise<THREE.Object3D>, o: { pixelRatio?: number } = {}): Vitrina {
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(o.pixelRatio ?? globalThis.devicePixelRatio ?? 1, 2));
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x30343a, 2.2));
  const sol = new THREE.DirectionalLight(0xffffff, 2.2); sol.position.set(1.5, 2.5, 2); scene.add(sol);
  const giro = new THREE.Group(); scene.add(giro);
  let listo = false, fallo = "", vivo = true, angulo = 0.6, inclina = 0.15, arrastrando = false, ultimoX = 0, ultimoY = 0, quieto = 0, mallas = 0;
  let ultimo = performance.now();

  const medir = () => {
    const w = Math.max(1, canvas.clientWidth || canvas.width), h = Math.max(1, canvas.clientHeight || canvas.height);
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  };
  cargar().then((m) => {
    if (!vivo) return;
    const caja = new THREE.Box3().setFromObject(m), centro = caja.getCenter(new THREE.Vector3()), tam = caja.getSize(new THREE.Vector3());
    m.position.sub(centro); giro.add(m);
    m.traverse((x) => { if ((x as THREE.Mesh).isMesh) mallas++; });
    const r = Math.max(tam.x, tam.y, tam.z) || 1;
    cam.position.set(0, r * 0.35, r * 2.4); cam.lookAt(0, 0, 0); cam.near = r / 100; cam.far = r * 20; cam.updateProjectionMatrix();
    listo = true; canvas.dataset.listo = String(mallas); // for checks: loaded, with how many meshes
  }, (e) => { fallo = (e as Error)?.message ?? String(e); canvas.dataset.fallo = fallo; });

  const bajar = (e: PointerEvent) => { arrastrando = true; ultimoX = e.clientX; ultimoY = e.clientY; canvas.setPointerCapture?.(e.pointerId); e.preventDefault(); };
  const mover = (e: PointerEvent) => {
    if (!arrastrando) return;
    angulo += (e.clientX - ultimoX) * 0.012; inclina = Math.max(-0.9, Math.min(0.9, inclina + (e.clientY - ultimoY) * 0.008));
    ultimoX = e.clientX; ultimoY = e.clientY; quieto = 2.5; e.preventDefault();
  };
  const soltar = () => { if (arrastrando) canvas.dataset.giro = String(Math.round(angulo * 100) / 100); arrastrando = false; };
  const tecla = (e: KeyboardEvent) => {
    const d = { ArrowLeft: [-0.25, 0], ArrowRight: [0.25, 0], ArrowUp: [0, -0.15], ArrowDown: [0, 0.15] }[e.key];
    if (!d) return;
    angulo += d[0]; inclina = Math.max(-0.9, Math.min(0.9, inclina + d[1])); quieto = 2.5; canvas.dataset.giro = String(Math.round(angulo * 100) / 100); e.preventDefault(); e.stopPropagation();
  };
  canvas.style.touchAction = "none"; // dragging turns the model instead of scrolling the sheet
  canvas.addEventListener("pointerdown", bajar); canvas.addEventListener("pointermove", mover);
  canvas.addEventListener("pointerup", soltar); canvas.addEventListener("pointercancel", soltar); canvas.addEventListener("keydown", tecla);

  medir();
  renderer.setAnimationLoop(() => {
    if (!vivo) return;
    if (!canvas.isConnected) { cerrar(); return; }
    const ahora = performance.now(), dt = Math.min(0.1, (ahora - ultimo) / 1000); ultimo = ahora;
    if (quieto > 0) quieto -= dt; else if (!arrastrando) angulo += dt * 0.6;
    giro.rotation.set(inclina, angulo, 0);
    if (canvas.clientWidth && Math.abs(canvas.clientWidth * renderer.getPixelRatio() - canvas.width) > 2) medir();
    renderer.render(scene, cam);
  });

  function cerrar(): void {
    if (!vivo) return;
    vivo = false;
    renderer.setAnimationLoop(null);
    canvas.removeEventListener("pointerdown", bajar); canvas.removeEventListener("pointermove", mover);
    canvas.removeEventListener("pointerup", soltar); canvas.removeEventListener("pointercancel", soltar); canvas.removeEventListener("keydown", tecla);
    giro.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); });
    renderer.dispose();
  }
  return { cerrar, estado: () => ({ listo, fallo, giro: Math.round(angulo * 100) / 100, mallas }) };
}
