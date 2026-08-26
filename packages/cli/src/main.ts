#!/usr/bin/env node

import { runCli } from "./command/run.js";
import { attachSignalHandlers } from "./command/signal-handlers.js";

const result = await runCli({
  args: process.argv.slice(2),
  cwd: process.cwd(),
});
process.exitCode = result.exitCode;

if (result.session !== undefined) {
  attachSignalHandlers(result.session);
}
