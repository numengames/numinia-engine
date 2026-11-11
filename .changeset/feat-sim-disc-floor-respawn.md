---
"numinia-engine": minor
---

## 2026-11-11 20:20 · entorno · Round floor: past the radius of a disc you fall and come back at the spawn point (`suelo.forma: "disco"`) · hecho
- Qué: `entorno.json` accepts `suelo: { forma: "disco", radio: <metres> }` (radio 5–1900; `forma` is `plano` or `disco`, `plano` and no keys = today's endless flat floor). The flat floor at y = 0 then exists only within `radio` of the origin: the simulation (integers, squares taken on x, z, R >> 4 so they stay exact) holds nobody past it, a platform (box or mesh) outside is still a floor. The shape rides the flat entorno state (`sueloForma`, `sueloRadio`; the world's file's, no panel moves it) so the server's sim and the page's prediction agree. Under `sueloMinimo` (−50 m when the file gives none) the instance orders the return at the centre of `aparicion` (the origin without one), always there; the world's own `vuelta` wins. New in the sim: `setDisco`, `discoDelEstado`, `SUELO_MINIMO_DISCO`, `SimState.disco`.
- Números: `test/suelo-disco.test.ts` 6 tests (format and bad values with their paths, world without disc, sim edge cases incl. the 1900 m corner, instance + page in the shape of `mundo-local` with a 70 m disc: fall past −45 m, same fall predicted by the page, back at (0, 0, 3)); reference fingerprint unchanged (`7e630965`).
- Consumo: not measured · Sonnet 5.5.
- Cambio: minor (additive: new optional keys in `entorno.json`, new optional fields at the end of the entorno state). Commit: branch `wt/t_f2ee243a`.
- Siguiente: the disc is drawn as the endless plane (the render does not cut it round yet), and a disc is always centred on the origin.
