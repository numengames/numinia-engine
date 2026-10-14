// bots: N headless players over real WebSockets, so the plaza has life. They are ordinary clients.
// Run: node packages/server/src/bots.ts --n 8 --url ws://127.0.0.1:8790
import { webSocketClient } from "../../net/src/index.ts";
import { Bot } from "../../instance/src/index.ts";
import { TICK_HZ } from "../../sim/src/index.ts";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const n = Number(arg("n", "8")), url = arg("url", "ws://127.0.0.1:8790");

const bots: Bot[] = [];
for (let i = 0; i < n; i++) {
  const t = webSocketClient(url);
  await t.opened;
  bots.push(new Bot(t, 0x5eed + i * 7919));
}
setInterval(() => { for (const b of bots) b.think(); }, 1000 / TICK_HZ);
console.log(`[bots] ${n} conectados a ${url}`);
