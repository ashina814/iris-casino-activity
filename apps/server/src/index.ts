import "dotenv/config";
import { createApp } from "./app.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const app = createApp({ env });

app.listen(env.PORT, () => {
  console.log(`iris-casino-activity server listening on ${env.PORT}`);
});
