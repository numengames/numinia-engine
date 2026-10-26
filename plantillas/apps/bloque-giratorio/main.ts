// main.ts of «bloque-giratorio» (M19 example, M20 sandbox). The engine runs this file on the SERVER inside an SES sandbox:
// it sees only the global `app` below (no process, no files, no network, no timers), each call has a CPU budget
// (limits.json app_script_cpu_ms) and the script is cut and reported if it goes over; change the file and the script reloads
// in place, with no world restart (an admin's edit through PUT /apps/<id>/main.ts, or the file on disk).
// Types are only erased, so write TypeScript that works without a compiler (no enum, no namespace).
declare const app: {
  on(evento: string, manejador: (datos: any) => unknown): void;
  log(...partes: unknown[]): void;
  emit(evento: string, datos?: unknown): void;
};
type Props = { girar: boolean; velocidad: number; color: string; rotulo: string; sentido: "derecha" | "izquierda" };

let props: Props = { girar: true, velocidad: 45, color: "#cc5533", rotulo: "", sentido: "derecha" };
let sentido: Props["sentido"] = props.sentido;

// The engine calls this once after the script loads (and after every reload) with the properties' defaults.
app.on("alCargar", (d: { props: Partial<Props> }) => {
  props = { ...props, ...d.props };
  sentido = props.sentido;
  app.log("listo", props.rotulo || "sin rótulo");
});

// Someone pressed the block: flip the direction and say so (both events are declared in app.json).
app.on("alPulsar", (d: { quien: string }) => {
  sentido = sentido === "derecha" ? "izquierda" : "derecha";
  app.emit("pulsado", { quien: String(d?.quien ?? "") });
  app.emit("cambioDeSentido", { sentido });
  return sentido;
});

/** Degrees the block turns in `dt` seconds (the engine's tick is fixed, so the same input gives the same turn). */
app.on("giro", (d: { dt: number }) => {
  if (!props.girar) return 0;
  const grados = props.velocidad * Number(d?.dt ?? 0);
  return sentido === "izquierda" ? -grados : grados;
});
