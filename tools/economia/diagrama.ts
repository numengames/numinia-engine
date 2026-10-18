// tools/economia — herramienta de diseño: un diagrama de economía de juego como datos.
// Límite de capa: este archivo no importa nada del motor ni de Node. Solo tipos y validación.
// Vocabulario propio (en castellano), inspirado en el método de diagramas de recursos de J. Dormans
// (tesis «Engineering Emergence», 2012, cap. 4, CC BY-NC): almacén, fuente, sumidero, conversor,
// puerta, registro; conexiones de recurso (tasa) y de estado (activador, disparador).
// No es el formato ni el código de ningún producto comercial.

export type Id = string;

/**
 * Una tasa es cuántas unidades mueve una conexión cada vez que su nodo dispara. Siempre entero ≥ 0.
 * - número: fija.
 * - { lee, por, entre, mas, min, max }: floor(valor(lee) * por / entre) + mas, acotado a [min, max].
 *   `lee` es un almacén o un registro: una «etiqueta» que lee un valor sin moverlo.
 * - { dado, veces, mas }: suma de `veces` dados de `dado` caras, más `mas`.
 * - { uniforme: [a, b] }: entero al azar entre a y b, ambos incluidos.
 * - función: escape para fórmulas que los datos no cubren; recibe `leer(id)` y `azar(n)` (0..n-1).
 */
export type Tasa =
  | number
  | { lee: Id; por?: number; entre?: number; mas?: number; min?: number; max?: number }
  | { dado: number; veces?: number; mas?: number }
  | { uniforme: [number, number] }
  | ((leer: (id: Id) => number, azar: (n: number) => number) => number);

/** auto: dispara cada tick. pasivo: solo cuando un disparador o una puerta lo activa. */
export type Modo = "auto" | "pasivo";

export type Entrada = { de: Id; tasa?: Tasa };
export type Salida = { a: Id; tasa?: Tasa };

/** Una salida de puerta: cada unidad que entra sale por UNA de ellas, elegida por peso. */
export type SalidaPuerta = {
  /** almacén que recibe la unidad; sin `a`, la unidad se pierde (un sumidero implícito) */
  a?: Id;
  /** peso relativo (entero ≥ 0); puede leer el estado, así una puerta hace de «dado con memoria» */
  peso: Tasa;
  /** nodo pasivo que se dispara por cada unidad que sale por aquí */
  dispara?: Id;
};

export type Nodo =
  /** almacén de un recurso: el estado del juego es la cuenta de cada almacén */
  | { tipo: "almacen"; id: Id; inicial?: number; max?: number }
  /** fuente: crea recursos de la nada (tasa por salida); `probabilidad` en tanto por mil (1000 = siempre) */
  | { tipo: "fuente"; id: Id; modo?: Modo; salidas: Salida[]; probabilidad?: number }
  /** sumidero: destruye hasta `tasa` unidades de `de` */
  | { tipo: "sumidero"; id: Id; modo?: Modo; de: Id; tasa?: Tasa }
  /** conversor: todo o nada — si todas las entradas tienen su tasa, las consume y produce las salidas;
   *  `veces` = cuántas veces seguidas puede hacerlo en un tick (1 por defecto) */
  | { tipo: "conversor"; id: Id; modo?: Modo; entradas: Entrada[]; salidas: Salida[]; veces?: number }
  /** puerta: saca hasta `tasa` unidades de `de` y reparte cada una por una salida según peso;
   *  reparto «azar» (dado) o «turnos» (determinista, proporcional a los pesos) */
  | { tipo: "puerta"; id: Id; modo?: Modo; de: Id; tasa?: Tasa; salidas: SalidaPuerta[]; reparto?: "azar" | "turnos" }
  /** registro: un valor calculado que otros leen; no guarda recursos ni dispara */
  | { tipo: "registro"; id: Id; valor: Tasa };

export type Comparador = "<" | "<=" | ">" | ">=" | "==" | "!=";

export type Estado =
  /** activador: el nodo `activa` solo puede disparar mientras `si <es> que` se cumple */
  | { tipo: "activador"; si: Id; es: Comparador; que: number; activa: Id }
  /** disparador: cuando el nodo `cuando` dispara y mueve al menos una unidad, dispara al nodo pasivo `dispara` */
  | { tipo: "disparador"; cuando: Id; dispara: Id };

export type Diagrama = { nombre: string; nodos: Nodo[]; estados?: Estado[] };

