// Hueco vacío (ver package.json): la optimización del motor nunca toca píxeles, así que esto solo avisa si alguien lo intenta.
const no = () => { throw new Error("optimizar: el motor no recodifica píxeles (sin sharp/libvips); las texturas quedan como vienen"); };
export const getPixels = no;
export const savePixels = no;
