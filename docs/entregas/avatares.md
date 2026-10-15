# Entrega: avatares (rama `wt/avatares`, fila J1)

Proyecto: numinia-engine · Para: quien junta las ramas (y Pablo) · De: agente «avatares» (Opus) · Fecha: 2026-10-15 ·
Estado: hecho el trozo principal (tú y los cercanos en VRM con quieto/andar/trotar/correr/en el aire); lo que falta, abajo.

## Qué

En la plaza, **tú y los jugadores más cercanos sois humanoides VRM** que miran hacia donde andan y cambian de animación
según la velocidad (quieto < 0,3 m/s, andar, correr > 5 m/s, en el aire si suben); el resto siguen siendo cápsulas.
Tres avatares CC0 de la casa y cinco animaciones CC0 convertidas a `.vrma`. Todo se baja después del primer cuadro.

Ficheros nuevos:
- `packages/render/src/avatares.ts` — quién lleva VRM, dónde, mirando adónde, qué clip; esconde la cápsula (capas, no
  `.visible`) y la deja como ancla de etiquetas, saltitos y cámara. `view.avatares()` lo cuenta (para pruebas).
- `packages/render/src/avatares-politica.ts` — las decisiones, puras y probadas: tope por aparato, avatar por id,
  estado por velocidad, clip según la zancada del avatar, los más cercanos con margen, rumbo y velocidad suavizados.
- `packages/render/src/avatares-vrm.ts` — la mitad pesada (three-vrm, cargador glTF), import dinámico: un VRM
  analizado por fichero, clonado por jugador (SkeletonUtils + un `VRMHumanoid` nuevo sobre los huesos copiados),
  un clip por fichero × animación compartido por todas las copias; libera el esqueleto al soltar.
- `packages/server/src/vrm.ts` — lee un VRM sin three (versión, licencia de los metadatos, triángulos) y dice si la
  biblioteca lo admite (CC0 dentro del fichero, ≤ 10.000 triángulos). Sirve para H10 (subir avatares).
- `tools/vrma/` (`convertir.mjs` + `convertir.js` + `comprobar.js` + `pagina.html`) — UAL1 de Quaternius → `.vrma`, y
  comprobación en avatares reales (cadera, cabeza, punto más bajo, fotos con `--fotos`).
- `tools/avatares-catalogo.ts` → `activos/avatares/catalogo.json` (sha256, bytes, triángulos, licencia, pasos).
- `activos/avatares/` (3 `.vrm` + `LICENCIAS.md` + `catalogo.json`), `activos/animaciones/` (5 `.vrma` +
  `LICENCIAS.md` + `conversion.json`).
- `apps/plaza/catalogo-avatares.ts` — URLs por sha256 en el servidor de la instancia; `?sinavatares` = solo cápsulas.
- `test/avatares.test.ts` (6 pruebas: las decisiones), `test/avatares-biblioteca.test.ts` (3: ficheros, licencias,
  `.vrma`, el servidor), `tools/e2e-piernas/avatares.mjs` (pierna del e2e).

Ficheros compartidos tocados (pequeño y local, para juntar):
- `packages/render/src/index.ts`: 3 líneas de import junto a los de `sesion.ts`; opción `avatares` en la firma de
  `createView`; `const avs = createAvatares(…)` tras `createVR`; una llamada `avs.sync(…)` al final de `sync()` (tras
  los saltitos); método `avatares()` tras `labels()`; `|| avs.busy()` en `busy()`. La cámara (rama `camara`): uso
  `this.cam?.primeraPersona?.()` dentro de `sync`, así que si `view.cam` existe, tu VRM se esconde en primera persona.
  El salto (rama `salto`): el VRM se pone en `cápsula.y − 0,85`, así que la altura que ponga en la cápsula le llega sola.
- `apps/plaza/main.ts`: un import y la opción `avatares: { catalogo, yo: () => session.entity }` en `createView`.
- `packages/server/src/activos.ts`: `vrma` en `TIPOS`.
- `package.json` / `package-lock.json`: las dos dependencias.
- `limits.json`, `docs/FICHA-TECNICA.md`, `activos/README.md`, `packages/render/README.md`: números y filas nuevas.

