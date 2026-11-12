# Quién es quién (I1)

- `api.onIdentify((entidad, quien) => …)` — la página ha dicho quién es: `quien.id` (12 letras, el mismo en
  cada visita desde ese navegador) y `quien.nombre` («Invitado ASC6»). `api.who(entidad)` lo da después.
- Lo de cada persona (inventario, lo que reclamó) se guarda por `quien.id` en `api.store`, **nunca por
  entidad** (la entidad cambia en cada conexión). Los robots no tienen identidad: `who` da `null`.
- Sin cuenta ni datos personales; vincular el móvil con el ordenador no existe todavía (I2, aparcada).
