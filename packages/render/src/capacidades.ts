// capacidades (N2): what the graphics chip allows, read from three's backend (WebGPU device limits or the WebGL2
// context). The settings registry (packages/ajustes) turns it into the `maxTextura` capability. 0 = cannot be read.
export function limitesGraficos(renderer: unknown): { maxTextura: number } {
  try {
    const b = (renderer as { backend?: { device?: { limits?: { maxTextureDimension2D?: number } }; gl?: WebGL2RenderingContext } }).backend;
    const gpu = b?.device?.limits?.maxTextureDimension2D;
    if (gpu) return { maxTextura: gpu };
    if (b?.gl) return { maxTextura: Number(b.gl.getParameter(b.gl.MAX_TEXTURE_SIZE)) || 0 };
  } catch { /* the backend hides it */ }
  return { maxTextura: 0 };
}
