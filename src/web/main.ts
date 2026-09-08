/** Entry point: `npm run play` (live, subscription-billed by default), `-- --provider anthropic` (API key), or `-- --mock` (offline demo). */

import * as path from "node:path";
import { defaultTunables } from "../config/tunables.js";
import { systemClock, systemIdGen, systemRng } from "../domain/runtime.js";
import { DemoProvider } from "../providers/demo.js";
import { makeProvider } from "../providers/factory.js";
import { GameStore } from "../store/store.js";
import { createGameServer } from "./server.js";
import type { GameEnv } from "./session.js";

const mock = process.argv.includes("--mock");
const portArg = process.argv.indexOf("--port");
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 8787;
const providerArg = process.argv.indexOf("--provider");
const providerName = providerArg >= 0 ? String(process.argv[providerArg + 1]) : defaultTunables.provider.name;

const tunables = defaultTunables;
const env: GameEnv = {
  store: GameStore.open(path.resolve("data")),
  clock: systemClock,
  idGen: systemIdGen,
  tunables,
  provider: mock ? new DemoProvider(systemRng()) : makeProvider(providerName, tunables.provider.model),
  rng: systemRng(),
};

createGameServer(env, { developerTools: process.argv.includes("--dev-tools") }).listen(port, "127.0.0.1", () => {
  console.log(`SLOP CONNOISSEUR — Hide From Machines`);
  console.log(`  play:  http://localhost:${port}/`);
  console.log(mock ? `  provider: offline demo (--mock)` : `  provider: ${providerName} (${tunables.provider.model})`);
});
