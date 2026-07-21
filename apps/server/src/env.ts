import { z } from "zod";

const booleanFromEnv = z.preprocess((value) => {
  if (value === true || value === "true" || value === "1") return true;
  return false;
}, z.boolean());

export const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  DISCORD_ACTIVITY_MODE: booleanFromEnv.default(false),
  ACTIVITY_COOKIE_DOMAIN: z.string().default(""),
  DISCORD_CLIENT_ID: z.string().default(""),
  DISCORD_CLIENT_SECRET: z.string().default(""),
  DISCORD_REDIRECT_URI: z.string().default(""),
  SESSION_SECRET: z.string().default(""),
  IRIS_MOCK_AUTH: booleanFromEnv.default(false),
  IRIS_MOCK_WALLET: booleanFromEnv.default(false),
  IRIS_ECONOMY_API_BASE_URL: z.string().url().default("http://127.0.0.1:8787"),
  IRIS_ECONOMY_API_KEY: z.string().default(""),
  ECONOMY_API_TIMEOUT_MS: z.coerce.number().int().positive().max(10000).default(2500),
  LEGACY_MIGRATION_ENABLED: booleanFromEnv.default(false),
  LEGACY_MIGRATION_ALLOWLIST: z.string().default(""),
  CASINO_NEW_BETS_ENABLED: booleanFromEnv.default(true),
  CASINO_DISABLED_GAMES: z.string().default(""),
  CASINO_BETA_MAX_BET: z.coerce.number().int().nonnegative().max(1_000_000).default(0),
  CASINO_STATE_PATH: z.string().min(1).default("data/casino-rounds.json"),
  ROULETTE_STATE_PATH: z.string().min(1).default("data/roulette-rounds.json"),
  SLOTS_STATE_PATH: z.string().min(1).default("data/slots-rounds.json"),
  BACCARAT_STATE_PATH: z.string().min(1).default("data/baccarat-rounds.json"),
  POKER_STATE_PATH: z.string().min(1).default("data/poker-rounds.json"),
  SICBO_STATE_PATH: z.string().min(1).default("data/sicbo-rounds.json"),
  KENO_STATE_PATH: z.string().min(1).default("data/keno-rounds.json"),
  DRAGON_STATE_PATH: z.string().min(1).default("data/dragon-rounds.json"),
  WHEEL_STATE_PATH: z.string().min(1).default("data/wheel-rounds.json"),
  CRAPS_STATE_PATH: z.string().min(1).default("data/craps-rounds.json"),
  PLINKO_STATE_PATH: z.string().min(1).default("data/plinko-rounds.json"),
  HILO_STATE_PATH: z.string().min(1).default("data/hilo-rounds.json"),
  MINES_STATE_PATH: z.string().min(1).default("data/mines-rounds.json"),
  WAR_STATE_PATH: z.string().min(1).default("data/war-rounds.json"),
  BINGO_STATE_PATH: z.string().min(1).default("data/bingo-rounds.json"),
  SCRATCH_STATE_PATH: z.string().min(1).default("data/scratch-rounds.json"),
  LEGACY_GAMES_STATE_PATH: z.string().min(1).default("data/legacy-game-rounds.json"),
  ACTIVITY_PROGRESS_STATE_PATH: z.string().min(1).default("data/activity-progress.json"),
  PARTY_STATE_PATH: z.string().min(1).default("data/party-state.json"),
  DUEL_STATE_PATH: z.string().min(1).default("data/duel-state.json")
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

export function loadEnv(overrides: Record<string, unknown> = {}): ServerEnv {
  const env = ServerEnvSchema.parse({ ...process.env, ...overrides });

  if (env.NODE_ENV === "production" && env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters in production.");
  }

  if (env.NODE_ENV === "production") {
    if (env.IRIS_MOCK_AUTH || env.IRIS_MOCK_WALLET) {
      throw new Error("IRIS mock authentication and wallet modes must be disabled in production.");
    }
    if (!env.DISCORD_ACTIVITY_MODE) {
      throw new Error("DISCORD_ACTIVITY_MODE must be enabled in production.");
    }
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DISCORD_REDIRECT_URI) {
      throw new Error("Discord OAuth credentials must be configured in production.");
    }
    if (!env.DISCORD_REDIRECT_URI.startsWith("https://")) {
      throw new Error("DISCORD_REDIRECT_URI must use HTTPS in production.");
    }
    if (env.ACTIVITY_COOKIE_DOMAIN && env.ACTIVITY_COOKIE_DOMAIN !== `${env.DISCORD_CLIENT_ID}.discordsays.com`) {
      throw new Error("ACTIVITY_COOKIE_DOMAIN must match the Discord Activity proxy domain.");
    }
    if (!env.IRIS_ECONOMY_API_KEY) {
      throw new Error("IRIS_ECONOMY_API_KEY must be configured in production.");
    }
    if (!env.WEB_ORIGIN.startsWith("https://")) {
      throw new Error("WEB_ORIGIN must use HTTPS in production.");
    }
    if (env.LEGACY_MIGRATION_ENABLED && !env.LEGACY_MIGRATION_ALLOWLIST.trim()) {
      throw new Error("LEGACY_MIGRATION_ALLOWLIST must be configured when legacy migration is enabled in production.");
    }
  }

  return env;
}
