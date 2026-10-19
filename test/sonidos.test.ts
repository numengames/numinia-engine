// S6 · el catálogo de sonidos de la casa: lo que hay en activos/sonidos/ es lo que dice features/sonido/catalogo.json
// (sha256 a sha256, y todo CC0), la lectura avisa en vez de caerse, la misma semilla elige la misma variante en dos
// páginas, el cooldown corta la repetición, los siete avisos salen por el bus «interfaz» y SIN panner, un id que no
// existe no rompe nada, y ningún .opus entra en el paquete de arranque.
//
// El audio es un `AudioContext` de mentira (igual que test/audio-voces.test.ts): en Node no hay Web Audio. Donde se
// dice «probado con contexto falso» es porque se comprueba la FORMA del grafo y QUIÉN suena, no el sonido: nadie ha
// oído estos ficheros dentro de la prueba.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Instance } from "../packages/instance/src/index.ts";
import { ClientSession } from "../packages/client/src/index.ts";
import type { GuestKeeper } from "../packages/client/src/index.ts";
import { signer } from "../packages/server/src/secret.ts";
import { BUSES, crearNucleo } from "../packages/render/src/audio/nucleo.ts";
import { crearVoces } from "../packages/render/src/audio/voces.ts";
import { crearSonidos, leerTabla, RUTA_TABLA, VARIACION } from "../packages/render/src/audio/sonidos.ts";
import { RECETAS } from "../packages/render/src/audio/sintesis.ts";
import { sonido as decl, BUSES_SONIDO, ID_SONIDO_RE } from "../features/sonido/feature.ts";
import { comprobarFicheros, crearSonido, leerCatalogo, leerSonido, leerVariante, tablaDePagina } from "../features/sonido/server.ts";
import type { Suena } from "../features/sonido/server.ts";
import { crearCliente as clienteSonido } from "../features/sonido/client.ts";
import { crearDados } from "../features/dados/server.ts";
import { crearCliente as clienteDados } from "../features/dados/client.ts";
import { crearDisparadores, leerDisparadores } from "../features/disparadores/server.ts";
import { crearCliente as clienteDisparadores } from "../features/disparadores/client.ts";
import { fx } from "../packages/core/src/index.ts";
import { SERVIR } from "../packages/server/src/activos.ts";
import { CASA, LOTES, MEZCLA } from "../tools/sonidos-catalogo.ts";
import funciones from "../features/servidor.ts";
import paginas from "../features/cliente.ts";
import catalogo from "../features/sonido/catalogo.json" with { type: "json" };

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const sign = signer("una-clave-de-prueba-larga-s6");
const keeper = (): GuestKeeper => { let t: string | null = null; return { load: () => t, save: (x) => { t = x; } }; };
type Cat = typeof catalogo;
const sonidos = () => (catalogo as Cat).sonidos;

// ———————————————————————————— 1. la declaración y el sitio de las cosas ————————————————————————————

test("S6: la declaración cumple las reglas del enchufe, está en las dos listas, y repite los ocho buses del núcleo", () => {
  assert.deepEqual(decl.issues, []);
  assert.equal(decl.id, "sonido");
  assert.ok(funciones.some((x) => x.feature.id === "sonido"), "en features/servidor.ts");
  assert.ok(paginas.some((x) => x.feature.id === "sonido"), "en features/cliente.ts");
  // una función del motor no puede importar packages/render: la lista se repite, y aquí se vigila que no se separe
  assert.deepEqual([...BUSES_SONIDO], [...BUSES], "BUSES_SONIDO se ha separado de BUSES (packages/render/src/audio/nucleo.ts)");
  // nadie pide sonidos desde su página: el servidor manda
  assert.equal(Object.keys(decl.intents ?? {}).length, 0, "la pieza no tiene ninguna intención: la página no pide sonidos");
  // el evento trae la semilla del servidor y el texto accesible
  const campos = Object.keys(decl.events!.suena.fields);
  for (const c of ["sonido", "semilla", "x", "y", "z", "espacial", "quien", "texto"]) assert.ok(campos.includes(c), `falta el campo «${c}»`);
});

test("S6: /a/ sabe servir .opus y .m4a, y nadie los puede SUBIR", async () => {
  assert.equal(SERVIR.opus, "audio/ogg");
  assert.equal(SERVIR.m4a, "audio/mp4");
  const { TIPOS } = await import("../packages/net/src/ficheros.ts");
  assert.equal((TIPOS as Record<string, string>).opus, undefined, "«opus» no está en TIPOS: nadie sube sonidos");
  assert.equal((TIPOS as Record<string, string>).m4a, undefined, "«m4a» no está en TIPOS: nadie sube sonidos");
});

// ———————————————————————————— 2. el catálogo contra el disco ————————————————————————————

/** Las filas con fichero. Las de receta (S6f) no tienen ninguno: su `fuente` es la cadena «receta», no una lista de
 *  enlaces de atribución. */
const conFichero = () => sonidos().filter((s) => Array.isArray(s.fuente));
/** Las filas sin fichero: las que hace el motor con una receta de `packages/render/src/audio/sintesis.ts`. */
const deReceta = () => sonidos().filter((s) => !Array.isArray(s.fuente));
/** El colchón de ambiente es el único fichero largo del catálogo: es una CAMA por streaming, no un disparo, así que
 *  no vale medirlo con la vara de los demás (40 kB por fichero, 600 kB en total). */
const COLCHON_ID = "ambiente-numinia";

