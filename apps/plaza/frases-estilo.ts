// Y29: only here so the look of the fixed-phrases panel (frases.css) is a lazy chunk: frases.ts asks for it when the panel is built.
// @ts-expect-error CSS side-effect import: Vite handles it (no type declaration, as for evaluacion.css and foto.css)
import "./frases.css";
