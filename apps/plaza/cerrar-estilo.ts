// Only here so the look of the house close control (cerrar.css) is loaded by Vite; cerrar.ts asks for it, and under node
// (the tests) the import fails quietly.
// @ts-expect-error CSS side-effect import: Vite handles it (no type declaration, as for interactuar.css, flecha.css and foto.css)
import "./cerrar.css";
