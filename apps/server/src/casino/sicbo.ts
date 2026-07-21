import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type SicBoPhase = "reserving" | "settling" | "settled";
export interface SicBoBet { selection: string; amount: number; }
export interface SicBoBreakdown extends SicBoBet { multiplier: number; payout: number; }
export interface SicBoRound {
  spinId: string; discordUserId: string; bets: SicBoBet[]; total: number; dice: number[] | null;
  payout: number | null; wallet: number | null; breakdown: SicBoBreakdown[]; phase: SicBoPhase;
}
export interface SicBoRoundStore { load(): SicBoRound[]; save(rounds: SicBoRound[]): void; }

export class FileSicBoRoundStore implements SicBoRoundStore {
  constructor(private readonly filePath: string) {}
  load(): SicBoRound[] {
    try { const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8")); if (!Array.isArray(value)) throw new Error("Sic Bo state is invalid."); return value as SicBoRound[]; }
    catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return []; throw error; }
  }
  save(rounds: SicBoRound[]): void { mkdirSync(dirname(this.filePath), { recursive: true }); writeFileSync(this.filePath, JSON.stringify(rounds), "utf8"); }
}

export class SicBoService {
  private readonly rounds: Map<string, SicBoRound>;
  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: SicBoRoundStore; dice?: () => number[] }) { this.rounds = new Map(options.store.load().map((round) => [round.spinId, round])); }
  async reconcileAll(): Promise<void> { for (const round of this.rounds.values()) if (round.phase !== "settled") await this.resume(round); }
  async roll(user: DiscordUser, spinId: string, bets: SicBoBet[]): Promise<SicBoRound> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(spinId)) throw new AppError(400, "bad_request", "Sic Bo spin is invalid.");
    const normalized = normalize(bets), existing = this.rounds.get(spinId);
    if (existing) {
      if (existing.discordUserId !== user.id || JSON.stringify(existing.bets) !== JSON.stringify(normalized)) throw new AppError(409, "casino_transaction_conflict", "Sic Bo spin does not match its original request.");
      await this.resume(existing); return existing;
    }
    const round: SicBoRound = { spinId, discordUserId: user.id, bets: normalized, total: normalized.reduce((sum, bet) => sum + bet.amount, 0), dice: null, payout: null, wallet: null, breakdown: [], phase: "reserving" };
    this.rounds.set(spinId, round); this.save(); await this.resume(round); return round;
  }
  private async resume(round: SicBoRound): Promise<void> {
    if (round.phase === "reserving") {
      const reservation = await reserveCasinoBet({ transactionId: `sicbo-${round.spinId}`, discordUserId: round.discordUserId, sessionId: `sicbo-${round.spinId}`, game: "sicbo", bet: round.total }, this.options.env, this.options.fetch);
      round.wallet = reservation.wallet;
      round.dice ??= this.options.dice?.() ?? [1 + randomInt(6), 1 + randomInt(6), 1 + randomInt(6)];
      if (!validDice(round.dice)) throw new AppError(500, "internal_error", "Sic Bo dice are invalid.");
      round.breakdown = round.bets.map((bet) => { const multiplier = multiplierFor(bet.selection, round.dice!); return { ...bet, multiplier, payout: bet.amount * multiplier }; }).filter((bet) => bet.payout > 0);
      round.payout = round.breakdown.reduce((sum, bet) => sum + bet.payout, 0);
      round.phase = "settling"; this.save();
    }
    if (round.phase === "settling") {
      const settled = await settleCasinoReservation(`sicbo-${round.spinId}`, { payout: round.payout ?? 0 }, this.options.env, this.options.fetch);
      round.wallet = settled.wallet; round.phase = "settled"; this.save();
    }
  }
  private save(): void { this.options.store.save([...this.rounds.values()]); }
}

const TOTAL_PAY: Record<number, number> = { 4: 51, 5: 31, 6: 19, 7: 13, 8: 9, 9: 7, 10: 6, 11: 6, 12: 7, 13: 9, 14: 13, 15: 19, 16: 31, 17: 51 };
function normalize(input: SicBoBet[]): SicBoBet[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 64) throw new AppError(400, "bad_request", "Sic Bo bets are invalid.");
  const grouped = new Map<string, number>();
  for (const bet of input) {
    if (!bet || typeof bet.selection !== "string" || !validSelection(bet.selection) || !Number.isSafeInteger(bet.amount) || bet.amount <= 0) throw new AppError(400, "bad_request", "Sic Bo bet is invalid.");
    grouped.set(bet.selection, (grouped.get(bet.selection) ?? 0) + bet.amount);
  }
  const bets = [...grouped].map(([selection, amount]) => ({ selection, amount }));
  if (!Number.isSafeInteger(bets.reduce((sum, bet) => sum + bet.amount, 0))) throw new AppError(400, "bad_request", "Sic Bo bet total is invalid.");
  return bets;
}
function validSelection(selection: string): boolean { return ["small", "big", "odd", "even", "anyTriple"].includes(selection) || /^(?:total:(?:[4-9]|1[0-7])|double:[1-6]|triple:[1-6]|single:[1-6])$/.test(selection); }
function validDice(dice: number[]): boolean { return dice.length === 3 && dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6); }
function multiplierFor(selection: string, dice: number[]): number {
  const sum = dice.reduce((total, die) => total + die, 0), triple = dice[0] === dice[1] && dice[1] === dice[2];
  if (selection === "small") return !triple && sum >= 4 && sum <= 10 ? 2 : 0;
  if (selection === "big") return !triple && sum >= 11 && sum <= 17 ? 2 : 0;
  if (selection === "odd") return !triple && sum % 2 ? 2 : 0;
  if (selection === "even") return !triple && sum % 2 === 0 ? 2 : 0;
  if (selection === "anyTriple") return triple ? 31 : 0;
  const [kind, raw] = selection.split(":"), value = Number(raw);
  if (kind === "total") return sum === value ? TOTAL_PAY[value]! : 0;
  if (kind === "double") return dice.filter((die) => die === value).length >= 2 ? 11 : 0;
  if (kind === "triple") return triple && dice[0] === value ? 181 : 0;
  if (kind === "single") { const count = dice.filter((die) => die === value).length; return count ? count + 1 : 0; }
  return 0;
}
