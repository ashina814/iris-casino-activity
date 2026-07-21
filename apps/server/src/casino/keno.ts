import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { kenoRounds } from "../storage/store-validators.js";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type KenoPhase = "reserving" | "settling" | "settled";
export interface KenoRound { drawId: string; discordUserId: string; bet: number; picks: number[]; drawn: number[] | null; hits: number | null; payout: number | null; wallet: number | null; phase: KenoPhase; }
export interface KenoRoundStore { load(): KenoRound[]; save(rounds: KenoRound[]): void; }

export class FileKenoRoundStore implements KenoRoundStore {
  constructor(private readonly filePath: string) {}
  load(): KenoRound[] {
    try { const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8", kenoRounds)); if (!Array.isArray(value)) throw new Error("Keno state is invalid."); return value as KenoRound[]; }
    catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return []; throw error; }
  }
  save(rounds: KenoRound[]): void { mkdirSync(dirname(this.filePath), { recursive: true }); writeFileSync(this.filePath, JSON.stringify(rounds), "utf8", kenoRounds); }
}

export class KenoService {
  private readonly rounds: Map<string, KenoRound>;
  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: KenoRoundStore; drawn?: () => number[] }) { this.rounds = new Map(options.store.load().map((round) => [round.drawId, round])); }
  async reconcileAll(): Promise<void> { for (const round of this.rounds.values()) if (round.phase !== "settled") await this.resume(round); }
  async draw(user: DiscordUser, drawId: string, bet: number, picks: number[]): Promise<KenoRound> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(drawId) || ![100, 500, 1000, 2500, 5000].includes(bet)) throw new AppError(400, "bad_request", "Keno draw is invalid.");
    const normalized = normalizePicks(picks), existing = this.rounds.get(drawId);
    if (existing) {
      if (existing.discordUserId !== user.id || existing.bet !== bet || JSON.stringify(existing.picks) !== JSON.stringify(normalized)) throw new AppError(409, "casino_transaction_conflict", "Keno draw does not match its original request.");
      await this.resume(existing); return existing;
    }
    const round: KenoRound = { drawId, discordUserId: user.id, bet, picks: normalized, drawn: null, hits: null, payout: null, wallet: null, phase: "reserving" };
    this.rounds.set(drawId, round); this.save(); await this.resume(round); return round;
  }
  private async resume(round: KenoRound): Promise<void> {
    if (round.phase === "reserving") {
      const reservation = await reserveCasinoBet({ transactionId: `keno-${round.drawId}`, discordUserId: round.discordUserId, sessionId: `keno-${round.drawId}`, game: "keno", bet: round.bet }, this.options.env, this.options.fetch);
      round.wallet = reservation.wallet;
      round.drawn ??= this.options.drawn?.() ?? pickTen();
      if (!validDraw(round.drawn)) throw new AppError(500, "internal_error", "Keno draw is invalid.");
      round.hits = round.drawn.filter((number) => round.picks.includes(number)).length;
      round.payout = round.bet * (PAY[round.picks.length]![round.hits] ?? 0);
      round.phase = "settling"; this.save();
    }
    if (round.phase === "settling") {
      const settled = await settleCasinoReservation(`keno-${round.drawId}`, { payout: round.payout ?? 0 }, this.options.env, this.options.fetch);
      round.wallet = settled.wallet; round.phase = "settled"; this.save();
    }
  }
  private save(): void { this.options.store.save([...this.rounds.values()]); }
}

const PAY: Record<number, Record<number, number>> = {
  5: { 2: 2, 3: 3, 4: 10, 5: 80 },
  6: { 3: 3, 4: 14, 5: 80, 6: 800 },
  7: { 3: 2, 4: 6, 5: 35, 6: 200, 7: 1500 },
  8: { 4: 3, 5: 28, 6: 200, 7: 1500, 8: 10000 },
  9: { 4: 2, 5: 14, 6: 80, 7: 500, 8: 4000, 9: 20000 },
  10: { 4: 1, 5: 5, 6: 40, 7: 300, 8: 4000, 9: 20000, 10: 100000 }
};
function normalizePicks(input: number[]): number[] {
  if (!Array.isArray(input) || input.length < 5 || input.length > 10 || input.some((pick) => !Number.isInteger(pick) || pick < 1 || pick > 40)) throw new AppError(400, "bad_request", "Keno picks are invalid.");
  const picks = [...new Set(input)].sort((left, right) => left - right);
  if (picks.length !== input.length) throw new AppError(400, "bad_request", "Keno picks must be unique.");
  return picks;
}
function pickTen(): number[] {
  const pool = Array.from({ length: 40 }, (_, index) => index + 1);
  for (let index = pool.length - 1; index > 0; index -= 1) { const next = randomInt(index + 1); [pool[index], pool[next]] = [pool[next]!, pool[index]!]; }
  return pool.slice(0, 10);
}
function validDraw(drawn: number[]): boolean { return drawn.length === 10 && new Set(drawn).size === 10 && drawn.every((number) => Number.isInteger(number) && number >= 1 && number <= 40); }
