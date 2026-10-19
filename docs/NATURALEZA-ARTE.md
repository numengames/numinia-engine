# Dirección de arte de la naturaleza de Numinia

Proyecto: motor web 3D · Para: Pablo y los agentes de la rama `naturaleza/low-poly` · De: Ursa · Fecha: 2026-10-19 (UTC) · Estado: vigente; sustituye a la paleta de las historias N1–N7 y F1–F5.

Fuentes leídas: `numinia-archive/principles/PRI-008-visual-identity.md` (las tres hebras, el registro low-poly), `standards/STD-023-design-values.md` (dosis, colores, escala de rareza, noche), `designs/DES-015-event-3d-and-email.md` (receta 3D), `lore/codex/glosario.md` (Residuos: «válvulas, lentes, bobinas y engranajes»).

## Lo que dijo Pablo (19-10)
Demasiado colorido y demasiado para niños. No tan low-poly «de juguete»: algo más cercano a *Breath of the Wild*, un poco más currado. Todo con la mezcla de la casa: solarpunk 40 %, steampunk 40 %, cyberpunk 20 %. La naturaleza no es naturaleza «a secas»: es la de este mundo. Más variedad: nada debe repetirse igual. Se pule poco a poco.

## La atmósfera (inferida del canon)
Un jardín mediterráneo a la luz de la mañana, con maquinaria de bronce que se quedó fuera de uso y la planta se la fue comiendo. Los Residuos del canon (válvulas, lentes, bobinas, engranajes) están **en el paisaje**: medio enterrados, con musgo, verdín turquesa de cobre oxidado, una lente que atrapa el sol. La señal (cyber) es una luz pequeña que parpadea en una criatura o en un tubo: acento, nunca ambiente. La luz domina, la máquina estructura, la señal parpadea.

Prueba de la casa, entornando los ojos: ¿jardín mediterráneo con maquinaria de bronce donde parpadea una señal? Correcto. ¿Blade Runner? Demasiado cyber. ¿Catálogo de jardinería? Falta máquina.

## Reparto de dosis en la escena
- **Solarpunk 40 %:** luz cálida de mañana, verdes suaves y secos de monte mediterráneo (no verde césped saturado), arena, agua verdemar, ámbar del sol y de las flores; noche = jardín cálido.
- **Steampunk 40 %:** bronce, cobre, latón tostado, ceniza; troncos con abrazaderas y anillos de bronce, tuberías de riego de cobre, engranajes y válvulas semienterrados, veletas, lentes de cristal. Es la estructura: marca el ritmo del paisaje.
- **Cyberpunk 20 %:** solo luces pequeñas: leds turquesa y coral en criaturas y reliquias, líneas de circuito finas. Nunca niebla de neón, nunca cielo de neón, nunca color saturado en superficie grande.

## Paleta de la naturaleza (todo sale de los tokens de la casa; STD-023 §colores y §escala de rareza)
| Uso | Valor | Origen |
|---|---|---|
| Hierba (media) | `#8FC46B` bajada a ~60 % de saturación → `#8BA86A`; sombra `#5E7F4A`; seca/luz `#B9B878` | Verde de la casa, apagado hacia monte mediterráneo |
| Hierba profunda / bosque | `#356C19` → `#3F5B38`; sombra `#2B3F2A` | Verde de texto sobre Arena + Noche |
| Arena / orilla | `#F9EBDC` / `#C4B5A6` | Arena, Arena velada |
| Roca | `#8A7D72`, `#3A332D`, `#292420` | Ceniza, Bronce, Bronce oscuro |
| Agua | `#A6DAD5` (somera) → `#018EA1` (profunda, apagada) | Verdemar, Turquesa |
| Sol, flores, otoño, latón | `#EFA517`, `#7A5100` | Ámbar, Ámbar tostado |
| Cobre oxidado (verdín) | `#016E7D`, `#1F6B5F` | Turquesa profundo, Verdemar oscuro |
| Acento cyber (≤ 1 % de píxeles) | `#018EA1` glow, `#F35059` | Turquesa, Coral |
| Noche | fondo `#14110F`, sombra `#1E1A17`, luz de luna arena `#C4B5A6` | Noche, Basalto, Arena velada |

Rarezas (para criaturas y reliquias; escala STD-023): Pobre `#F9EBDC` · Común `#8A7D72` · Poco común `#8FC46B` · Rara `#5D9BD6` · Épica `#A98BE0` · Legendaria `#EFA517` (= Ámbar, «el sol»). **Una criatura lleva su rareza en material y rótulo, nunca solo en emisión** (DES-015).

Paletas de estación (`naturaleza.json` → `paleta`): verano = la tabla anterior; otoño = hierba hacia `#B9B878`/`#C79A3E`, hojas `#EFA517`→`#7A5100`; primavera = verdes frescos con flores arena y verdemar. Siempre dentro de la tabla: ningún hex nuevo sin pasar por aquí.

## Qué significa «estilo Breath of the Wild, más currado» aquí
- Siluetas grandes y legibles, facetas visibles pero con **degradados suaves por vértice** (más tono cálido arriba, más frío y oscuro abajo) en vez de planos de color idénticos.
- Luz hemisférica cálida de mañana + sombra fría verdemar: el contraste lo da la luz, no el color saturado.
- Copas **llenas y asimétricas**, hechas de varios racimos de hojas; troncos con inclinación; hierba con gradiente raíz oscura → punta clara; flores pequeñas y escasas, en grupos.
- Variedad generativa: cada instancia varía tamaño, inclinación, tono (± pocos puntos de luminosidad dentro de la paleta) y especie según la zona; manchas de flores y de hierba seca por ruido; claros, trochas, troncos caídos, rocas con musgo.
- Nada de colores primarios, nada de arcoíris, nada de magenta/cian/lima.

## Reglas para los agentes
1. Antes de tocar color: leer este archivo y usar solo los valores de la tabla; el módulo `packages/render/src/naturaleza/paleta.ts` es la única fuente.
2. Presupuesto de la otra sesión sigue mandando: naturaleza total A ≤ 15.000 triángulos y ≤ 8 llamadas; B ≤ 10.000/7; C ≤ 8.000/6; D ≤ 4.000/5. Los accesorios nuevos (Residuos) caben **dentro** de esa bolsa (se recorta otra cosa si hace falta) y en una sola llamada instanciada.
3. Sin texturas, sin luces nuevas, sin pasadas nuevas. Fotos reales en la página y mirarlas antes de dar nada por hecho.
4. El lore es abstracto en el canon: aquí solo se *ilustra* (válvulas, lentes, bobinas, engranajes); no se inventan hechos ni nombres de lugares.
