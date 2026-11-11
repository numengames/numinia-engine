// MIS-265: the photo as the world's cover. ponerPortada moved out of main.ts into foto-portada.ts (P10: first-load weight, it is fetched
// when «Usar de portada» is pressed); this pins that it does what it did.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ponerPortada } from "../apps/plaza/foto-portada.ts";
import { fijarIdioma } from "../packages/client/src/idioma.ts";
fijarIdioma("es"); // these checks assert the Spanish text; English is covered in test/idioma-simposio-b.test.ts

type Aj = Parameters<typeof ponerPortada>[0];
const ajustes = (o: { actual?: object | null; rechazo?: string; guardado?: { ok: boolean; why?: string } } = {}): Aj & { visto: object[] } => {
  const visto: object[] = [];
  const a = {
    visto,
    estado: { cambios: 0, ultimoRechazo: "" },
    actual: () => (o.actual === undefined ? { nombre: "Mundo", portada: a.portadaPuesta, avatar: "x", aforo: 5 } : o.actual),
    portadaPuesta: "",
    guardar: (c: { portada: string }) => {
      visto.push(c);
      if (o.guardado && !o.guardado.ok) return o.guardado;
      if (o.rechazo) a.estado.ultimoRechazo = o.rechazo; else { a.portadaPuesta = c.portada; a.estado.cambios++; }
      return { ok: true };
    },
  };
  return a as unknown as Aj & { visto: object[] };
};
const subir = async () => ({ ok: true as const, nombre: "sha.jpg" });
const f = new File(["x"], "p.jpg");

test("foto-portada: no settings, no name and a failed upload say why; nothing is saved", async () => {
  assert.deepEqual(await ponerPortada(ajustes({ actual: null }), subir, f), { ok: false, why: "este servidor no tiene ajustes del mundo" });
  const sinNombre = ajustes({ actual: { nombre: "  ", avatar: "", aforo: 1 } });
  assert.equal((await ponerPortada(sinNombre, subir, f) as { why: string }).why.startsWith("ponle antes un nombre"), true);
  const a = ajustes();
  assert.deepEqual(await ponerPortada(a, async () => ({ ok: false as const, why: "pesa demasiado" }), f), { ok: false, why: "pesa demasiado" });
  assert.equal(a.visto.length, 0);
});

test("foto-portada: the server saves it → ok, with every other setting kept; a refusal comes back without its final dot", async () => {
  const a = ajustes();
  assert.deepEqual(await ponerPortada(a, subir, f), { ok: true });
  assert.deepEqual(a.visto, [{ nombre: "Mundo", portada: "sha.jpg", avatar: "x", aforo: 5 }]);
  const b = ajustes({ rechazo: "No puede cambiar el mundo." });
  assert.deepEqual(await ponerPortada(b, subir, f), { ok: false, why: "No puede cambiar el mundo" });
});
