import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "../env.js";

type StoredRound = Record<string, unknown>;

const env = loadEnv();
const userId = argument("--user");
const activeOnly = process.argv.includes("--active");
const stores: Array<[string, string, "id" | "roundId" | "spinId" | "ticketId" | "dropId"]> = [
  ["blackjack", env.CASINO_STATE_PATH, "id"], ["roulette", env.ROULETTE_STATE_PATH, "spinId"], ["slots", env.SLOTS_STATE_PATH, "spinId"], ["baccarat", env.BACCARAT_STATE_PATH, "id"], ["poker", env.POKER_STATE_PATH, "id"], ["sicbo", env.SICBO_STATE_PATH, "spinId"], ["keno", env.KENO_STATE_PATH, "id"], ["dragon", env.DRAGON_STATE_PATH, "roundId"], ["wheel", env.WHEEL_STATE_PATH, "spinId"], ["craps", env.CRAPS_STATE_PATH, "roundId"], ["plinko", env.PLINKO_STATE_PATH, "dropId"], ["hilo", env.HILO_STATE_PATH, "roundId"], ["mines", env.MINES_STATE_PATH, "roundId"], ["war", env.WAR_STATE_PATH, "roundId"], ["bingo", env.BINGO_STATE_PATH, "roundId"], ["scratch", env.SCRATCH_STATE_PATH, "ticketId"], ["legacy", env.LEGACY_GAMES_STATE_PATH, "id"]
];

const rounds = stores.flatMap(([game, path, idKey]) => readRounds(path).flatMap((round) => {
  if (userId && round.discordUserId !== userId) return [];
  if (activeOnly && round.phase === "settled") return [];
  return [{ game: typeof round.game === "string" ? round.game : game, roundId: stringValue(round[idKey]), discordUserId: stringValue(round.discordUserId), phase: stringValue(round.phase), bet: numberValue(round.bet), payout: numberValue(round.payout), transactionId: transactionId(game, round, idKey) }];
}));

process.stdout.write(`${JSON.stringify({ rounds }, null, 2)}\n`);

function readRounds(path: string): StoredRound[] {
  try {
    const value: unknown = JSON.parse(readFileSync(resolve(path), "utf8"));
    return Array.isArray(value) ? value.filter((round): round is StoredRound => Boolean(round && typeof round === "object")) : [];
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value && /^\d{17,20}$/u.test(value) ? value : undefined;
}

function stringValue(value: unknown): string | null { return typeof value === "string" ? value : null; }
function numberValue(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function transactionId(game: string, round: StoredRound, idKey: string): string | null { const id = stringValue(round[idKey]); return id ? `${game}-${id}` : null; }
