import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { crapsRounds } from "../storage/store-validators.js";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type CrapsSelection = "pass" | "dont" | "field" | "any7" | "exact6" | "exact8";
type CrapsPhase = "reserving" | "active" | "settling" | "settled";
export interface CrapsRound { roundId: string; discordUserId: string; selection: CrapsSelection; bet: number; point: number | null; dice: number[] | null; payout: number | null; wallet: number | null; phase: CrapsPhase; message: string; lastRollId: string | null; }
export interface CrapsRoundStore { load(): CrapsRound[]; save(rounds: CrapsRound[]): void; }
export class FileCrapsRoundStore implements CrapsRoundStore {
  constructor(private readonly filePath: string) {}
  load(): CrapsRound[] { try { const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8", crapsRounds)); if (!Array.isArray(value)) throw new Error("Craps state is invalid."); return value as CrapsRound[]; } catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return []; throw error; } }
  save(rounds: CrapsRound[]): void { mkdirSync(dirname(this.filePath), { recursive: true }); writeFileSync(this.filePath, JSON.stringify(rounds), "utf8", crapsRounds); }
}
export class CrapsService {
  private readonly rounds: Map<string, CrapsRound>;
  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: CrapsRoundStore; dice?: () => number[] }) { this.rounds = new Map(options.store.load().map((round) => [round.roundId, round])); }
  async reconcileAll(): Promise<void> { for (const round of this.rounds.values()) if (round.phase === "reserving" || round.phase === "settling") await this.resume(round); }
  async start(user: DiscordUser, roundId: string, selection: CrapsSelection, bet: number): Promise<CrapsRound> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(roundId) || !isSelection(selection) || ![100, 500, 1000, 2500, 5000].includes(bet)) throw new AppError(400, "bad_request", "Craps round is invalid.");
    const existing = this.rounds.get(roundId);
    if (existing) { if (existing.discordUserId !== user.id || existing.selection !== selection || existing.bet !== bet) throw new AppError(409, "casino_transaction_conflict", "Craps round does not match its original request."); await this.resume(existing); return existing.phase === "active" && !existing.dice ? this.roll(user, roundId, roundId) : existing; }
    const round: CrapsRound = { roundId, discordUserId: user.id, selection, bet, point: null, dice: null, payout: null, wallet: null, phase: "reserving", message: "COME OUT ROLL", lastRollId: null };
    this.rounds.set(roundId, round); this.save(); await this.resume(round); return this.roll(user, roundId, roundId);
  }
  async roll(user: DiscordUser, roundId: string, actionId: string): Promise<CrapsRound> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(actionId)) throw new AppError(400, "bad_request", "Craps roll is invalid.");
    const round = this.requireRound(user, roundId); await this.resume(round);
    if (round.lastRollId === actionId) return round;
    if (round.phase !== "active") return round;
    const dice = this.options.dice?.() ?? [1 + randomInt(6), 1 + randomInt(6)];
    if (!validDice(dice)) throw new AppError(500, "internal_error", "Craps dice are invalid.");
    round.lastRollId = actionId;
    round.dice = dice; const sum = dice[0]! + dice[1]!; this.resolve(round, sum); this.save(); await this.resume(round); return round;
  }
  private async resume(round: CrapsRound): Promise<void> {
    if (round.phase === "reserving") { const reservation = await reserveCasinoBet({ transactionId: `craps-${round.roundId}`, discordUserId: round.discordUserId, sessionId: `craps-${round.roundId}`, game: "craps", bet: round.bet }, this.options.env, this.options.fetch); round.wallet = reservation.wallet; round.phase = "active"; this.save(); }
    if (round.phase === "settling") { const settled = await settleCasinoReservation(`craps-${round.roundId}`, { payout: round.payout ?? 0 }, this.options.env, this.options.fetch); round.wallet = settled.wallet; round.phase = "settled"; this.save(); }
  }
  private resolve(round: CrapsRound, sum: number): void {
    const settle = (payout: number, message: string) => { round.payout = payout; round.message = message; round.point = null; round.phase = "settling"; };
    if (round.selection === "field") return settle([2, 12].includes(sum) ? round.bet * 3 : [3, 4, 9, 10, 11].includes(sum) ? round.bet * 2 : 0, [2, 3, 4, 9, 10, 11, 12].includes(sum) ? "FIELD WIN" : "FIELD MISS");
    if (round.selection === "any7") return settle(sum === 7 ? round.bet * 5 : 0, sum === 7 ? "ANY 7" : "SEVEN MISSED");
    if (round.selection === "exact6" || round.selection === "exact8") { const target = round.selection === "exact6" ? 6 : 8; return settle(sum === target ? round.bet * 6 : 0, sum === target ? `EXACT ${target}` : `${target} MISSED`); }
    if (round.selection === "pass") {
      if (round.point === null) { if ([7, 11].includes(sum)) return settle(round.bet * 2, "PASS LINE WIN"); if ([2, 3, 12].includes(sum)) return settle(0, "CRAPS"); round.point = sum; round.message = `POINT ${sum}`; return; }
      if (sum === round.point) return settle(round.bet * 2, "POINT MADE"); if (sum === 7) return settle(0, "SEVEN OUT"); round.message = `POINT ${round.point}`; return;
    }
    if (round.point === null) { if ([2, 3].includes(sum)) return settle(round.bet * 2, "DON'T PASS WIN"); if ([7, 11].includes(sum)) return settle(0, "NATURAL LOSE"); if (sum === 12) return settle(round.bet, "BAR 12 PUSH"); round.point = sum; round.message = `POINT ${sum}`; return; }
    if (sum === 7) return settle(round.bet * 2, "SEVEN BEFORE POINT"); if (sum === round.point) return settle(0, "POINT MADE BY TABLE"); round.message = `POINT ${round.point}`;
  }
  private requireRound(user: DiscordUser, roundId: string): CrapsRound { const round = this.rounds.get(roundId); if (!round || round.discordUserId !== user.id) throw new AppError(404, "casino_transaction_not_found", "Craps round was not found."); return round; }
  private save(): void { this.options.store.save([...this.rounds.values()]); }
}
function isSelection(value: string): value is CrapsSelection { return ["pass", "dont", "field", "any7", "exact6", "exact8"].includes(value); }
function validDice(dice: number[]): boolean { return dice.length === 2 && dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6); }
