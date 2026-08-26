import type { IncomingMessage, ServerResponse } from "node:http";

import type { LocalSessionRuntime } from "../../session/session-manager.js";

/** Extension seam for P6–P9 routes after transport security has already run. */
export interface LocalApiRoute {
  readonly method: string;
  readonly path: RegExp | string;
  readonly handle: (
    request: IncomingMessage,
    response: ServerResponse,
    session: LocalSessionRuntime,
  ) => void | Promise<void>;
}
