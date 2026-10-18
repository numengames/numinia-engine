// cerradura — server part (D-042). The server decides everything: who may build (api.puede), whether a code
// matches (store only, never in state), whether a guest holds the key a lock asks for (store, by guest id, I1).
// Wrong tries in a row count per lock per guest; past INTENTOS_MAX the lock makes the next try wait ESPERA_MS
// (a code lock cannot be brute-forced from the page faster than that, on top of the intent's own rate limit).
import { serverPart } from "../../packages/feature/src/index.ts";
import type { ServerApi } from "../../packages/feature/src/index.ts";
import { cerradura, METODOS, CODIGO_MIN, CODIGO_MAX, NOMBRE_MAX, INTENTOS_MAX, ESPERA_MS } from "./feature.ts";
import type { Metodo } from "./feature.ts";

const ES_CIFRAS = /^[0-9]+$/;
const cortar = (t: string, max: number): string => {
  const s = String(t ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim();
  const enc = new TextEncoder();
  if (enc.encode(s).length <= max) return s;
  let out = ""; for (const ch of s) { if (enc.encode(out + ch).length > max - 3) break; out += ch; }
  return out + "…";
};
const esId = (v: unknown) => /^[a-z0-9-]{1,16}$/.test(String(v ?? ""));
const esCodigo = (v: unknown) => { const s = String(v ?? ""); return s.length >= CODIGO_MIN && s.length <= CODIGO_MAX && ES_CIFRAS.test(s); };

export const crearCerradura = () => serverPart(cerradura, (api: ServerApi) => {
  const quienId = (e: number) => api.who(e)?.id ?? `e${e}`;
  const rechazar = (e: number, motivo: string) => { api.emit("rechazado", { motivo: cortar(motivo, 200) }, { to: e }); return false; };
  const puede = (e: number) => api.puede(e, "construir") || rechazar(e, "No puedes construir aquí: el mundo está cerrado a construir (lo abre quien lo administra).");
  const avisar = (e: number) => api.emit("permiso", { construir: api.puede(e, "construir") }, { to: e });
  api.onJoin(avisar);
  api.onIdentify((e) => avisar(e));
  api.listen("roles", "cambio", (m) => { avisar(Number(m.quien)); return true; });

  const tieneLlave = (e: number, llave: string): boolean => !!api.store.get(`k:${quienId(e)}:${llave}`);

  const esperaHasta = new Map<string, number>(); // `${idCerradura}:${quienId}` -> tick hasta el que hay que esperar
  const fallosClave = (id: string, e: number) => `${id}:${quienId(e)}`;

  api.on("abrir", (e, m) => {
    const id = String(m.id ?? "");
    const c = api.state.get(id);
    if (!c) return rechazar(e, `No hay ninguna cerradura «${id}».`);
    if (c.abierta) return rechazar(e, "Ya está abierta.");
    const fc = fallosClave(id, e);
    const esperaFin = esperaHasta.get(fc);
    if (esperaFin !== undefined && api.tick() < esperaFin) return rechazar(e, "Has fallado varias veces: espera un poco antes de volver a probar.");
    let abre: boolean;
    if (c.metodo === "llave") {
      abre = tieneLlave(e, String(c.llave));
    } else {
      const codigo = String(m.codigo ?? "");
      if (!esCodigo(codigo)) return rechazar(e, `El código es de ${CODIGO_MIN} a ${CODIGO_MAX} cifras.`);
      abre = codigo === String(api.store.get(`c:${id}`) ?? "");
    }
    if (!abre) {
      const n = Number(api.store.get(`i:${fc}`) ?? 0) + 1;
      api.store.set(`i:${fc}`, n);
      if (n >= INTENTOS_MAX) { esperaHasta.set(fc, api.tick() + Math.ceil(ESPERA_MS / 50)); api.store.set(`i:${fc}`, 0); }
      return rechazar(e, c.metodo === "llave" ? "No tienes la llave que abre esto." : "Ese código no es.");
    }
    api.store.set(`i:${fc}`, 0);
    api.state.set(id, { ...c, abierta: true }, { at: { x: Number(c.x), z: Number(c.z) } });
    api.emit("abierta", { id }, { to: e });
  });

  api.on("poner", (e, m) => {
    if (!puede(e)) return;
    const id = String(m.id ?? "");
    if (!esId(id)) return rechazar(e, "El id es de 1 a 16 letras minúsculas, cifras o guiones.");
    const metodo = String(m.metodo ?? "") as Metodo;
    if (!(METODOS as readonly string[]).includes(metodo)) return rechazar(e, `El método es ${METODOS.join(" o ")}.`);
    const nombre = cortar(String(m.nombre ?? "Cerradura"), NOMBRE_MAX) || "Cerradura";
    if (metodo === "codigo") {
      const codigo = String(m.codigo ?? "");
      if (!esCodigo(codigo)) return rechazar(e, `El código es de ${CODIGO_MIN} a ${CODIGO_MAX} cifras (0-9).`);
      api.store.set(`c:${id}`, codigo);
    } else {
      const llave = String(m.llave ?? "");
      if (!esId(llave)) return rechazar(e, "La llave es de 1 a 16 letras minúsculas, cifras o guiones.");
      api.store.delete(`c:${id}`);
    }
    const ok = api.state.set(id, { metodo, llave: metodo === "llave" ? String(m.llave ?? "") : "", abierta: false, nombre, x: Number(m.x), y: Number(m.y ?? 0), z: Number(m.z) }, { at: { x: Number(m.x), z: Number(m.z) } });
    if (!ok) return rechazar(e, "Esos datos no caben en una cerradura.");
    api.emit("hecho", { id, accion: "poner" }, { to: e });
  });

  api.on("quitar", (e, m) => {
    if (!puede(e)) return;
    const id = String(m.id ?? "");
    if (!api.state.get(id)) return rechazar(e, `No hay ninguna cerradura «${id}».`);
    api.state.delete(id);
    api.store.delete(`c:${id}`);
    api.emit("hecho", { id, accion: "quitar" }, { to: e });
  });

  api.on("dar", (e, m) => {
    if (!puede(e)) return;
    const llave = String(m.llave ?? "");
    if (!esId(llave)) return rechazar(e, "La llave es de 1 a 16 letras minúsculas, cifras o guiones.");
    api.store.set(`k:${quienId(e)}:${llave}`, true);
    api.emit("tuLlave", { llave }, { to: e });
  });
});

export default crearCerradura();
