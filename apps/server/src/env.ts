import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (value === true || value === "true" || value === "1") return true;
  return false;
}, z.boolean());

export const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DISCORD_CLIENT_ID: z.string().default(""),
  DISCORD_CLIENT_SECRET: z.string().default(""),
  DISCORD_REDIRECT_URI: z.string().default(""),
  SESSION_SECRET: z.string().default(""),
  IRIS_MOCK_AUTH: booleanFromEnv.default(false),
  IRIS_MOCK_WALLET: booleanFromEnv.default(false),
  IRIS_ECONOMY_API_BASE_URL: z.string().url().default("http://127.0.0.1:8787"),
  IRIS_ECONOMY_API_KEY: z.string().default(""),
  ECONOMY_API_TIMEOUT_MS: z.coerce.number().int().positive().max(10000).default(2500)
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function loadEnv(overrides: Record<string, unknown> = {}): ServerEnv {
  const env = ServerEnvSchema.parse({ ...process.env, ...overrides });

  if (env.NODE_ENV === "production" && env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production.");
  }

  return env;
}
