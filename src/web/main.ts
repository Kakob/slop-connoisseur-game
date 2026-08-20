/** Entry point: `npm run play` (live API) or `npm run play -- --mock` (offline demo). */

import * as path from "node:path";
import { defaultTunables } from "../config/tunables.js";
import { systemClock, systemIdGen, systemRng } from "../domain/runtime.js";
import { AnthropicProvider } from "../providers/anthropic.js";
import { DemoProvider } from "../providers/demo.js";
import { GameStore } from "../store/store.js";
import { createGameServer } from "./server.js";
import type { GameEnv } from "./session.js";

const mock = process.argv.includes("--mock");
const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8787;

const tunables = defaultTunables;
const env: GameEnv = {
  store: GameStore.open(path.resolve("data")),
  clock: systemClock,
  idGen: systemIdGen,
  tunables,
  provider: mock ? new DemoProvider(systemRng()) : new AnthropicProvider(tunables.provider.model),
  rng: systemRng(),
};

createGameServer(env).listen(port, () => {
  console.log(`SLOP CONNOISSEUR — Hide From Machines`);
  console.log(`  play:  http://localhost:${port}/`);
  console.log(mock ? `  provider: offline demo (--mock)` : `  provider: anthropic (${tunables.provider.model})`);
});
