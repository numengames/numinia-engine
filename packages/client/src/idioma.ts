// The language runtime lives in packages/feature/src/idioma.ts so that features/*/client.ts (which may import only core, schema and feature)
// can use tx()/ligar(). This file keeps the old path working: same module instance, same active language.
export * from "../../feature/src/idioma.ts";
