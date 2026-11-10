# Añadir una capacidad (N2)

Las capacidades dicen qué puede hacer este aparato (`window.__numinia.capacidades`, un objeto plano que leen igual las
personas, los ajustes y los agentes). Se decide por capacidad, **nunca por el nombre del navegador**.

1. Di qué significa: una línea en `CAPACIDADES` (`packages/client/src/capacidades.ts`).
2. Di cómo se lee: si es del navegador, en `leerNavegador` (con `entorno` falso en las pruebas); si necesita la vista o
   tarda, en la página: `caps.agregar({ id, describe, leer })` (`leer` puede devolver una promesa). Ejemplo:
   `caps.agregar({ id: "gpuTiempos", describe: "La gráfica mide su tiempo", leer: async () => !!(await navigator.gpu?.requestAdapter())?.features.has("timestamp-query") })`.
3. Úsala: `requiere: ["gpuTiempos"]` en un ajuste, o en su `defecto`. Cuando la capacidad llega o cambia (XR responde
   tarde, se conecta un mando, el sistema pide menos movimiento), los ajustes que dependen de ella aparecen y se aplican
   solos.
