// P13: only here so the look of the end evaluation card (evaluacion.css) is a lazy chunk: evaluacion-tarjeta.ts asks for it when the first card is shown.
// @ts-expect-error CSS side-effect import: Vite handles it (no type declaration, as for interactuar.css, flecha.css and foto.css)
import "./evaluacion.css";
