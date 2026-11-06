// almacen-guarda: loads the safe storage only where it can matter (mundo-hermes M8). A page that is not framed has the browser's own storage and pays nothing;
// a framed page may be sandboxed without allow-same-origin (opaque origin: localStorage throws), so it waits (top-level await) for the safe adapter before
// any other module of the page runs. Imported FIRST by main.ts.
if (window.parent !== window) await import("./almacen-seguro.ts");
export {};
