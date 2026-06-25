import { pathToFileURL } from "node:url";

import { buildApp } from "./app.js";

/**
 * Server entry point. Builds the app via the factory and binds a port.
 *
 * Kept separate from `app.ts` so importing the factory (e.g. in tests) never
 * starts a listener. The `main` guard below ensures `.listen()` only runs when
 * this file is executed directly (`node dist/src/server.js` / `tsx src/server.ts`),
 * not when it is imported.
 */
export async function start(): Promise<void> {
  const app = buildApp();
  const port = Number(process.env.PORT ?? 3000);

  try {
    // Bind 0.0.0.0 so the server is reachable inside containers, not just on
    // the loopback interface.
    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Main guard: only listen when this file is the entry module, not when it is
// imported. Comparing the resolved entry path to this module's path is robust
// across `tsx src/server.ts` and `node dist/src/server.js`.
const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  void start();
}
