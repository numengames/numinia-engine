// MIS-239: the «touch of glass» on the engine's windows (settings, map/sheet panels, the Menú drop-down) on a PC.
// The recipe comes from the wireframe (maquetas/ajustes-y-mapa.html): dark surface + blur + a hairline. The HUD chips keep the
// 55 % glass of the frames table (densidad.ts); a WINDOW holds long running text, so its surface is more opaque (78 %) and the
// numbers below are proven against WCAG AA in the worst case — a white sky behind — by `contrasteCristal` (test/cristal.test.ts).
// Off: at the lowest quality and in battery mode (`html[data-sin-cristal]`, marcos.ts), in high contrast, on the phone profile
// (a blur per frame on a phone heats it) and when the system asks for less transparency.

/** Surface colour (r, g, b, 0–255) and opacity of a glass window. */
export const CRISTAL_VENTANA = { rgb: [20, 17, 15] as const, opacidad: 0.78, blur: 14, brillo: 0.85, saturacion: 1.2, borde: "rgba(249,235,220,.2)" } as const;
/** The menu drop-down is small: same colour, a lighter blur. */
export const CRISTAL_MENU = { ...CRISTAL_VENTANA, blur: 10 } as const;

/** The house text colours a window uses (tema.css :root) — what must stay readable. */
export const TEXTOS_VENTANA = { texto: "#F9EBDC", texto2: "#C4B5A6" } as const;

const lin = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const hex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const luz = (c: readonly number[]): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);

/** The colour a window shows over a backdrop of `fondo` (0–255 grey): the backdrop is dimmed by `brillo`, then the surface goes on top. */
export function colorSobre(v: { rgb: readonly number[]; opacidad: number; brillo: number }, fondo: number): [number, number, number] {
  const detras = fondo * v.brillo;
  return v.rgb.map((c) => v.opacidad * c + (1 - v.opacidad) * detras) as [number, number, number];
}

/** WCAG contrast ratio of `texto` (#rrggbb) on the glass over a `fondo` grey (255 = a white sky, the worst case for light text). */
export function contrasteCristal(v: { rgb: readonly number[]; opacidad: number; brillo: number }, texto: string, fondo = 255): number {
  const a = luz(hex(texto)), b = luz(colorSobre(v, fondo));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The declarations of the glass (what tema.css must carry; the test compares them). */
export function reglasCristal(v: { rgb: readonly number[]; opacidad: number; blur: number; brillo: number; saturacion: number; borde: string }): string {
  const f = `blur(${v.blur}px) saturate(${v.saturacion}) brightness(${v.brillo})`;
  return `background: rgba(${v.rgb.join(", ")}, ${v.opacidad}) !important; -webkit-backdrop-filter: ${f}; backdrop-filter: ${f}; border-color: ${v.borde} !important;`;
}
