# Scripts de mundo (M19 + M20): cómo se escribe uno sin romper el mundo

Estado: construido (0.67.0+). Cartas `t_ae9eb860` (M20) y `t_83ab6adf` (el diseño). Código: `packages/server/src/{guion,guion-trabajador,apps-ejecutar,apps-http}.ts`, pruebas `test/guion.test.ts` y `test/apps-ejecutar.test.ts`. Guía de uso: `docs/EXTENDER.md` «Apps».

## Qué es

El `main.ts` de cada app (`<mundo>/apps/<id>/`, formato M19) **corre en el servidor**, dentro de una caja SES (Compartment) que vive en un hilo trabajador propio. Nunca corre en la página: **ningún secreto, ninguna autoridad en el cliente** (la lección del gestor de contraseñas de Hyperfy: un script de cliente lo lee quien abre la consola). La página solo ve lo que el script *emite* y lo que el servidor decide enseñar.

## Cuatro decisiones y por qué

| Decisión | Por qué |
|---|---|
| **Un trabajador por script** (`worker_threads`), no un `eval` en el hilo del mundo | Un bucle infinito en el hilo del mundo congela a todos; en un trabajador se mata con `terminate()` y el mundo ni se entera. Coste medido: ~27 MB de RSS y ~70 ms por trabajador → tope de **8 scripts** vivos por mundo (`app_scripts_max`); el resto se lista con su motivo y no corre. |
| **SES** (`lockdown` + `Compartment`) con una sola puerta, el objeto `app` | El script no ve `process`, `require`, ficheros, red, `fetch`, `Buffer` ni temporizadores; los intrínsecos van congelados (no puede envenenar `Array.prototype`). Todo lo que gane irá **solo** en ese objeto (hoy `on/off/log/emit`; después `get/set` del mundo, chat, jugadores), igual que el objeto público de `Apps.js` de Hyperfy 2 (copiado el *qué*, no el *cómo*). |
| **Topes por llamada, no por tick** | 50 ms de CPU por llamada a un manejador (`app_script_cpu_ms`), 500 ms para el nivel superior al cargar (`app_script_load_ms`), 64 MB de montón (`app_script_heap_mb`). Pasarse de CPU o de memoria **mata solo ese trabajador**, se informa y la siguiente llamada arranca uno nuevo con el código de siempre. |
| **Recarga en caliente solo para administración** | Un script es código del servidor. Solo cambia quien lleva un pase de numinia.com con `manage-organization` (o es dueño) o el código de administración del mundo (`/mundo`); el servidor *prueba* el texto nuevo en una caja desechable y **si no carga no se escribe ni se cambia nada**: el script que corre sigue corriendo. |

## Determinismo y autoridad

- El script **no toca la simulación**: ni su huella ni su reloj. Responde a eventos (`alCargar`, y los que cada pieza le lance) con datos JSON y emite eventos declarados en `app.json` (cada uno con su anuncio o `silent`). Quien decide qué cuenta es el servidor; un cliente nunca manda a un script lo que el servidor no haya validado.
- Sin reloj ni azar en la caja: `Date.now()` y `Math.random()` **lanzan error** (SES en modo seguro), no hay temporizadores y `import()` se rechaza al cargar (`SES_IMPORT_REJECTED`). Lo que un script devuelve depende de sus datos de entrada; la hora que el mundo quiera darle va en esos datos.
- Es TypeScript que solo borra tipos (`node:module` `stripTypeScriptTypes`): sin `enum` ni `namespace`; el error lo dice.

## Cómo se ve y cómo se arregla

- `GET /apps` → `script: { ejecuta, estado: viva | cortada | error | sin-sitio, version, cortes: {cpu, memoria, error}, informes[] (últimos 20, con la hora), porQue }`; sin rutas de disco.
- El registro del servidor (`[app <id>] script cortado por pasarse de CPU: …`) y `numinia_guion_cortes_total{app,motivo}` en `/metrics.prom`.
- Puerta de administración: `GET|PUT /apps/<id>/main.ts`, `POST /apps/<id>/recargar` (401/403/404/413/422/429, cada uno con su razón). Cerrada del todo (404) si el mundo no tiene ni clave de pases ni código de administración. El editor de la página y la ficha de numinia.com son clientes de esta puerta, no código nuevo en el servidor.
- Quien edita con un editor de ficheros (una IA, una persona en el servidor) cambia `main.ts` y el servidor lo recarga solo (`fs.watch`, 250 ms); si el cambio no vale, el log lo dice y sigue el anterior.

## Lo que NO hace todavía (y a quién le toca)

1. La **API de mundo** del script (leer/escribir estado, chat, jugadores): se añade al objeto `app`, una función por vez, cada una con su prueba de «no abre una puerta nueva».
2. Que las piezas del mundo *llamen* a los manejadores de una app (hoy: `alCargar` y las llamadas del servidor a `apps.lanzar`).
3. El editor en la página para administración (cliente de la puerta HTTP) y un aviso dentro del mundo a quien administra cuando un script se corta (hoy: registro, `/apps`, métrica).
4. Apps nuevas sin reiniciar: las carpetas nuevas de `apps/` se leen al arrancar; solo el `main.ts` y el `app.json` de las ya cargadas se recargan.

## Para decidir (ficha para Pablo, R-1 ya lo cubre: es pieza, no coste)

Nada que cuesta dinero ni toca datos de personas: el tope de 8 scripts por mundo (RAM) es el único número que podría querer cambiar si un servidor pequeño se queda corto; vive en `limits.json` y en una constante.
