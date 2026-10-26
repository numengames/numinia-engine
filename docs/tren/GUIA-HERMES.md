# Guía para revisión: cómo operamos el «tren» (misiones desatendidas) en Hermes

Estado a 2026-10-26. Escrita para un experto en Hermes. Marco lo que está verificado y lo que no.

## 1. Qué queremos
Que el equipo de agentes avance las misiones de Numinia sin que un humano lance cada tarea. Humanos solo deciden y revisan/fusionan PR. Es el modo «desatendido», también llamado «el tren». Área actual: motor 3D (repo `numengames/numinia-engine`, tablero kanban `motor-vr`).

## 2. Piezas (Hermes profile `ursa`, un único gateway en un PC con podman)
- **Kanban** (`hermes kanban --board <b>`): 7 tableros. Las misiones del archivo (`numinia-archive/missions/MIS-n.md`) se descomponen en tarjetas `MIS-n · …`. Estados usados: triage, ready, running, blocked, done, archived.
- **Cron** de Hermes (47 jobs en total; 3 son el tren). Dos modos usados: *agente* (script pre-run + prompt + modelo) y *no-agent* (el script ES el job, sin LLM).
- **Scripts** en `profiles/ursa/scripts/` (todos 0 tokens): `promotor_tableros.py`, `tren_constructor.py`, `tren_lotes.py`, `tren_progreso.py`, `gh_app_token.py` (token de GitHub App por repo, caduca, nunca se guarda), `plan_ritmo.py`.
- **Git**: ramas apiladas `lote/N` (cada una = `lote/N-1` + sus commits), rama de trabajo `lote-wip/N`, PR a `main`. Un worktree fijo `work/numinia-engine-tren`. Identidad de commit: bot `ursa-da-numinia`.
- **Puertas** `npm run gates` en el repo: pruebas, determinismo, ancho de banda, tick del servidor, peso de página (tope 1 MB gz, meta 300 kB).

## 3. Los tres crons
1. **`Doulos · tableros — promotor`** (`210475959e40`, cada 15 min, no-agent). Si un tablero no tiene tarjeta en marcha, mueve una de `triage` y la asigna a ursa. Tableros: hermes-mejora, numinia-org, numen-games, nwos. Freno: semana > línea de reparto + 20 puntos o ≥ 90 %. Lee el consumo con `hermes usage --json` (antes leía un CSV obsoleto y daba 48 % en vez de 7 %).
2. **`tren — constructor de lotes`** (`db413e269af6`, cada 30 min, agente, claude-sonnet-5-5, skill `numinia-browser-mmo`). Pre-run `tren_constructor.py`: no despierta al agente (`{"wakeAgent": false}`) si la semana ≥ 90 %, si hay > 2 lotes terminados sin PR, o si no quedan tarjetas candidatas. Si despierta, inyecta lote N, rama, base y lista de tarjetas `ready` sin asignar filtradas (se descartan diseño, medida, investigación y «espera a Pablo»). El agente construye hasta 60 min en `lote-wip/N`, un commit por tarjeta, cierra la tarjeta, y con ≥ 5 tarjetas y puertas verdes publica `lote/N` y escribe el cuerpo del PR.
3. **`tren — cinta de lotes`** (`b2143fd11da7`, cada 20 min, no-agent). Si el motor no tiene PR abierto (salvo Dependabot) y existe un `lote/N` sin PR: aplica `diff lote/N-1..lote/N` sobre `main` como UN commit, sube versión menor, pasa `npm run gates`, abre el PR y pide revisión a tres personas. Solo escribe al chat si abre PR o se atasca; los estados de espera son silenciosos.

## 4. Reglas humanas
- Humano fusiona siempre (PR a `main`). Nadie más.
- Un PR de motor abierto a la vez (la cinta espera).
- Decisiones (dinero, datos de personas, seguridad, qué exige la casa) se comentan en la tarjeta y se bloquea; el ciclo sigue con otra.
- Consumo: único límite propio = semana al 90 %; la ventana de 5 h es del proveedor y no se raciona.
- PR en inglés.

## 5. Historia de por qué es así (lecciones)
- Primer diseño: un agente por tarjeta, una historia por pasada, PR contra una rama `tren/motor-*`. Resultado en ~6 h: 0 PR; cada pasada miraba 1–2 tarjetas, las descartaba («grande», «diseño») y terminaba. Además el prompt exigía PR del día para considerar el tren activo.
- Causa raíz: los lotes 8–11 (~60 historias) ya estaban construidos por constructores manuales, pero **nadie los convertía en PR**. Se añadió la cinta sin LLM; el agente pasa a producir lotes.
- Las tarjetas se quedan desfasadas (MIS-238 en `ready` con el código ya en `main`): el constructor concilia contra `main` antes de construir.
- Un pre-run con lista de candidatas ahorra tokens y evita que el agente decida «no hay nada».

## 6. Qué está verificado y qué no
Verificado: el promotor corre y lee consumo real; la cinta, aplicada a mano al lote 8, dio el PR #253 (puertas verdes, 656 kB gz); el pre-run del constructor devuelve «cola llena» con 3 lotes pendientes.
**No verificado**: ninguna ejecución real del constructor (no sabemos si un job de cron de agente sostiene 60 min y varios commits); la cinta nunca ha corrido sola de verdad (lote 9 será la primera); el rebase de lotes apilados puede dar conflictos; el consumo real por pasada del constructor no está medido.

## 7. Preguntas para el experto
1. ¿Cuál es el timeout efectivo de un job cron de agente, y cómo se fija? ¿Conviene `kanban` dispatch (workers por tarjeta) en lugar de cron con prompt?
2. ¿Cómo hacer que el agente no se rinda tras 1–2 tarjetas de forma fiable (goals, `--goal`, completion-contract en tarjetas)?
3. ¿Mejor modelar lotes con tarjetas padre/hija y workspace por tarjeta (`--workspace`, `--branch`) que con ramas apiladas gestionadas por script?
4. ¿Cómo medir coste por pasada y por tarjeta (usage por job) para fijar techos con sentido?
5. Concurrencia: varios tableros y varios crons comparten una sola ventana de 5 h; ¿hay forma nativa de prioridad/cola entre jobs?
6. ¿Patrón recomendado para verificación adversarial antes de abrir el PR sin gastar el presupuesto?
