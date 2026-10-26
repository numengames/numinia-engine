// main.ts of «bloque-giratorio» (M19 example). The engine STORES this file and lists it; it does not run it yet:
// scripts run in the SES sandbox of M20 (docs/BACKLOG.md). The shape below is what an app will declare: read its
// properties (props, the schema in app.json), react to its events, keep nothing outside `estado`.
type Props = { girar: boolean; velocidad: number; color: string; rotulo: string; sentido: "derecha" | "izquierda" };
type Api = { props: Props; estado: Record<string, unknown>; emitir(evento: "pulsado" | "cambioDeSentido", campos: Record<string, string>): void };

export function alPulsar(api: Api, quien: string): void {
  const sentido = api.props.sentido === "derecha" ? "izquierda" : "derecha";
  api.estado.sentido = sentido;
  api.emitir("pulsado", { quien });
  api.emitir("cambioDeSentido", { sentido });
}

/** Degrees the block turns in `dt` seconds (the engine's tick is fixed, so the same input gives the same turn). */
export function giro(api: Api, dt: number): number {
  if (!api.props.girar) return 0;
  const grados = api.props.velocidad * dt;
  return (api.estado.sentido ?? api.props.sentido) === "izquierda" ? -grados : grados;
}
