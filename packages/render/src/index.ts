// render: draws what it is given. Knows nothing about the network or the simulation.
// Three.js WebGPURenderer: WebGPU where the browser has it, its own WebGL2 backend elsewhere.
import * as THREE from "three/webgpu";
import { createAR, arSupported } from "./ar.ts";
export { arSupported } from "./ar.ts";
export type { ARState } from "./ar.ts";

export type Backend = "WebGPU" | "WebGL2";
export type Placed = { id: number; x: number; z: number };

export async function createView(parent: HTMLElement, opts: { forceWebGL?: boolean; arMaxMs?: number } = {}) {
  const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: !!opts.forceWebGL });
  await renderer.init();
  const backend: Backend = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend.isWebGPUBackend ? "WebGPU" : "WebGL2";
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xc9d8e4);
  scene.fog = new THREE.Fog(0xc9d8e4, 40, 140);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 400);
  camera.position.set(0, 7, 10);

  const world = new THREE.Group(); // the normal world; hidden while AR shows the real one
  scene.add(world);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshStandardMaterial({ color: 0xa7b89c }));
  ground.rotation.x = -Math.PI / 2;
  world.add(ground);
  const grid = new THREE.GridHelper(200, 100, 0x6f7f68, 0x8d9c86);
  grid.position.y = 0.01;
  world.add(grid);

  // landmarks so movement is visible: fixed positions, no randomness
  const pillarGeo = new THREE.BoxGeometry(1, 3, 1);
  const palette = [0xd9a441, 0x5b8cc0, 0xc0605b, 0x6ea86a];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r = 18 + (i % 3) * 9;
    const p = new THREE.Mesh(pillarGeo, new THREE.MeshStandardMaterial({ color: palette[i % 4] }));
    p.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
    world.add(p);
  }

  const bodyGeo = new THREE.CapsuleGeometry(0.35, 1.0, 4, 12);
  const selfMat = new THREE.MeshStandardMaterial({ color: 0xe07a3f });
  const otherMat = new THREE.MeshStandardMaterial({ color: 0x6d7f99 });
  const selfMesh = new THREE.Mesh(bodyGeo, selfMat);
  selfMesh.visible = false;
  world.add(selfMesh);
  const others = new Map<number, THREE.Mesh>();
  const target = new THREE.Vector3();
  const wanted = new THREE.Vector3();

  const ar = createAR({ renderer, scene, world, domOverlayRoot: document.getElementById("hud") ?? undefined, maxMs: opts.arMaxMs });

  addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  return {
    backend,
    renderer,
    ar,
    arSupported,
    /** Place everyone for this frame. */
    sync(self: { x: number; z: number } | null, list: Placed[]): void {
      if (self) { selfMesh.visible = true; selfMesh.position.set(self.x, 0.85, self.z); }
      const seen = new Set<number>();
      for (const o of list) {
        seen.add(o.id);
        let m = others.get(o.id);
        if (!m) { m = new THREE.Mesh(bodyGeo, otherMat); world.add(m); others.set(o.id, m); }
        m.position.set(o.x, 0.85, o.z);
      }
      for (const [id, m] of others) if (!seen.has(id)) { world.remove(m); others.delete(id); }
    },
    /** Follow camera, then draw. */
    draw(dtSeconds: number): void {
      if (renderer.xr.isPresenting) { ar.update(); renderer.render(scene, camera); return; }
      target.copy(selfMesh.position);
      wanted.set(target.x, target.y + 6, target.z + 9);
      camera.position.lerp(wanted, 1 - Math.exp(-dtSeconds * 8));
      camera.lookAt(target.x, target.y + 0.8, target.z);
      renderer.render(scene, camera);
    },
    loop(fn: (timeMs: number) => void): void { renderer.setAnimationLoop(fn); },
    get drawn(): number { return others.size + (selfMesh.visible ? 1 : 0); },
  };
}