## Decisiones (y por qué)
- **Avatares: 100Avatars de Polygonal Mind** (Astrodisco, Skelly, Polybot; 2.130–2.880 triángulos). CC0 dicho
  **dentro de cada fichero** (`licenseName: CC0`, uso comercial `Allow`) y **en la fuente** (publicación v24.02.1 del
  repositorio; registro Open Source Avatars de su CEO). Bytes idénticos al repositorio (blob de git comprobado).
  Dos notas para Pablo en `activos/avatares/LICENCIAS.md`: el README de 2020 «pide» no venderlos sin cambios, y los
  riggearon con el auto-rigger de Mixamo (sobre sus mallas; ninguna animación ni personaje de Mixamo dentro).
  **Marcar en SABER §3.3** si Pablo lo lee distinto.
- **Animaciones: `.vrma` de verdad** (no reasignación en tiempo de ejecución): UAL1 de Quaternius convertido con la
  misma idea que el `.glb` de Hyperfy (rotación de mundo respecto a su pose T, marco VRM 1.0, reposo identidad), así
  `VRMAnimationLoaderPlugin` lo pasa tal cual y three-vrm escala la cadera por la del avatar. Comprobado en 8
  avatares (pies en el suelo ±3 cm, sin errores) y a ojo en fotos. Clips: quieto (`Idle_Loop`), andar (`Walk_Loop`),
  trotar (`Jog_Fwd_Loop`), correr (`Sprint_Loop`), en el aire (`Jump_Loop`).
- **Andar elige zancada:** el simulador anda a 4 m/s (es un trote). Con la velocidad natural de cada ciclo medida por
  el conversor (alturas de cadera por segundo: andar 0,80, trotar 5,18, correr 7,77), un avatar alto anda despacio y
  trota a 4 m/s; el pequeño (Polybot) trota antes. El ritmo del clip se ajusta a la velocidad (0,5–2×).
- **Sin MToon en el motor.** `MToonNodeMaterial` funciona en los dos backends de WebGPURenderer (lo comprobé con el
  conversor), pero metía **~30 kB gz de TSL en el paquete de arranque** (`three/webgpu` es un módulo compartido y
  no se parte entre trozos). El material de reserva del propio fichero pasa a Lambert con su textura: alumbrado como
  el resto de la plaza y más barato que PBR en móvil. **Marcar en SABER §3.2.**
- **Sin las 16 formas de cara** (visemas, parpadeo) mientras no se usen: sombreador y memoria de GPU más pequeños.
- **De pie no cuenta como «ocupado»:** un avatar quieto cerca respira al ritmo de reposo (30 fps escritorio, 12 móvil);
  mantienen el dibujo rápido solo la carga, el fundido (0,2 s) y alguien cerca moviéndose. Si no, tu propio avatar
  tendría la página siempre a ritmo máximo. Más de 40 m: congelado. **Marcar en SABER §3.2.**
- **Sin pose en T:** un avatar se viste solo cuando su primer clip ha llegado; al cambiar, el viejo sigue hasta que el
  nuevo carga y entonces se funden (SABER §3.4). Los sombreadores se compilan antes de enseñarlo (`compileAsync`).
- Tope por aparato: 60 escritorio, 25 en XR, 12 móvil (`power.ts` no distingue C de D: D también 12, el estudio
  decía 6). En XR tu propio avatar no se dibuja (la cámara está en tu cabeza).
- Avatar por id de entidad (`id % 3`) hasta H10.

## Números (de una ejecución, 2026-10-15)
- Pruebas: **101 en verde** (9 nuevas: 6 en `test/avatares.test.ts`, 3 en `test/avatares-biblioteca.test.ts`).
  Puertas: en verde (plaza de 1.000: p99 7,6 ms).
