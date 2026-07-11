import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";

loadDotenv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url))
});

import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const app = createApp({ env });

app.listen(env.PORT, () => {
  console.log(`iris-casino-activity server listening on ${env.PORT}`);
  console.log(`allowed web origin: ${env.WEB_ORIGIN}`);
});