test("S6f: las seis filas de receta no tienen fichero, llevan su texto accesible y su licencia es «propia»", () => {
  const ids = deReceta().map((s) => s.id).sort();
  assert.deepEqual(ids, ["dano", "moneda", "pesca-picada", "salto", "ui-abrir", "ui-cerrar"]);
  for (const s of deReceta()) {
    assert.equal(s.fuente, "receta", `${s.id}: la marca de una fila sin fichero es «fuente»: "receta"`);
    assert.equal(s.licencia, "propia", `${s.id}: una receta es código del motor, no el fichero de nadie`);
    assert.deepEqual(s.variantes, [], `${s.id}: una fila de receta no lleva variantes`);
    assert.ok(s.texto.trim().length > 3, `${s.id}: todo sonido lleva su texto para quien no oye (XAUR, WCAG 2.2)`);
    assert.ok(RECETAS[s.id], `${s.id}: está en el catálogo como receta pero no hay receta en sintesis.ts`);
  }
});

test("S6f: el colchón de ambiente está en el catálogo, en bucle, en el bus ambiente, y su autor está pendiente", () => {
  const c = sonidos().find((s) => s.id === COLCHON_ID);
  assert.ok(c, "falta la fila del colchón de ambiente");
  assert.equal(c.bus, "ambiente");
  assert.equal(c.bucle, true, "el colchón suena en bucle (se le cosió un fundido de 4 s)");
  assert.equal(c.licencia, "CC0-1.0");
  // TODO (Pablo): cuando diga el nombre del autor, se pone en COLCHON.autor (tools/sonidos-catalogo.ts) y esto cambia
  assert.deepEqual(c.autor, ["pendiente (Pablo lo dirá)"], "el autor lo dirá Pablo: nadie se lo inventa");
  assert.equal(c.variantes.length, 1, "el colchón es una cama única: una sola variante");
});

test("S6: cada variante del catálogo existe, pesa lo que dice y su sha256 es el del fichero (los 180 ficheros)", () => {
  assert.equal((catalogo as Cat).schema, "numinia-engine/sonidos@1");
  let ficheros = 0, bytes = 0, bytesColchon = 0;
  for (const s of sonidos()) {
    assert.ok(ID_SONIDO_RE.test(s.id), `id raro: ${s.id}`);
    for (const v of s.variantes) {
      for (const [ruta, sha, peso] of [[v.fichero, v.sha256, v.bytes], [v.respaldo, v.respaldo_sha256, v.respaldo_bytes]] as const) {
        const abs = join(RAIZ, ruta);
        const datos = readFileSync(abs);
        assert.equal(sha256(datos), sha, `${ruta}: el sha256 del catálogo no es el del fichero`);
        assert.equal(datos.length, peso, `${ruta}: bytes del catálogo ≠ bytes del fichero`);
        ficheros++;
        if (s.id === COLCHON_ID) bytesColchon += datos.length; else bytes += datos.length;
      }
    }
  }
  assert.equal(ficheros, 180, "180 ficheros (90 variantes × opus + m4a: 89 disparos + el colchón de ambiente)");
  assert.ok(bytes < 600_000, `activos/sonidos/ son ${bytes} B sin el colchón: ¿se ha colado una cama de zona?`);
  assert.ok(bytesColchon < 2_000_000, `el colchón de ambiente son ${bytesColchon} B: 113 s de música no pasan de 2 MB`);
});

test("S6: en activos/sonidos/ no hay NADA que el catálogo no nombre (ni camas ni capas de zona: esas son de mundo)", () => {
  const nombradas = new Set(sonidos().flatMap((s) => [...s.variantes.map((v) => v.fichero), ...s.variantes.map((v) => v.respaldo)]));
  const dir = join(RAIZ, "activos/sonidos");
  const sueltos: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) { assert.equal(d.name, "LICENCIAS.md", `${d.name}: en activos/sonidos/ solo hay carpetas de id y LICENCIAS.md`); continue; }
    assert.ok(!/^(bed|capa)-/.test(d.name), `${d.name}: las camas y capas de zona van en numinia-assets, no en el motor`);
    for (const f of readdirSync(join(dir, d.name))) {
      const rel = `activos/sonidos/${d.name}/${f}`;
      if (!nombradas.has(rel)) sueltos.push(rel);
      // el colchón es la única cama que vive en el motor (CC0, cedida para Numinia): se mide aparte
      const tope = d.name === COLCHON_ID ? 1_000_000 : 40_000;
      assert.ok(statSync(join(dir, d.name, f)).size < tope, `${rel}: un sonido de la casa no pasa de ${tope / 1000} kB`);
    }
  }
  assert.deepEqual(sueltos, [], "ficheros en activos/sonidos/ que el catálogo no nombra");
});

