# Tren desatendido: configuración actual y mejoras propuestas

Fecha: 2026-10-26 ~04:55 UTC. Para el experto en Hermes. Todo lo de §1–§3 está leído del sistema real; lo de §4 es opinión mía.

## 1. Configuración actual

**Hermes (perfil `ursa`, un gateway compartido por 14 perfiles, PID 164778, terminal `local`)**
- `kanban.dispatch_in_gateway: true` (encendido hoy, antes `false`), `max_in_progress: 1`, `max_in_progress_per_profile: 1`, `dispatch_interval_seconds: 60`, `failure_limit: 2`, `auto_decompose: true`, `dispatch_stale_timeout_seconds: 14400`.
- `approvals`: `mode: smart` con una política larga a medida (aprueba rutinas dentro del laboratorio, escala fusionar PR, borrar ramas remotas, secretos, editar `config.yaml` a mano), `cron_mode / single_query_mode / unattended_mode: deny`, lista `deny` con `*gh pr merge*`.
- Consumo (hoy): semana 7 %, ventana de 5 h 3 %.

**Tres crons del tren** (de 5 activos en el perfil)
1. `210475959e40` · promotor de tableros · cada 15 min · sin LLM · saca una tarjeta de `triage` por tablero (hermes-mejora, numinia-org, numen-games, nwos) y la asigna a ursa. Freno: semana ≥ 90 % o > línea de reparto + 20. Lee `hermes usage --json`.
2. `db413e269af6` · constructor de lotes · cada 30 min · agente (claude-sonnet-5-5) · pre-run `tren_constructor.py`: silencio si semana ≥ 90 %, si hay > 2 lotes sin PR o sin candidatas; si no, construye tarjetas en `lote-wip/N` y publica `lote/N` con ≥ 5 tarjetas y puertas verdes.
3. `b2143fd11da7` · cinta de lotes · cada 20 min · sin LLM · con el motor sin PR abierto, toma el siguiente `lote/N` sin PR, aplica `diff lote/N-1..lote/N` sobre `main` como un commit, sube versión menor, pasa `npm run gates`, abre PR (revisan Pablo, Christian, María). Silenciosa salvo PR abierto o atasco.

**Datos y ramas**: tablero `motor-vr` (101 `ready`, 0 `running`, 36 `done`); worktree fijo `work/numinia-engine-tren`; ramas apiladas `lote/N`; puertas `npm run gates` (tope de página 1 MB gz, hoy 656 kB, meta 300 kB). Identidad de commit `ursa-da-numinia`. Token de GitHub App por repo, caduca, no se guarda.

**Reglas humanas**: solo un humano fusiona; un PR de motor abierto a la vez; decisiones de dinero/datos/seguridad se comentan y bloquean; único límite propio de consumo = semana al 90 %; PR en inglés.

## 2. Qué se ha probado (con resultado)
- Cinta: aplicada al lote 8 dio el PR #253 (puertas verdes); **Pablo lo fusionó a las 04:28 UTC**. El lote 9 es la primera ejecución real de la cinta sola: **aún no ha ocurrido**.
- Dispatcher + worker: tarjeta canary `t_72e7d6cb` asignada a ursa, cogida en < 1 min, completada en 69 s con puertas en verde, commit subido a `canary/tren-1`, cierre con resumen. Ningún comando rechazado.
- Fallo visto: en el worker el push con `credential.helper` dio «Invalid username or token»; funcionó con cabecera `http.extraheader` Basic.
- Primer diseño (un agente por tarjeta cada 10 min, con lista de candidatas): ~6 h, 0 PR; el agente descartaba y terminaba.

## 3. Qué NO está probado
- El constructor de lotes nunca ha corrido de verdad (¿aguanta 60 min con actividad? ¿cuánto gasta?).
- La cinta sola, y su comportamiento ante conflictos de rebase.
- Consumo por tarjeta: el 3 %/7 % no se movió con el canary; no hay medida fina.
- Si las puertas de `/goal` aplican a tarjetas con `--goal`.
- Cómo convive el dispatcher con el promotor (el promotor asigna a ursa y ahora el dispatcher las ejecutará: riesgo de que empiece a correr tarjetas de otros tableros sin que lo hayamos decidido).

## 4. Dónde y cómo mejoraría el proceso (por prioridad)

1. **Conciliar las 101 tarjetas `ready` antes de asignar nada.** Muchas ya están hechas en `lote/9`–`11` o en `main` (ejemplo: MIS-255 e2e «Despertar» está en `lote/10`). Un script sin LLM debería cruzar título/id de tarjeta con los mensajes de commit de `main` y `lote/*` y proponer el cierre con evidencia. Hoy el avance real está infravalorado y el riesgo es rehacer trabajo.
2. **Pasar de «lotes por script» a «tarjeta = trabajo» con el dispatcher.** El canary demuestra que un worker con contrato claro cierra en un minuto. Propongo un generador (sin LLM) que, con la cinta libre, asigne a ursa la siguiente tarjeta concreta, con la plantilla del protocolo (Outcome / Verification / Boundaries / Stop when) y `--max-runtime`. La tarjeta termina en una rama; la cinta la convierte en PR. Se mantiene la cinta, que ya funciona.
3. **Plantilla de push dentro del contrato**: el método `http.extraheader` que sí funciona, para que los workers no tropiecen.
4. **Medir coste por tarjeta**: guardar `hermes usage --json` antes/después en `consumo-tren.jsonl`. Sin eso los techos son a ciegas.
5. **Watchdog sin LLM** (cada 30 min, silencio si todo va bien): avisa si hay tarjetas `ready` asignadas y nada `running` > 1 h, si un lote lleva > 24 h esperando PR, si `cron doctor` o `diagnostics` reportan algo. Hoy el tren puede parar sin que nadie lo sepa.
6. **Cuello humano**: el límite real es un PR por revisión. Propongo (decisión de Pablo) permitir 2 PR abiertos si tocan áreas disjuntas, o lotes más pequeños y más frecuentes. Medir cuántas horas pasa cada PR esperando revisión antes de optimizar nada más.
7. **Promotor y dispatcher**: decidir explícitamente qué tableros ejecutan workers (hoy solo `motor-vr` está probado). Limitar `dispatch_profiles` o asignar a mano en los demás hasta tener un canary por tablero.
8. **Revisión adversarial al cierre de lote** (barata, un modelo distinto o `delegate_task` sobre el diff) antes de que la cinta abra el PR; máximo 2 vueltas.
9. **Endurecer permisos**: ampliar la lista `deny` (push forzado, push a `main`, `gh release`) y fijar `workdir` y `enabled_toolsets` en los jobs de agente.
10. **Dejar morir lo viejo**: los cron antiguos pausados del motor (turno, fábricas, naturaleza) y el constructor por lotes manual deberían borrarse cuando el flujo de tarjetas demuestre 3 lotes seguidos sin intervención.

## 5. Preguntas para el experto
1. ¿Mejor un cron por área o dejar al dispatcher como único motor y usar cron solo para promoción y watchdog?
2. ¿Cómo atar `--workspace worktree` y `--branch` a un worktree ya con `npm ci` sin reinstalar en cada tarjeta?
3. ¿Hay consumo por job o por tarjeta nativo en `hermes`? Si no, ¿cuál es el patrón recomendado?
4. ¿Qué pasa con un worker que supera el tiempo de inactividad (`HERMES_CRON_TIMEOUT` o equivalente) en mitad de `npm run gates`?
5. ¿Es correcta la inferencia de que `single_query_mode: deny` bloquea comandos dudosos sin preguntar al worker? Hoy no se ha visto un bloqueo, así que no está confirmado.
