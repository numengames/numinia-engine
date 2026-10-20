// espacio-base (H5): where the Logo Khepri is planted. Pure numbers. The model (features/objetos/biblioteca.json «logo-khepri», CC0) is a round
// sign: measured from its glTF (node rotation 90° about X, scale and translation applied; test/espacio-base-h05.test.ts redoes the sum) it is
// 3.26 m wide, 3.29 m tall, 0.6 m thin, and its lowest point is 1.798 m under its origin. At scale 0.77 it is 2.51 m wide and, lifted 1.38 m,
// its lowest point touches the ground (y = 0) inside the flat plateau (radius 26 m), 8 m ahead of the first camera (which looks along −z).
import type { Sembrado } from "../objetos/server.ts";

export const LOGO: Sembrado = { modelo: "logo-khepri", nombre: "Logo Khepri", x: 0, y: 1.38, z: -8, ry: 0, escala: 0.77 };