test("S6: todo es CC0, todo tiene autor, fuente y texto accesible, y todo es de los lotes nucleo o funcion", () => {
  for (const s of conFichero()) {
    assert.equal(s.licencia, "CC0-1.0", `${s.id}: en la biblioteca de la casa solo entra CC0`);
    assert.ok(s.autor.length > 0, `${s.id}: sin autor`);
    // el colchón no viene de una URL: lo cedió un amigo de Numinia, y su procedencia es esa frase
    if (s.id !== COLCHON_ID) assert.ok(s.fuente.length > 0 && s.fuente.every((u) => /^https?:\/\//.test(u)), `${s.id}: sin fuente verificable`);
    else assert.ok(s.fuente.length > 0 && /Numinia/.test(s.fuente[0]), `${s.id}: su procedencia se dice en una frase`);
    assert.ok(s.texto.trim().length > 3, `${s.id}: todo sonido lleva su texto para quien no oye (XAUR, WCAG 2.2)`);
    assert.ok((LOTES as readonly string[]).includes(s.lote), `${s.id}: lote «${s.lote}» no entra en el motor`);
    assert.ok(MEZCLA[s.id], `${s.id}: sin prioridad ni cooldown en tools/sonidos-catalogo.ts`);
    assert.equal(s.prioridad, MEZCLA[s.id].prioridad);
    assert.equal(s.cooldown_ms, MEZCLA[s.id].cooldown_ms);
    assert.ok(BUSES_SONIDO.includes(s.bus as never) && s.bus !== "master", `${s.id}: bus «${s.bus}»`);
  }
  // la interfaz no se aparta nunca: prioridad máxima para todo lo que suena en la cabeza
  for (const s of sonidos()) if (s.bus === "interfaz") assert.equal(s.prioridad, 100, `${s.id}: un aviso no se calla nunca`);
});

test("S6: LICENCIAS.md nombra cada id que entra, y solo esos", () => {
  const md = readFileSync(join(RAIZ, "activos/sonidos/LICENCIAS.md"), "utf8");
  for (const s of conFichero()) assert.ok(md.includes(`\`sonidos/${s.id}/\``), `LICENCIAS.md no nombra «${s.id}»`);
  // las de receta no tienen fichero de nadie: no llevan fila de licencia, pero se dicen por su nombre
  for (const s of deReceta()) assert.ok(md.includes(`\`${s.id}\``), `LICENCIAS.md no dice que «${s.id}» es una receta`);
  assert.ok(md.includes("CC0 1.0 Universal"), "LICENCIAS.md debe decir la licencia con su nombre");
  assert.ok(!/bed-|capa-/.test(md), "LICENCIAS.md nombra camas o capas de zona, que no están aquí");
});

test("S6: los siete avisos de la casa (y el acorde de «completada») apuntan a un id que existe", () => {
  const ids = new Set(sonidos().map((s) => s.id));
  const casa = (catalogo as Cat).casa as Record<string, string>;
  for (const n of ["suave", "aviso", "exito", "error", "paso", "campana", "magia", "completada"]) {
    assert.ok(casa[n], `el aviso «${n}» no tiene fichero`);
    assert.ok(ids.has(casa[n]), `casa.${n} → «${casa[n]}», que no está en el catálogo`);
  }
  assert.deepEqual(casa, CASA, "la tabla del catálogo se ha separado de CASA (tools/sonidos-catalogo.ts)");
  assert.equal(new Set(Object.values(casa)).size, 8, "cada aviso, su propio sonido");
});

// ———————————————————————————— 3. la lectura avisa, no se cae ————————————————————————————

const UNA = { fichero: "activos/sonidos/x/x-01.opus", sha256: "a".repeat(64), bytes: 10, peso: 1, respaldo: "activos/sonidos/x/x-01.m4a", respaldo_sha256: "b".repeat(64), respaldo_bytes: 12 };
const UNO = { id: "x", uso: "prueba", bus: "efectos", lote: "nucleo", prioridad: 50, cooldown_ms: 10, texto: "un sonido de prueba", duracion_s: 0.1, bucle: false, licencia: "CC0-1.0", autor: ["yo"], fuente: ["https://e/x"], variantes: [UNA] };
const cat = (extra: Record<string, unknown> = {}, sonidos: unknown[] = [UNO]) => leerCatalogo({ schema: "numinia-engine/sonidos@1", sonidos, ...extra });

test("S6: el catálogo de verdad se lee entero y sin un solo aviso", () => {
  const c = leerCatalogo(catalogo);
  assert.deepEqual(c.problemas, []);
  assert.equal(c.sonidos.size, sonidos().length);
  assert.equal(Object.keys(c.casa).length, 8);
});

test("S6: una línea mal escrita se queda fuera con un aviso claro, y el resto del catálogo sigue sonando", () => {
  const malos: [unknown, RegExp][] = [
    [{ ...UNO, id: "MAL ID" }, /id «MAL ID»/],
    [{ ...UNO, bus: "inventado" }, /bus debe ser uno de los ocho/],
    [{ ...UNO, bus: "master" }, /nada suena directamente en el máster/],
    [{ ...UNO, texto: "  " }, /falta «texto»/],
    [{ ...UNO, licencia: "CC-BY-4.0" }, /solo entra CC0-1\.0/],
    [{ ...UNO, variantes: [] }, /al menos una variante/],
    [{ ...UNO, variantes: [{ ...UNA, sha256: "no-es-un-sha" }] }, /64 caracteres hexadecimales/],
    [{ ...UNO, variantes: [{ ...UNA, fichero: "/etc/passwd" }] }, /viven en activos\/sonidos/],
    [{ ...UNO, variantes: [{ ...UNA, respaldo: "x.ogg" }] }, /falta el respaldo \.m4a/],
  ];
  for (const [malo, aviso] of malos) {
    const c = cat({}, [malo, { ...UNO, id: "bueno" }]);
    assert.equal(c.sonidos.size, 1, `${JSON.stringify(malo).slice(0, 60)}: debería quedar solo «bueno»`);
    assert.ok(c.sonidos.has("bueno"));
    assert.ok(c.problemas.some((p) => aviso.test(p)), `no avisó de ${aviso}: ${c.problemas.join(" | ")}`);
  }
});

test("S6: un catálogo roto de arriba abajo no lanza: devuelve cero sonidos y lo dice", () => {
  for (const basura of [null, undefined, 42, "hola", [], {}, { sonidos: "no es una lista" }, { sonidos: [null, 1, "x"] }]) {
    const c = leerCatalogo(basura);
    assert.equal(c.sonidos.size, 0);
    assert.ok(c.problemas.length > 0, `${JSON.stringify(basura)} debería avisar`);
  }
  assert.ok(leerCatalogo({ sonidos: [] }).problemas.some((p) => /schema/.test(p)), "un schema que no es el nuestro se avisa");
  // dos veces el mismo id: se queda el primero y se dice
  const dos = cat({}, [UNO, { ...UNO, texto: "otro" }]);
  assert.equal(dos.sonidos.size, 1);
  assert.ok(dos.problemas.some((p) => /id repetido/.test(p)));
  // un aviso de la casa que apunta a la nada se queda sin fichero (y con su pitido), sin tirar nada
  const casa = cat({ casa: { exito: "no-existe", aviso: "x" } });
  assert.deepEqual(Object.keys(casa.casa), ["aviso"]);
  assert.ok(casa.problemas.some((p) => /no-existe/.test(p) && /pitido/.test(p)));
  assert.equal(typeof leerVariante({}), "string");
  assert.equal(typeof leerSonido({}), "string");
});

test("S6: un sha256 que no cuadra tira SOLO esa variante, con su aviso; si no cuadra ninguna, el mundo sigue", () => {
  const tres = { ...UNO, variantes: [UNA, { ...UNA, fichero: "activos/sonidos/x/x-02.opus", sha256: "c".repeat(64) }] };
  const c = cat({ casa: { aviso: "x" } }, [tres]);
  // solo la primera está en este servidor
  const avisos = comprobarFicheros(c, (sha) => sha === UNA.sha256);
  assert.equal(c.sonidos.get("x")!.variantes.length, 1, "la variante que no está se cae");
  assert.ok(avisos.some((p) => /c{12}….opus/.test(p) || /no hay ningún/.test(p)), avisos.join(" | "));
  assert.ok(c.sonidos.has("x"), "el id sigue: le queda una variante buena");

  // ninguna cuadra: el id se va, el aviso de la casa vuelve a su pitido, y NO se lanza nada
  const d = cat({ casa: { aviso: "x" } }, [tres]);
  const avisos2 = comprobarFicheros(d, () => false);
  assert.equal(d.sonidos.size, 1, "nadie respondió: este servidor no tiene índice, no se quita nada");
  assert.ok(avisos2.some((p) => /no tiene índice de activos/.test(p)), avisos2.join(" | "));

  const e = cat({ casa: { aviso: "x" } }, [tres, { ...UNO, id: "otro", variantes: [{ ...UNA, sha256: "d".repeat(64) }] }]);
  const avisos3 = comprobarFicheros(e, (sha) => sha === UNA.sha256);
  assert.deepEqual([...e.sonidos.keys()], ["x"], "«otro» no tiene ningún fichero aquí: fuera");
  assert.deepEqual(e.casa, { aviso: "x" });
  assert.ok(avisos3.some((p) => /ninguno de sus ficheros está aquí/.test(p)));
});

// ———————————————————————————— 4. el servidor manda: id, semilla y a quién ————————————————————————————

function mundo(opts: { activo?: boolean; cable?: unknown[] } = {}) {
  const log: string[] = [];
  let suena!: Suena;
  const leido = leerDisparadores({ disparadores: opts.cable ?? [] });
  const inst = new Instance({
    seed: 1, capacity: 8, k: 50, snapshotEvery: 2, log: (l) => log.push(l), identitySign: sign,
    activo: () => opts.activo !== false,
    features: [crearDisparadores({ disparadores: leido.disparadores }), crearSonido({ alArrancar: (f) => { suena = f; } })],
  });
  const pages = Array.from({ length: 2 }, (_, i) => {
    const t = inst.join(i), c = clienteSonido(), d = clienteDisparadores();
    const s = new ClientSession(t, { identity: keeper(), features: [c.part, ...d.parts], view: { label() {}, bounce() {}, place() {}, here: () => ({ x: 0, y: 0, z: 0 }) } });
    return { t, s, oido: c.estado, cable: d.disparadores };
  });
  const pump = (ticks = 3) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  /** Pone a una persona donde nos convenga: el servidor lee el sitio de la simulación, no lo que diga la página. */
  const poner = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, pages, pump, poner, log, suena: (...a: Parameters<Suena>) => suena(...a) };
}
const eventos = (s: ClientSession) => s.features.log.filter((l) => l.feature === "sonido" && l.event === "suena");

test("S6: el servidor manda el sonido y la SEMILLA, y las dos páginas reciben exactamente la misma", () => {
  const m = mundo();
  m.pump();
  assert.ok(m.suena("ui-aviso"), "«ui-aviso» está en el catálogo");
  m.pump();
  const a = eventos(m.pages[0].s), b = eventos(m.pages[1].s);
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.equal(a[0].msg.sonido, "ui-aviso");
  assert.equal(a[0].msg.semilla, b[0].msg.semilla, "la semilla la decide el servidor: una sola, igual para todos");
  assert.equal(a[0].msg.espacial, false, "sin «donde», el sonido va en la cabeza");
  assert.equal(a[0].msg.texto, catalogo.sonidos.find((s) => s.id === "ui-aviso")!.texto, "el texto accesible viaja con el sonido");
  assert.equal(m.pages[0].oido.ultimo!.donde, null, "la página lo recibe sin sitio: sin panner");
});

test("S6: `suena` a una sola persona llega solo a ella; con sitio, llega con sus metros y no más lejos", () => {
  const m = mundo();
  m.pump();
  m.suena("ui-chat", { para: m.pages[1].s.entity });
  m.pump();
  assert.equal(eventos(m.pages[0].s).length, 0, "no era para esta página");
  assert.equal(eventos(m.pages[1].s).length, 1);
  // una al lado del sonido y la otra a 300 m: el de lejos no lo oye (el alcance es del servidor, no de la página)
  m.poner(m.pages[0].s.entity, 4, -2);
  m.poner(m.pages[1].s.entity, 300, 300);
  m.pump();
  const antes = eventos(m.pages[1].s).length;
  m.suena("dados", { donde: { x: 4, y: 1, z: -2 } });
  m.pump();
  const ev = eventos(m.pages[0].s).at(-1)!;
  assert.ok(ev, "la que está encima sí lo oye");
  assert.equal(ev.msg.espacial, true);
  assert.deepEqual([ev.msg.x, ev.msg.y, ev.msg.z], [4, 1, -2]);
  assert.deepEqual(m.pages[0].oido.ultimo!.donde, { x: 4, y: 1, z: -2 });
  assert.equal(eventos(m.pages[1].s).length, antes, "a 300 m no se oye un dado");
});

test("S6: un id que no existe no rompe el mundo: devuelve false, lo dice en el registro y nadie oye nada", () => {
  const m = mundo();
  m.pump();
  assert.equal(m.suena("no-existe-ni-de-broma"), false);
  m.pump();
  assert.equal(eventos(m.pages[0].s).length, 0);
  assert.ok(m.log.some((l) => /no está en el catálogo/.test(l)), m.log.join(" | "));
  // y el mundo sigue vivo: el siguiente sí suena
  assert.equal(m.suena("ui-error"), true);
});

test("S6: el cable del mundo enciende la pieza sin escribir código (R-1): un botón con «suena»", () => {
  const m = mundo({ cable: [{ id: "timbre", nombre: "Timbre", tipo: "boton", x: 0, z: 0, frase: "E: llamar", receptores: [{ accion: "suena", sonido: "ui-aviso" }] }] });
  m.pump();
  m.poner(m.pages[0].s.entity, 0, 0);     // hay que estar al lado del botón para pulsarlo
  m.pump();
  const antes = eventos(m.pages[0].s).length;
  m.pages[0].cable.pulsar("timbre");
  m.pump(6);
  const ahora = eventos(m.pages[0].s);
  assert.equal(ahora.length, antes + 1, "el receptor «suena» del cable ahora suena de verdad");
  assert.equal(ahora.at(-1)!.msg.sonido, "ui-aviso");
  assert.equal(ahora.at(-1)!.msg.espacial, false, "un sonido de interfaz va en la cabeza, no en el sitio del botón");
});

test("S6: un servidor sin índice de activos no se queda muerto: avisa una vez y sirve el catálogo entero", () => {
  const m = mundo({ activo: false });
  m.pump();
  assert.ok(m.log.some((l) => /no tiene índice de activos/.test(l)), m.log.join(" | "));
  assert.equal(m.suena("ui-aviso"), true, "mejor sonar sin comprobar que no sonar");
});

test("S6: la tabla de la página no lleva sha256 ni licencias, y apunta a /a/<sha256>.opus", () => {
  const t = tablaDePagina(leerCatalogo(catalogo)) as { sonidos: Record<string, { variantes: { url: string; respaldo: string }[]; texto: string }> };
  const crudo = JSON.stringify(t);
  assert.ok(!/"sha256"/.test(crudo) && !/licencia/.test(crudo) && !/autor/.test(crudo), "la página no necesita la procedencia");
  const uno = t.sonidos["ui-aviso"];
  assert.match(uno.variantes[0].url, /^\/a\/[0-9a-f]{64}\.opus$/);
  assert.match(uno.variantes[0].respaldo, /^\/a\/[0-9a-f]{64}\.m4a$/);
  assert.ok(uno.texto.length > 3, "el texto accesible sí va a la página");
  // una fila de receta llega a la página sin variantes, pero con su bus, su prioridad, su cooldown y su texto
  const receta = (t.sonidos as Record<string, { fuente?: string; variantes: unknown[]; texto: string }>)["salto"];
  assert.equal(receta.fuente, "receta");
  assert.deepEqual(receta.variantes, [], "una fila de receta no lleva ficheros a la página");
  assert.ok(receta.texto.length > 3, "pero sí su texto accesible");
  assert.ok(crudo.length < 24_000, `la tabla son ${crudo.length} B: demasiado para una descarga de arranque`);
});

// ———————————— 4b. S6f · lo COMPARTIDO lo manda el servidor: la pieza se asoma a los eventos que ya hay ————————————

/** Un mundo con dados Y sonido: la pieza de sonido escucha `dados:tirada` y manda el sonido a quien esté cerca. Es el
 *  reparto de autoridad de D-048: la página no dispara una tirada de dados por su cuenta, porque entonces cada
 *  persona oiría su propia variante. */
function mundoConDados() {
  const log: string[] = [];
  const inst = new Instance({
    seed: 1, capacity: 8, k: 50, snapshotEvery: 2, log: (l) => log.push(l), identitySign: sign,
    features: [crearDados({ torres: [] }), crearSonido({})],
  });
  const pages = Array.from({ length: 2 }, (_, i) => {
    const t = inst.join(i), c = clienteSonido(), d = clienteDados();
    const s = new ClientSession(t, { identity: keeper(), features: [c.part, ...d.parts], view: { label() {}, bounce() {}, place() {}, here: () => ({ x: 0, y: 0, z: 0 }) } });
    return { t, s, oido: c.estado, dados: d.dados };
  });
  const pump = (ticks = 3) => { for (let i = 0; i < ticks; i++) { for (const c of pages) c.t.flush(); inst.tick(); for (const c of pages) c.t.flush(); } };
  const poner = (e: number, x: number, z: number) => { inst.sim.tf.cols.x[e] = fx(x); inst.sim.tf.cols.z[e] = fx(z); };
  return { inst, pages, pump, poner, log };
}

test("S6f: una tirada de dados la SUENA el servidor, con una sola semilla para las dos páginas", () => {
  const m = mundoConDados();
  m.pump();
  // las dos personas, juntas: el sonido de los dados es de los de alrededor, y el alcance lo pone el servidor
  for (const c of m.pages) m.poner(c.s.entity, 0, 0);
  m.pump();
  assert.ok(m.pages[0].dados.tirar("2d6").ok, "la página pide la tirada (eso sí es suyo)");
  m.pump();
  const a = eventos(m.pages[0].s), b = eventos(m.pages[1].s);
  assert.equal(a.length, 1, "el servidor mandó UN sonido de dados");
  assert.equal(a[0].msg.sonido, "dados");
  assert.equal(a[0].msg.semilla, b[0].msg.semilla, "una sola semilla: las dos páginas eligen la misma variante");
  assert.equal(a[0].msg.espacial, true, "y con sitio: los de alrededor lo oyen desde donde está quien tiró");
  assert.ok(m.pages[1].oido.ultimo!.donde, "la otra página lo recibe con su sitio, no en la cabeza");
});

test("S6f: sin la pieza de sonido, los dados siguen funcionando (nadie depende del sonido)", () => {
  const log: string[] = [];
  const inst = new Instance({ seed: 1, capacity: 8, k: 50, snapshotEvery: 2, log: (l) => log.push(l), identitySign: sign, features: [crearDados({ torres: [] })] });
  const t = inst.join(0), d = clienteDados();
  const s = new ClientSession(t, { identity: keeper(), features: d.parts });
  for (let i = 0; i < 3; i++) { t.flush(); inst.tick(); t.flush(); }
  assert.ok(d.dados.tirar("1d6").ok);
  for (let i = 0; i < 3; i++) { t.flush(); inst.tick(); t.flush(); }
  assert.equal(s.features.log.filter((l) => l.feature === "sonido").length, 0, "ni un evento de sonido, y la tirada salió");
});

// ———————————————————————————— 5. la página: misma semilla, cooldown, sin panner ————————————————————————————

type Nodo = { tipo: string; connect(d: unknown): unknown; disconnect(): void } & Record<string, unknown>;
const param = (v = 1) => ({
  value: v,
  setTargetAtTime(x: number) { this.value = x; }, setValueAtTime(x: number) { this.value = x; },
  linearRampToValueAtTime(x: number) { this.value = x; }, exponentialRampToValueAtTime(x: number) { this.value = x; },
  cancelScheduledValues() {},
});
/** Un `AudioContext` de mentira: apunta cada nodo y cada conexión (la FORMA del grafo, no el sonido). */
function falso() {
  const conexiones: [unknown, unknown][] = [], nodos: Nodo[] = [];
  const nodo = (tipo: string, extra: Record<string, unknown> = {}): Nodo => {
    const n = { tipo, connect(d: unknown) { conexiones.push([n, d]); return d; }, disconnect() {}, ...extra } as Nodo;
    nodos.push(n); return n;
  };
  const ctx = {
    state: "running" as AudioContextState, currentTime: 0, destination: { tipo: "destino" },
    listener: Object.fromEntries(["positionX", "positionY", "positionZ", "forwardX", "forwardY", "forwardZ", "upX", "upY", "upZ"].map((k) => [k, param(0)])),
    createGain: () => nodo("gain", { gain: param(1) }),
    createBiquadFilter: () => nodo("filtro", { type: "", frequency: param(350), Q: param(1) }),
    createPanner: () => nodo("panner", { panningModel: "equalpower", distanceModel: "inverse", refDistance: 1, maxDistance: 10000, rolloffFactor: 1, coneInnerAngle: 360, coneOuterAngle: 360, coneOuterGain: 0, positionX: param(0), positionY: param(0), positionZ: param(0) }),
    createBufferSource: () => nodo("fuente", { buffer: null, loop: false, playbackRate: param(1), onended: null, start() {}, stop() {} }),
    createOscillator: () => nodo("oscilador", { type: "", frequency: param(440), start() {}, stop() {} }),
    createMediaElementSource: () => nodo("medio"),
    createDynamicsCompressor: () => nodo("limitador", { threshold: param(0), knee: param(30), ratio: param(12), attack: param(0.003), release: param(0.25) }),
    decodeAudioData: async () => ({ duration: 0.2, length: 9600, numberOfChannels: 1, sampleRate: 48000 }) as unknown as AudioBuffer,
    suspend() { return Promise.resolve(); }, resume() { return Promise.resolve(); }, addEventListener() {},
  };
  return { ctx, conexiones, nodos, crear: () => ctx as unknown as AudioContext };
}

/** Una página de mentira con la tabla de verdad del catálogo ya puesta. Apunta qué URI pidió cada voz. */
function pagina(opts: { formato?: "opus" | "m4a" } = {}) {
  const f = falso();
  const nucleo = crearNucleo({ crear: f.crear, hayGesto: () => true, trasGesto: (fn) => fn(), enCadaGesto: () => {}, visibilidad: () => false });
  const pedidas: string[] = [];
  const voces = crearVoces({ nucleo, nivel: "A", traer: async (uri) => { pedidas.push(uri); return new ArrayBuffer(8); } });
  const s = crearSonidos({ nucleo, voces, traer: async () => tablaDePagina(leerCatalogo(catalogo)), puede: () => (opts.formato ?? "opus") === "opus" });
  return { ...f, nucleo, voces, s, pedidas, avanzar: (seg: number) => { f.ctx.currentTime += seg; } };
}

test("S6: la misma semilla elige la misma variante en dos páginas (clientes distintos, mismo instante)", async () => {
  // una página nueva por disparo: `voces.ts` guarda cada fichero en caché y solo lo PIDE la primera vez, así que una
  // página sola no cuenta dos veces lo mismo. Lo que se compara es qué URI pidió cada cliente con cada semilla.
  const tabla = tablaDePagina(leerCatalogo(catalogo));
  const tiro = async (semilla: number): Promise<string> => {
    const p = pagina();
    p.s.poner(tabla);
    assert.equal(p.s.suena({ id: "golpe-material", semilla, donde: { x: 1, y: 0, z: 0 } }), true);
    return p.pedidas.at(-1)!;
  };
  // «golpe-material» tiene 12 variantes: si dos clientes coinciden doce veces seguidas, no es casualidad
  const unas: string[] = [], otras: string[] = [], terceras: string[] = [];
  for (let i = 0; i < 12; i++) {
    const semilla = 1000 + i * 7919;
    unas.push(await tiro(semilla));
    otras.push(await tiro(semilla));
    terceras.push(await tiro(semilla + 1));
  }
  assert.deepEqual(unas, otras, "con la semilla del servidor, los dos clientes piden el mismo fichero");
  assert.ok(new Set(unas).size > 1, `doce semillas deberían repartirse entre las variantes, y salieron ${new Set(unas).size}`);
  assert.ok(terceras.some((t, i) => t !== unas[i]), "otra semilla puede dar otra variante");
  assert.ok(unas.every((u) => /^\/a\/[0-9a-f]{64}\.opus$/.test(u)), "cada variante se pide por su sha256");
});

test("S6: el cooldown del catálogo corta la repetición (ui-logro: 400 ms)", () => {
  const p = pagina();
  assert.ok(p.s.poner(tablaDePagina(leerCatalogo(catalogo))));
  assert.equal(p.s.suena({ id: "ui-logro", semilla: 1 }), true, "el primero suena");
  assert.equal(p.s.suena({ id: "ui-logro", semilla: 2 }), false, "el segundo, dentro del cooldown, no");
  p.avanzar(0.2);
  assert.equal(p.s.suena({ id: "ui-logro", semilla: 3 }), false, "a 200 ms sigue cortado (el catálogo pide 400)");
  p.avanzar(0.25);
  assert.equal(p.s.suena({ id: "ui-logro", semilla: 4 }), true, "pasados los 400 ms vuelve a sonar");
});

test("S6 (probado con contexto falso): un aviso sale por el bus «interfaz» y SIN panner; un sonido del mundo sí lo lleva", () => {
  const p = pagina();
  assert.ok(p.s.poner(tablaDePagina(leerCatalogo(catalogo))));
  // un aviso: en la cabeza
  assert.equal(p.s.suena({ id: "ui-aviso", semilla: 7 }), true);
  assert.equal(p.nodos.filter((n) => n.tipo === "panner").length, 0, "un aviso NO construye panner: va en la cabeza");
  const filtro = p.nodos.find((n) => n.tipo === "filtro")!;
  assert.ok(p.conexiones.some(([de, a]) => de === filtro && a === p.nucleo.bus("interfaz")), "el aviso entra en el bus «interfaz» del núcleo");
  assert.ok(!p.conexiones.some(([, a]) => a === p.nucleo.bus("efectos")), "un aviso no pasa por «efectos»");
  // un sonido del mundo: con panner y en su sitio
  p.avanzar(1);
  assert.equal(p.s.suena({ id: "dados", semilla: 9, donde: { x: 5, y: 0, z: 0 } }), true);
  const panner = p.nodos.find((n) => n.tipo === "panner");
  assert.ok(panner, "un sonido con sitio sí construye panner");
  assert.equal((panner!.positionX as { value: number }).value, 5);
  assert.ok(p.conexiones.some(([de, a]) => de === panner && a === p.nucleo.bus("efectos")));
});

test("S6: sin tabla no suena nada y nada se rompe; una tabla basura tampoco tira la página", async () => {
  const p = pagina();
  assert.equal(p.s.listo(), false);
  assert.equal(p.s.suena({ id: "ui-aviso" }), false, "sin tabla, quien llama se queda con su respaldo");
  assert.equal(p.s.casa("exito"), null);
  for (const basura of [null, 42, "x", [], {}, { sonidos: 1 }]) assert.equal(p.s.poner(basura), false, `${JSON.stringify(basura)} no debería entrar`);
  assert.equal(p.s.listo(), false);
  assert.ok(await p.s.cargar());
  assert.equal(p.s.suena({ id: "no-existe" }), false, "un id que no existe: false, sin lanzar");
  assert.equal(p.s.casa("exito"), "ui-confirmar");
  assert.ok(p.s.estado().avisos.some((a) => /no está en el catálogo/.test(a)));
});

test("S6: una tabla a medias se lee a medias (lo bueno se queda, lo roto se dice)", () => {
  const avisos: string[] = [];
  const t = leerTabla({ casa: { exito: "a", aviso: "falta" }, sonidos: { a: { bus: "interfaz", variantes: [{ url: "/a/x.opus", respaldo: "/a/x.m4a", peso: 2 }, { url: "mal" }] }, b: { variantes: [] } } }, (m) => avisos.push(m));
  assert.ok(t);
  assert.deepEqual(Object.keys(t!.sonidos), ["a"]);
  assert.equal(t!.sonidos.a.variantes.length, 1);
  assert.deepEqual(t!.casa, { exito: "a" });
  assert.equal(avisos.length, 3, avisos.join(" | "));
  assert.equal(leerTabla(null), null);
});

test("S6: en Safari viejo se piden los .m4a; con Opus, los .opus", async () => {
  for (const formato of ["opus", "m4a"] as const) {
    const p = pagina({ formato });
    assert.ok(await p.s.cargar());
    assert.equal(p.s.estado().formato, formato);
    p.s.suena({ id: "ui-aviso", semilla: 3 });
    assert.ok(p.pedidas.at(-1)!.endsWith(`.${formato}`), `${formato}: pidió ${p.pedidas.at(-1)}`);
  }
});

test("S6: dos semillas pegadas dan variantes distintas (xorshift32 solo no avalancha; el mezclador sí)", async () => {
  const { azarDe, mezclar } = await import("../packages/render/src/audio/voces.ts");
  // 1000 y 1001 se diferencian en un bit: sin mezclador daban el mismo primer número y siempre la misma variante
  let distintos = 0;
  for (let s = 1000; s < 1064; s++) if (Math.floor(azarDe(s, "golpe-material")() * 12) !== Math.floor(azarDe(s + 1, "golpe-material")() * 12)) distintos++;
  assert.ok(distintos > 48, `de 64 semillas pegadas solo ${distintos} cambiaron de variante`);
  assert.equal(mezclar(0), 0);
  assert.notEqual(mezclar(1), mezclar(2));
});

test("S6: la variación de tono y volumen está puesta (doce golpes no suenan a bucle)", () => {
  assert.ok(VARIACION.tono > 0 && VARIACION.tono <= 0.1);
  assert.ok(VARIACION.volumen > 0 && VARIACION.volumen <= 0.3);
  assert.equal(RUTA_TABLA, "/sonidos.json");
});

// ———————————————————————————— 6. los siete avisos de la casa ————————————————————————————

test("S6: los siete avisos de misiones.ts tocan el FICHERO cuando hay catálogo, y el pitido cuando no", async () => {
  const { NOTAS_CASA, ponerCatalogoCasa, sonarCasa, sonarCompletada } = await import("../apps/plaza/misiones.ts");
  const ajuste = () => 80;
  // sin catálogo: los osciladores de siempre (el respaldo sigue vivo)
  ponerCatalogoCasa(null);
  const f = falso();
  assert.equal(sonarCasa(() => f.ctx as unknown as AudioContext, ajuste, "exito"), true);
  assert.ok(f.nodos.length > 0, "sin catálogo, el respaldo sintetizado suena");

  // con catálogo: el fichero, y NO el oscilador
  const p = pagina();
  assert.ok(p.s.poner(tablaDePagina(leerCatalogo(catalogo))));
  ponerCatalogoCasa(p.s);
  const g = falso();
  const nombres = [...Object.keys(NOTAS_CASA), "completada"];
  assert.equal(nombres.length, 8, "los siete avisos de la casa más el acorde de «completada»");
  for (const n of nombres) {
    p.avanzar(2);
    const ok = n === "completada" ? sonarCompletada(() => g.ctx as unknown as AudioContext, ajuste) : sonarCasa(() => g.ctx as unknown as AudioContext, ajuste, n);
    assert.equal(ok, true, `«${n}» debería sonar`);
    assert.equal(p.s.casa(n) !== null, true, `«${n}» no tiene fichero en el catálogo`);
  }
  assert.equal(g.nodos.filter((x) => x.tipo === "oscilador").length, 0, "con catálogo no se sintetiza nada");
  assert.equal(p.s.estado().tocados, 8, "los ocho salieron del catálogo");
  assert.equal(p.nodos.filter((x) => x.tipo === "panner").length, 0, "ninguno lleva panner: los avisos van en la cabeza");
  ponerCatalogoCasa(null);
});

// ———————————————————————————— 7. el peso del arranque ————————————————————————————

test("S6: el servidor de verdad sirve /sonidos.json y cada .opus por su sha256, con caché de un año", async () => {
  const { startServer } = await import("../packages/server/src/server.ts");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { crearSonido: crear } = await import("../features/sonido/server.ts");
  const srv = await startServer({ port: 0, host: "127.0.0.1", statsMs: 60_000, features: [crear()], aventura: mkdtempSync(join(tmpdir(), "sonidos-")), secret: "una-clave-de-prueba-larga-s6", log: () => {}, version: "prueba" });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const r = await fetch(`${base}${RUTA_TABLA}`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /application\/json/);
    assert.match(r.headers.get("cache-control") ?? "", /max-age=1800/); // la tabla se guarda media hora
    const t = leerTabla(await r.json());
    assert.ok(t, "la tabla que sirve el motor se lee");
    assert.equal(Object.keys(t!.sonidos).length, sonidos().length);
    assert.equal(Object.keys(t!.casa).length, 8);

    // y el fichero de la primera variante de un aviso baja entero, con su peso y su sha256
    const uno = sonidos().find((s) => s.id === t!.casa.exito)!;
    const a = await fetch(`${base}${t!.sonidos[uno.id].variantes[0].url}`);
    assert.equal(a.status, 200);
    assert.equal(a.headers.get("content-type"), "audio/ogg");
    assert.match(a.headers.get("cache-control") ?? "", /max-age=31536000, immutable/);
    const bytes = new Uint8Array(await a.arrayBuffer());
    assert.equal(sha256(bytes), uno.variantes[0].sha256, "lo que sirve /a/ es el fichero del catálogo, byte a byte");
    assert.equal(bytes.length, uno.variantes[0].bytes);
    // el respaldo .m4a también se sirve (Safari viejo, iOS)
    const b = await fetch(`${base}${t!.sonidos[uno.id].variantes[0].respaldo}`);
    assert.equal(b.status, 200);
    assert.equal(b.headers.get("content-type"), "audio/mp4");
  } finally { await srv.close(); }
});

