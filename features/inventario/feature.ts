// inventario — declaration (Y1). What a person owns in Numinia: one weapon carried, up to three relics carried, the
// rest in the Reserva; tokens (Semillas del Conocimiento, Células) stack and are never carried. Nothing here
// touches the simulation: it is per-guest data on S4 (`api.store`, key `i:<quien.id>`), sent whole to its owner.
// Objects come in from OTHER features (misiones today, R2 tomorrow) through one server-side door: they emit their
// own `otorga` event with scope "server" and this feature hears it (`api.listen`, J3). Rules: reglas.ts.
import { defineFeature } from "../../packages/feature/src/index.ts";
import { BOLSA_HUECOS, COLORES, LIM, TIPOS } from "./reglas.ts";

const ID = { kind: "text", maxBytes: 12 } as const;
const MOTIVO = { kind: "text", maxBytes: 120 } as const;
const OBJETO = {
  id: ID, tipo: { kind: "enum", values: TIPOS }, clase: { kind: "text", maxBytes: LIM.clase }, nombre: { kind: "text", maxBytes: LIM.nombre },
  icono: { kind: "text", maxBytes: LIM.icono, default: "" }, color: { kind: "enum", values: COLORES }, valor: { kind: "int", min: 0, max: 10000 },
  n: { kind: "int", min: 0, max: LIM.pila }, portado: { kind: "bool" },
} as const;

export const inventario = defineFeature({
  id: "inventario",
  version: 3, // v2: tipo «captura» (the fish of the pesca: stackable, never carried); v3: «La Bolsa galáctica» — 42 slots (`lista.huecos`), `rechazado.llena`; additive
  level: "base",
  describe: "Tu Inventario (canon: no una mochila, un diario en movimiento) como «Bolsa galáctica»: 42 huecos, uno por pila, para armas, reliquias, tokens y capturas. Llevas contigo 1 arma y hasta 3 reliquias (no ocupan hueco); el resto espera en tu Bolsa. Con la Bolsa llena, lo que necesita un hueco nuevo se rechaza. Los tokens (Semillas del Conocimiento) y las capturas (los peces que pescas, por especie) apilan. Se guarda por invitado y solo te llega a ti.",
  store: { describe: "Por invitado (`i:<id>`, y `i:<id>:1`… si no cabe en una clave): su Bolsa entera (serie para los ids, lista de objetos, de 14 en 14). Solo le llega a su dueño, como eventos." },
  intents: {
    equipar: { describe: "Llevar contigo un arma o una reliquia de tu Reserva (1 arma, 3 reliquias como mucho).", spoken: "llevar un objeto", fields: { id: ID }, rate: { perSecond: 4, burst: 8 } },
    desequipar: { describe: "Guardar en la Reserva algo que llevas contigo.", spoken: "guardar un objeto", fields: { id: ID }, rate: { perSecond: 4, burst: 8 } },
    soltar: { describe: "Tirar un objeto (n unidades de una pila; 0 = todas). No se recupera.", spoken: "tirar un objeto", fields: { id: ID, n: { kind: "int", min: 0, max: LIM.pila, default: 0 } }, rate: { perSecond: 2, burst: 4 } },
  },
  events: {
    lista: { describe: "Llega tu inventario entero (al entrar y tras cada cambio): olvida el anterior; detrás vienen sus objetos. `huecos` = cuántos huecos tiene tu Bolsa (los objetos que llevas contigo no ocupan).", fields: { total: { kind: "int", min: 0, max: LIM.reserva }, huecos: { kind: "int", min: 1, max: 200, default: BOLSA_HUECOS } }, announce: "silent" },
    objeto: { describe: "Un objeto tuyo: tipo (arma, reliquia, token, captura), clase (semilla…), nombre, icono de la casa, color (tokens; en una captura, su rareza: plateada común, azul rara, dorada legendaria), valor por unidad, cuántos y si lo llevas contigo.", fields: OBJETO, announce: "silent" },
    recibido: { describe: "Te han dado algo (y cuántos tienes ahora).", fields: { id: ID, nombre: { kind: "text", maxBytes: LIM.nombre }, n: { kind: "int", min: 1, max: LIM.pila } }, announce: { text: "Recibes {nombre}.", sound: "magia", importance: 1 } },
    rechazado: { describe: "Lo que pediste no se hizo, y por qué (`llena`: porque la Bolsa no tiene hueco libre).", fields: { motivo: MOTIVO, llena: { kind: "bool", default: false } }, announce: { text: "{motivo}", sound: "error", importance: 1 } },
  },
});
