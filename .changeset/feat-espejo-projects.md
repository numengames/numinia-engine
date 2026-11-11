---
"numinia-engine": minor
---

## 2026-11-11 20:42 · espejo · objetos «proyecto» en el espejo de Hermes · hecho
- Qué: el espejo de Hermes muestra los proyectos: tipo nuevo `proyecto` (función `proyectos`, apagada de nacimiento) con su figura, una carpeta con pestaña sobre un pie y un arbolito en la cara (llena si está activo, a rayas si está archivado), su estado («activo» / «archivado») y su tarjeta; la plantilla `hermes` trae la zona z5 «Projects», su frase de guía y su parada del recorrido.
- Números: 9 ficheros, +49/-24 más este fragmento; el test de la plantilla pasa de nueve a diez zonas.
- Consumo: sin medir · claude-sonnet-5-5.
- Cambio: minor (tipo de objeto nuevo en el espejo, sin romper nada).
- Siguiente: el lado Hermes (el plugin) debe mandar los objetos `proyecto` con `grupo` y `descripcion`.
