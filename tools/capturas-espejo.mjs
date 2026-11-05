// capturas-espejo: the screenshot set of the Hermes world (M4 story 6, M5 re-taken), taken with the same harness as the e2e (tools/espejo-e2e-lib.mjs).
//   Run (browser lock held by the caller):  node tools/capturas-espejo.mjs <output dir>   (needs `npm run build`)
import { join } from "node:path";
import { crearMundo, fuenteLocal, abrirNavegador, dormir } from "./espejo-e2e-lib.mjs";
import { caminarA, irA, abrirPanel } from "./e2e-espejo.mjs";

const salida = process.argv[2] ?? ".", pre = process.argv[3] ?? "m5";
const cron = (id, titulo, estado = "programado") => ({ tipo: "cron", id, titulo, estado, zona: "z7", acciones: ["cron.pausar", "cron.ejecutar"] });
const NOMBRES = ["Agente principal", "Investigadora", "Revisor de código", "Redactora", "Planificador", "Auditoría", "Traductor", "Archivista", "Vigía", "Cartógrafa", "Contable", "Mensajero", "Bibliotecario", "Centinela"];
const cosas = [
  cron("resumen", "Resumen diario"), cron("limpieza", "Limpieza semanal", "pausado"), cron("copias", "Copia de seguridad"),
  ...NOMBRES.map((n, i) => ({ tipo: "perfil", id: `p${i}`, titulo: n, estado: i % 3 === 0 ? "activo" : "programado", zona: "z6", acciones: [] })),
  { tipo: "uso", id: "total", titulo: "Uso total", subtitulo: "33,8 M tokens · $1,654.69 est.", estado: "activo", zona: "z2", acciones: [] },
];

const mundo = await crearMundo({ funciones: { cron: true, perfiles: true, uso: true } });
const fuente = await fuenteLocal(mundo.puertoEnlace, { cosas });
const nav = await abrirNavegador();
try {
  const nueva = async (o) => { const p = await nav.pagina(mundo, o); await p.waitForFunction((n) => globalThis.__numinia.espejo.cosas().length >= n, cosas.length, { timeout: 15000 }); return p; };
  const foto = async (p, nombre) => { await dormir(1500); await p.screenshot({ path: join(salida, nombre) }); console.log("captured", nombre); };
  let p = await nueva();
  await abrirPanel(p); await foto(p, `${pre}-umbral.png`); await p.context().close();
  p = await nueva(); await irA(p, "z6"); await foto(p, `${pre}-torre-14-perfiles.png`); await p.context().close();
  p = await nueva(); await irA(p, "z2"); await foto(p, `${pre}-sala-uso.png`); await p.context().close();
  p = await nueva(); await irA(p, "z7"); await foto(p, `${pre}-reloj.png`); await p.context().close();
  p = await nav.pagina(mundo, { ancho: 360, alto: 640, query: "?webgl2&aparato=movil" });
  await caminarA(p, 0, -4.5, 3); await p.evaluate(() => globalThis.__numinia.espejo.usar("salud/panel")); await p.waitForSelector("#espejo-ficha:not([hidden])");
  await foto(p, `${pre}-movil-360x640.png`); await p.context().close();
} finally { await nav.cerrar(); fuente.cerrar(); await mundo.parar(); }
