# Cosas que se usan de cerca (J4: hablar, coger, abrir)

Una cosa del mundo que se usa de cerca declara **cómo** en su ficha: `state.card.interact = { intent, prompt, radius, key }`.
- `intent`: el verbo que se manda (uno de tus `intents`); `key`: el campo de texto de ese intento que recibe la clave de la
  cosa (`{ pnj: "alma" }`); `prompt`: lo que sale tras «E:» (`"hablar con {nombre}"`, `"{aviso}"`); `radius`: metros
  (0,5-16) o el nombre de un campo numérico del estado (cada cosa el suyo). `defineFeature` rechaza lo que no cuadre.
- La página ofrece, de las que están al alcance, **la que se mira** («E: hablar con Alma»; P15, más abajo): tecla E, un clic sin arrastrar sobre la cosa o el
  botón del aviso (el que se toca en el móvil). Nunca con el panel de construir abierto, escribiendo o en una
  conversación. Para que el clic se entienda, dibuja la cosa con `view.place?.("<función>:<clave>", …)`.
- **El aviso destacado (P15).** Es una pieza del motor: ningún mundo escribe nada para tenerla. El aviso sale en ámbar de la
  casa (`--n-ambar`, tinta `--n-enfasis-tinta`: contraste 9:1), letra de 24 px, con la tecla dibujada como una tecla, centrado
  encima de la barra de botones; con «menos movimiento» no hay entrada animada, y con alto contraste se vuelve negro sobre blanco.
  En el móvil sigue siendo el botón grande que se toca. Sale **solo dentro del radio de la cosa** (la página no usa el margen de
  1,5 m del servidor) y se va en cuanto se sale de él.
  - *Cuál ofrece:* de las cosas al alcance, la de **menor ángulo** entre hacia dónde mira la cámara y la cosa, siempre que esté
    a menos de 40° (`apps/plaza/interactuar-mirada.ts`, función pura); ángulos a menos de 3° se tienen por iguales y gana la más
    cercana. Si ninguna está delante (se mira a otro lado, o solo hay cosas sin lugar como un asiento) se ofrece la más cercana,
    como antes: no se quita el aviso a quien apunta mal. La elegida se mantiene mientras la nueva no sea mejor en más de 4°
    (o 15 cm, si nada está delante), para que no parpadee entre dos cosas. Un clic sobre una cosa sigue mandando sobre esa cosa.
  - *De qué cosa habla:* la elegida lleva un aro ámbar (`view.marcar`, `packages/render/src/marca-mirada.ts`): una sola malla,
    creada al ofrecer la primera cosa, reutilizada siempre; sin nada cerca no existe y no pide cuadros. **Nunca tapa lo que
    marca:** una persona lleva un aro pequeño (0,4 m de radio) tumbado en el suelo, a sus pies (el aro alrededor del cuerpo
    la tapaba); una cosa lleva un aro que mira a la cámara y es tan ancho como ella como mucho el doble (la página pregunta a
    `view.cosa("<función>:<clave>")` el modelo ya cargado y mide la esfera que lo contiene: entre 5 cm y 0,45 m de radio; 0,2 m si
    todavía no se sabe), centrado en el medio de ese modelo (una pieza cuyo origen no está en su medio, como el cuchillo con su
    tabla y su verdura, queda rodeada entera y no con el aro por encima; si todavía no se sabe, media altura sobre su `y`).
    Es igual en escritorio y en móvil. El aro, la elección por mirada y el estilo del aviso (`apps/plaza/interactuar-pieza.ts`,
    `interactuar.css`) se piden cuando la primera cosa entra en su radio, no con el primer cuadro: el aviso sale en cuanto llegan.
  - `features.reachable()` entrega ahora, en cada oferta, `at` (`x`, `z` y, si el estado trae `y`, la altura) y `role` (el de su
    ficha): campos nuevos al final, nada de formato ni de huella cambia.
  - *VR:* la lógica de los mandos no cambia (apuntan con su rayo). La elección por mirada usa la cámara de escritorio/móvil; con
    una sesión VR activa se ofrece la más cercana como antes y no se pone el aro.
- **Decide el servidor**: en el intento, `api.within(quien, clave)` dice si está a su alcance (radio + 1,5 m de margen).
  Sin eso, nada. Los agentes leen `interact` en el catálogo y usan `features.use(función, clave)` o el intento a mano.
- `view.tag?.(clave, { text, x, y, z } | null)` pone un nombre que se queda sobre una cosa (las personas lo llevan).
- Falta (fila J4): mantener pulsado con anillo de progreso, rayo y gatillo en VR, puertas y botones de ejemplo.
