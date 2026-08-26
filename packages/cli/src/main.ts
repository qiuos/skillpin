#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { runCli } from "./command/run.js";
import { attachSignalHandlers } from "./command/signal-handlers.js";

const result = await runCli({
  args: process.argv.slice(2),
  cwd: process.cwd(),
  staticDirectory: fileURLToPath(new URL("./web", import.meta.url)),
});
process.exitCode = result.exitCode;

if (result.session !== undefined) {
  attachSignalHandlers(result.session);
}