test("S6: ni un .opus ni el catálogo entran en el paquete de arranque (nadie los importa desde la página)", () => {
  const miro = ["apps/plaza", "packages/render/src", "packages/client/src", "packages/feature/src", "features"];
  const malos: string[] = [];
  const andar = (dir: string): void => {
    for (const d of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${d.name}`;
      if (d.isDirectory()) { andar(rel); continue; }
      if (!/\.ts$/.test(d.name)) continue;
      const texto = readFileSync(join(RAIZ, rel), "utf8");
      // el catálogo (52 kB) solo lo importa el SERVIDOR: la página se trae la tabla por HTTP
      if (/from\s+"[^"]*sonido\/catalogo\.json"/.test(texto) && rel !== "features/sonido/server.ts") malos.push(`${rel} importa el catálogo`);
      if (/from\s+"[^"]*\.opus"/.test(texto) || /from\s+"[^"]*\.m4a"/.test(texto)) malos.push(`${rel} importa un fichero de audio`);
    }
  };
  for (const d of miro) andar(d);
  assert.deepEqual(malos, [], "algo de la página se lleva el catálogo o un sonido al paquete de arranque");
  // y los ficheros no están donde vite los copiaría solos
  assert.ok(!readdirSync(join(RAIZ, "apps/plaza")).includes("sonidos"), "los sonidos no van en apps/plaza/");
});
