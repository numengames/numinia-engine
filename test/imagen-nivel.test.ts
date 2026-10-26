// t_dee4d0eb · la imagen de un hueco al tamaño del nivel del aparato. 22 obras de 3000×2000 eran ~339 MB de vídeo en B
// (tope 256 en limits.json); la página las rehace a IMAGEN_PX[nivel] antes de que sean textura. Aquí: la cuenta de píxeles,
// que la tabla y limits.json digan lo mismo, y `cargarImagen` con un <img> y un lienzo de mentira (en Node no hay DOM).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IMAGEN_PX, type Nivel } from "../packages/render/src/calidad.ts";
import { cargarImagen, ladoReducido } from "../packages/render/src/medios.ts";

const lim = JSON.parse(readFileSync("limits.json", "utf8")).limits as { axis: string; scope: string; key: string; value: number }[];
const NIVELES: Nivel[] = ["A", "B", "C", "D"];
/** Lo que `limits.json` cuenta: ancho · alto · 4 bytes · 4/3 (mipmaps), en MB. */
const mb = (w: number, h: number) => (w * h * 4 * (4 / 3)) / (1024 * 1024);

test("limits.json: image_px_max de cada nivel es el IMAGEN_PX del código", () => {
  for (const n of NIVELES) {
    const e = lim.find((x) => x.axis === "device" && x.scope === n && x.key === "image_px_max");
    assert.ok(e, `falta image_px_max en el nivel ${n}`);
    assert.equal(e.value, IMAGEN_PX[n], `nivel ${n}`);
  }
});

test("ladoReducido: lado largo al tope, misma proporción, nunca amplía", () => {
  assert.deepEqual(ladoReducido(3000, 2000, 1024), { w: 1024, h: 683 });
  assert.deepEqual(ladoReducido(2000, 3000, 1024), { w: 683, h: 1024 });
  assert.equal(ladoReducido(800, 600, 1024), null, "cabe: se queda");
  assert.equal(ladoReducido(1024, 1024, 1024), null, "justo en el tope: se queda");
  assert.equal(ladoReducido(3000, 2000, Infinity), null, "sin tope: se queda");
  assert.deepEqual(ladoReducido(10000, 1, 512), { w: 512, h: 1 }, "una tira fina no llega a 0 px");
  assert.equal(ladoReducido(0, 0, 512), null);
});

test("la galería de 22 obras de 3000×2000 cabe en el tope de memoria de vídeo de cada nivel donde el tope es 256 MB", () => {
  const tope = (n: Nivel) => lim.find((x) => x.axis === "device" && x.scope === n && x.key === "texture_memory")!.value;
  for (const n of NIVELES) {
    const r = ladoReducido(3000, 2000, IMAGEN_PX[n]) ?? { w: 3000, h: 2000 };
    const total = 22 * mb(r.w, r.h);
    assert.ok(total <= tope(n), `nivel ${n}: ${total.toFixed(0)} MB > ${tope(n)} MB`);
  }
  // el caso medido: B pasó de ~339 MB (con todo lo demás de la escena) a ~104 MB; las 22 obras solas, a 1024 px, son ~78 MB
  const b = ladoReducido(3000, 2000, IMAGEN_PX.B)!;
  assert.ok(Math.abs(22 * mb(b.w, b.h) - 78) < 2, "B: las obras a ~78 MB");
  assert.ok(22 * mb(2048, 1365) > 256, "sin reducir (2048 px) en B pasaría de 256 MB");
});

// ——— cargarImagen con un DOM de mentira ———
function conDom<T>(f: (dibujos: { w: number; h: number; tam: [number, number] }[]) => Promise<T>, natural: [number, number]): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const antes = g.document;
  const dibujos: { w: number; h: number; tam: [number, number] }[] = [];
  g.document = {
    createElementNS: () => {
      const oyentes: Record<string, () => void> = {};
      const img: Record<string, unknown> = {
        width: natural[0], height: natural[1], naturalWidth: natural[0], naturalHeight: natural[1],
        addEventListener: (t: string, fn: () => void) => { oyentes[t] = fn; },
        removeEventListener: () => {},
        set src(_: string) { queueMicrotask(() => oyentes.load?.call(img)); }, // three llama al oyente con `this` = la imagen
      };
      return img;
    },
    createElement: () => {
      const c = { width: 0, height: 0, getContext: () => ({ imageSmoothingQuality: "", drawImage: (_i: unknown, _x: number, _y: number, w: number, h: number) => { dibujos.push({ w, h, tam: [c.width, c.height] }); } }) };
      return c;
    },
  };
  return f(dibujos).finally(() => { g.document = antes; });
}

test("cargarImagen: una imagen de 3000×2000 en B se rehace a 1024×683 y el plano guarda la proporción", async () => {
  await conDom(async (dibujos) => {
    const m = await cargarImagen("/a/x.png", IMAGEN_PX.B);
    assert.equal(dibujos.length, 1, "una sola copia dibujada");
    assert.deepEqual(dibujos[0].tam, [1024, 683]);
    assert.ok(Math.abs(m.obj.scale.x - 1.5) < 1e-9, "aspecto 3:2");
    m.soltar();
  }, [3000, 2000]);
});

test("cargarImagen: una imagen que cabe, o sin tope, no se rehace", async () => {
  await conDom(async (dibujos) => {
    const m = await cargarImagen("/a/x.jpg", IMAGEN_PX.A);
    assert.equal(dibujos.length, 0);
    m.soltar();
    const m2 = await cargarImagen("/a/x.jpg");
    assert.equal(dibujos.length, 0);
    m2.soltar();
  }, [1600, 900]);
});
