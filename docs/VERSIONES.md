# Versiones

El motor lleva una **versión semántica** en `package.json`: tres números, `mayor.menor.parche`, como manda
STD-019 de numinia.org (Semantic Versioning 2.0.0). Es lo único que la página enseña, al pie de los ajustes
(`v0.1.0`), sin marca. El build (`<commit> <fecha>`, el de `/health`, `/status`, el instalador y el zip del mundo)
sigue existiendo para quien ayuda con un fallo: sale al pasar el ratón por encima de la versión.

## Cuándo se mueve cada número

Cada PR que llega a `main` mueve **uno** de los tres, según lo que cambia para quien usa el motor (una
persona que juega, quien construye, un mundo guardado, una IA conectada):

| Cambio | Número | Ejemplo |
|---|---|---|
| Arreglo que no pide nada nuevo | parche: 0.1.0 → 0.1.1 | la cámara ya no atraviesa paredes |
| Algo nuevo que no rompe nada | menor: 0.1.1 → 0.2.0 | ajustes en pestañas, mando que salta |
| Algo que deja de funcionar como ayer | mayor: 1.4.2 → 2.0.0 | un zip de mundo viejo que ya no se abre, un mensaje de red que cambia de forma |

**Antes de 1.0.0** (ahora): el motor está en desarrollo inicial y, como dice Semantic Versioning (punto 4),
cualquier cosa puede cambiar. Mientras tanto, una ruptura sube el **menor** y lo dice en el diario
(`docs/RUNLOG.md`) y en el PR. Pasar a **1.0.0** es una decisión de Pablo: desde ese día, romper sube el mayor.

Se empezó en **0.1.0** el 16-10-2026 (STD-019: «todo empieza en cero punto uno punto cero»).

## Cómo

- Sube el número en `package.json` y en `package-lock.json` (las dos primeras apariciones) en el mismo PR.
- El PR dice en su cuerpo qué número movió y por qué.
- `test/version.test.ts` comprueba que es una versión semántica válida y al menos 0.1.0.
