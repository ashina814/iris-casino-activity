import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { wheelRounds } from "../storage/store-validators.js";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type Phase = "reserving" | "settling" | "settled";
const segments = [8, 0, 1, 0, 0, 2, 0, 1, 0, 0, 3, 0, 1, 0, 0, 2, 0, 1, 0, 0, 2, 0, 1, 0];
export interface WheelRound { spinId: string; discordUserId: string; bet: number; index: number | null; multiplier: number | null; payout: number | null; wallet: number | null; phase: Phase; }
export interface WheelRoundStore { load(): WheelRound[]; save(rounds: WheelRound[]): void; }
export class FileWheelRoundStore implements WheelRoundStore {
  constructor(private readonly filePath: string) {}
  load(): WheelRound[] { try { const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8", wheelRounds)); if (!Array.isArray(value)) throw new Error("Wheel state is invalid."); return value as WheelRound[]; } catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return []; throw error; } }
  save(rounds: WheelRound[]): void { mkdirSync(dirname(this.filePath), { recursive: true }); writeFileSync(this.filePath, JSON.stringify(rounds), "utf8", wheelRounds); }
}
export class WheelService {
  private readonly rounds: Map<string, WheelRound>;
  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: WheelRoundStore; index?: () => number }) { this.rounds = new Map(options.store.load().map((round) => [round.spinId, round])); }
  async reconcileAll(): Promise<void> { for (const round of this.rounds.values()) if (round.phase !== "settled") await this.resume(round); }
  async spin(user: DiscordUser, spinId: string, bet: number): Promise<WheelRound> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(spinId) || ![100, 500, 1000, 2500, 5000].includes(bet)) throw new AppError(400, "bad_request", "Wheel spin is invalid.");
    const existing = this.rounds.get(spinId); if (existing) { if (existing.discordUserId !== user.id || existing.bet !== bet) throw new AppError(409, "casino_transaction_conflict", "Wheel spin does not match its original request."); await this.resume(existing); return existing; }
    const round: WheelRound = { spinId, discordUserId: user.id, bet, index: null, multiplier: null, payout: null, wallet: null, phase: "reserving" }; this.rounds.set(spinId, round); this.save(); await this.resume(round); return round;
  }
  private async resume(round: WheelRound): Promise<void> {
    if (round.phase === "reserving") { const reservation = await reserveCasinoBet({ transactionId: `wheel-${round.spinId}`, discordUserId: round.discordUserId, sessionId: `wheel-${round.spinId}`, game: "wheel", bet: round.bet }, this.options.env, this.options.fetch); round.wallet = reservation.wallet; round.index ??= this.options.index?.() ?? randomInt(segments.length); if (!Number.isInteger(round.index) || round.index < 0 || round.index >= segments.length) throw new AppError(500, "internal_error", "Wheel index is invalid."); round.multiplier = segments[round.index]!; round.payout = round.bet * round.multiplier; round.phase = "settling"; this.save(); }
    if (round.phase === "settling") { const settled = await settleCasinoReservation(`wheel-${round.spinId}`, { payout: round.payout ?? 0 }, this.options.env, this.options.fetch); round.wallet = settled.wallet; round.phase = "settled"; this.save(); }
  }
  private save(): void { this.options.store.save([...this.rounds.values()]); }
}