- e2e (`tools/auto.sh e2e`, puertos 8805/5185/5195, núcleos 20-23), todas **OK**: chromium (movedZ −5,39, 6 draw
  calls, 2.751 triángulos), firefox (−6,0; 7; 2.763), AR (IWER), VR (IWER), avatares, https (−5,39; 13; 2.835).
  Una ejecución anterior (antes de compilar los sombreadores por adelantado y quitar las formas) falló la https por
  movimiento (−3,19 < −3,5): el tirón de cargar avatares en GL por software se come ticks (recorte de 250 ms de la
  página). Con el arreglo pasó; queda como riesgo de inestabilidad en máquinas cargadas.
- Pierna `avatares` (Chromium completa + Firefox ligera): las dos pestañas cargan y dibujan 2 VRM (el tuyo y el del
  otro), 0 fallos, 0 errores de página; B ve el avatar de A pasar de `quieto/quieto` a `andar/trotar` mientras A anda
  y volver a `quieto`; Firefox: 2 VRM por pestaña, 0 errores.
- Peso por avatar (medido en la descarga): Astrodisco **1.009 kB**, Skelly **1.142 kB**, Polybot 974 kB (del
  catálogo). Animaciones: 491 kB las cinco (con dos jugadores andando se bajaron cuatro: 358 kB).
- Coste de un cuadro con 2 VRM (Chromium, software): 6–15 draw calls, 2.700–5.700 triángulos (tope D: 80 y 150.000).
- Paquete de arranque: **245,0 kB gz** (main 55b0b3a: 240,0; +5,0). three-vrm aparte: 63,9 kB gz, después del
  primer cuadro. Con MToon el arranque era 269,9 kB gz.
- Carga en el navegador de pruebas: VRM analizado ~40 ms; el tirón del primer cuadro con avatares (software GL, 2
  pestañas) sube de 0,4–0,55 s a 0,6–0,8 s.

## Sin comprobar
- Ningún aparato real (móvil, Quest, Pico): ni temperatura, ni fps con 12/25/60 VRM, ni el tirón de compilar.
- WebGPU de verdad (el navegador de pruebas usa el backend WebGL2 de WebGPURenderer).
- La cámara en primera persona y la altura del salto: el código está, pero esas ramas no están aquí.
- 60 VRM a la vez: solo se han visto 2 a la vez.

## Lo que falta (para otra fila o un siguiente trozo)
- Elegir avatar (H10) y subir el propio (con `packages/server/src/vrm.ts` para validar).
- Bajar el peso: un VRM sin las 16 formas pesaría ~250 kB (hoy se quitan al cargar, pero se bajan); `.vrma` sin los
  dedos o a 15 fps pesaría la mitad.
- Etiquetas a la altura de cada cabeza (hoy a 2,1 m para todos; sobre Polybot quedan altas).
- Gestos con clips (`features/gestos` → saludar, asentir…: UAL1 tiene `Interact`, `Idle_Talking_Loop`; UAL2 más).
- El salto con su inicio y aterrizaje (`Jump_Start`, `Jump_Land`) cuando la rama `salto` diga cuándo despega.
- Trampa encontrada: en `dev:lan`, vite manda al servidor **toda ruta que empiece por `/a`** (también `/avatares.ts`),
  por eso el fichero de la plaza se llama `catalogo-avatares.ts`. Arreglo propuesto: clave `"^/a/"` en
  `apps/plaza/vite.config.mjs`.

## Para el BACKLOG
- J1: **hecho** (trozo 1). Proponer filas: «J1b — avatares más ligeros (sin formas en el fichero, vrma a 15 fps)»,
  «J1c — etiquetas a la altura de cada cabeza», y que H10 use `vrm.ts`.
- SABER: §3.2 (sin MToon por el paquete de arranque; de pie no mantiene el dibujo), §3.3 (100Avatars: CC0 con dos
  notas), §3.4 (el conversor `.vrma` y las velocidades naturales de UAL1).

## Dependencias nuevas
- `@pixiv/three-vrm` **3.5.5** (MIT) — exacta.
- `@pixiv/three-vrm-animation` **3.5.5** (MIT) — exacta (cargar `.vrma`).
