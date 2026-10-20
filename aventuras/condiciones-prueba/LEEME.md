# Mundo de prueba de la burbuja de entrada (condiciones/c3)

Un mundo vacío cuyo `condiciones.json` lleva `"puerta": true`: al llegar estás dentro de una pompa y no te mueves hasta
aceptar las normas (casa → comunidad); los permisos de datos de la última página salen vacíos y no cierran la puerta.
Los textos son de EJEMPLO (los de verdad los escriben los abogados). No es para producción.

```
AVENTURA_DIR=aventuras/condiciones-prueba npm run server        # el servidor, en :8790
npm run dev                                                      # la página, en :5173
# abre  http://localhost:5173/                 (PC)
#       http://localhost:5173/?aparato=movil-vertical   (móvil vertical, solo en desarrollo)
```

Sin tocar el fichero, la puerta también se enciende en cualquier mundo con `MOTOR_CONDICIONES_PUERTA=si`.
