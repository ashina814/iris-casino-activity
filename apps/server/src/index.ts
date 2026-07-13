import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

loadDotenv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url))
});

import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const webDistPath = fileURLToPath(new URL("../../web/dist/", import.meta.url));

if (env.NODE_ENV === "production" && !existsSync(webDistPath)) {
  throw new Error(`Web build is missing: ${webDistPath}`);
}

const app = createApp({ env, webDistPath: existsSync(webDistPath) ? webDistPath : undefined });

async function main() {
  await app.locals.reconciliation;

  const server = app.listen(env.PORT, () => {
    console.log(`iris-casino-activity server listening on ${env.PORT}`);
    console.log(`allowed web origin: ${env.WEB_ORIGIN}`);
  });

  function shutdown(signal: string) {
    console.log(`received ${signal}; closing HTTP server`);
    server.close((error) => {
      if (error) {
        console.error("graceful_shutdown_failed", error);
        process.exitCode = 1;
      }
      process.exit();
    });
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  console.error("startup_reconciliation_failed", error);
  process.exitCode = 1;
});