export type Issue = { path: string; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

const esEntero = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

function validarTasa(t: Tasa | undefined, path: string, issues: Issue[]): void {
  if (t === undefined || typeof t === "function") return;
  if (typeof t === "number") { if (!esEntero(t) || t < 0) issues.push({ path, message: `una tasa es un entero ≥ 0, no ${t}` }); return; }
  if ("lee" in t) {
    for (const k of ["por", "entre", "mas", "min", "max"] as const) if (t[k] !== undefined && !esEntero(t[k])) issues.push({ path: `${path}.${k}`, message: "entero" });
    if (t.entre === 0) issues.push({ path: `${path}.entre`, message: "no se divide entre 0" });
    return;
  }
  if ("dado" in t) { if (!esEntero(t.dado) || t.dado < 1) issues.push({ path: `${path}.dado`, message: "caras ≥ 1" }); return; }
  if ("uniforme" in t) { if (!esEntero(t.uniforme[0]) || !esEntero(t.uniforme[1]) || t.uniforme[0] > t.uniforme[1]) issues.push({ path: `${path}.uniforme`, message: "[a, b] enteros con a ≤ b" }); return; }
  issues.push({ path, message: "tasa desconocida" });
}

/** Comprueba ids únicos, referencias que existen y números bien formados. Nunca lanza. */
export function validar(d: Diagrama): Result<Diagrama> {
  const issues: Issue[] = [];
  const tipos = new Map<Id, Nodo["tipo"]>();
  d.nodos.forEach((n, i) => {
    if (!n.id) issues.push({ path: `nodos[${i}].id`, message: "falta el id" });
    if (tipos.has(n.id)) issues.push({ path: `nodos[${i}].id`, message: `id repetido: ${n.id}` });
    tipos.set(n.id, n.tipo);
  });
  const almacen = (id: Id, path: string) => { if (tipos.get(id) !== "almacen") issues.push({ path, message: `«${id}» no es un almacén` }); };
  const nodo = (id: Id, path: string) => { if (!tipos.has(id)) issues.push({ path, message: `«${id}» no existe` }); };
  const legible = (t: Tasa | undefined, path: string) => { validarTasa(t, path, issues); if (t && typeof t === "object" && "lee" in t && !["almacen", "registro"].includes(tipos.get(t.lee) ?? "")) issues.push({ path: `${path}.lee`, message: `«${t.lee}» no es almacén ni registro` }); };
  d.nodos.forEach((n, i) => {
    const p = `nodos[${i}]`;
    if (n.tipo === "almacen") {
      if (n.inicial !== undefined && (!esEntero(n.inicial) || n.inicial < 0)) issues.push({ path: `${p}.inicial`, message: "entero ≥ 0" });
      if (n.max !== undefined && (!esEntero(n.max) || n.max < 0)) issues.push({ path: `${p}.max`, message: "entero ≥ 0" });
    } else if (n.tipo === "fuente") {
      if (n.salidas.length === 0) issues.push({ path: `${p}.salidas`, message: "una fuente produce algo" });
      n.salidas.forEach((s, j) => { almacen(s.a, `${p}.salidas[${j}].a`); legible(s.tasa, `${p}.salidas[${j}].tasa`); });
      if (n.probabilidad !== undefined && (!esEntero(n.probabilidad) || n.probabilidad < 0 || n.probabilidad > 1000)) issues.push({ path: `${p}.probabilidad`, message: "tanto por mil: 0..1000" });
    } else if (n.tipo === "sumidero") {
      almacen(n.de, `${p}.de`); legible(n.tasa, `${p}.tasa`);
    } else if (n.tipo === "conversor") {
      if (n.entradas.length === 0) issues.push({ path: `${p}.entradas`, message: "un conversor consume algo (si no, es una fuente)" });
      n.entradas.forEach((e, j) => { almacen(e.de, `${p}.entradas[${j}].de`); legible(e.tasa, `${p}.entradas[${j}].tasa`); });
      n.salidas.forEach((s, j) => { almacen(s.a, `${p}.salidas[${j}].a`); legible(s.tasa, `${p}.salidas[${j}].tasa`); });
      if (n.veces !== undefined && (!esEntero(n.veces) || n.veces < 1)) issues.push({ path: `${p}.veces`, message: "entero ≥ 1" });
    } else if (n.tipo === "puerta") {
      almacen(n.de, `${p}.de`); legible(n.tasa, `${p}.tasa`);
      if (n.salidas.length === 0) issues.push({ path: `${p}.salidas`, message: "una puerta reparte por al menos una salida" });
      n.salidas.forEach((s, j) => {
        if (s.a !== undefined) almacen(s.a, `${p}.salidas[${j}].a`);
        legible(s.peso, `${p}.salidas[${j}].peso`);
        if (s.dispara !== undefined) { nodo(s.dispara, `${p}.salidas[${j}].dispara`); if (tipos.get(s.dispara) === "almacen" || tipos.get(s.dispara) === "registro") issues.push({ path: `${p}.salidas[${j}].dispara`, message: "solo se dispara una fuente, un sumidero, un conversor o una puerta" }); }
      });
    } else if (n.tipo === "registro") {
      legible(n.valor, `${p}.valor`);
    }
  });
  (d.estados ?? []).forEach((e, i) => {
    const p = `estados[${i}]`;
    if (e.tipo === "activador") {
      nodo(e.si, `${p}.si`); nodo(e.activa, `${p}.activa`);
      if (!esEntero(e.que)) issues.push({ path: `${p}.que`, message: "entero" });
      if (["almacen", "registro"].includes(tipos.get(e.activa) ?? "")) issues.push({ path: `${p}.activa`, message: "se activa un nodo que dispara, no un almacén ni un registro" });
    } else {
      nodo(e.cuando, `${p}.cuando`); nodo(e.dispara, `${p}.dispara`);
      if (["almacen", "registro"].includes(tipos.get(e.dispara) ?? "")) issues.push({ path: `${p}.dispara`, message: "se dispara un nodo que dispara, no un almacén ni un registro" });
    }
  });
  return issues.length ? { ok: false, issues } : { ok: true, value: d };
}
