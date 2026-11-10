# Guardar lo que tiene que sobrevivir a un reinicio (S4)

- `state: { …, persist: true }` — el estado compartido se guarda y vuelve al arrancar (antes de que entre
  nadie), comprobado contra el esquema de hoy.
- `store: { describe: "…" }` — da `api.store.get/set/delete/keys`: datos solo del servidor, nunca van a las
  páginas (inventarios, quién reclamó qué y cuándo). JSON de hasta 4.096 bytes por clave, 10.000 claves.
- Se escribe en `DATOS_DIR/<id>.json` + `<id>.jsonl` (en casa `.run/datos/`; instalado
  `/var/lib/numinia-motor/datos/`). Un apagón pierde como mucho el último segundo.
- Si cambias la forma del estado, sube `version`: lo guardado que ya no cumpla el esquema se descarta y se
  dice en el registro. Ejemplo: `features/despertar` (almacén con la última vez y cuántas veces).
- Leer lo guardado sin el servidor (herramientas de solo lectura): `leerFoto` y `repetirDiario` (`datos.ts`) pliegan una
  foto y su diario como al arrancar, y `leerFuncion` (`mundo-zip.ts`) los toma del mismo momento con el servidor en marcha.
  Así lee `npm run concesiones` (`packages/server/src/concesiones.ts`) las recompensas concedidas (U14 (6)).
