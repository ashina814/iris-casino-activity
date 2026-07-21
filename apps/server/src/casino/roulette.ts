import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { annotateErrorStage, AppError } from "../errors.js";
import { getCasinoTransaction, reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export interface RouletteBet { selection: string; amount: number; }

export interface RouletteRound {
  spinId: string;
  discordUserId: string;
  bets: RouletteBet[];
  total: number;
  number: number | null;
  payout: number | null;
  wallet: number | null;
  phase: "reserving" | "settling" | "settled" | "reconciliation_failed";
  reconciliation?: { reason: string; remoteStatus?: string; remotePayout?: number | null };
}

export interface RouletteRoundStore { load(): RouletteRound[]; save(rounds: RouletteRound[]): void; }

export class FileRouletteRoundStore implements RouletteRoundStore {
  constructor(private readonly filePath: string) {}
  load(): RouletteRound[] {
    try { const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8")); if (!Array.isArray(value)) throw new Error("Roulette state is invalid."); return value as RouletteRound[]; }
    catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return []; throw error; }
  }
  save(rounds: RouletteRound[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(rounds), "utf8");
  }
}

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export class RouletteService {
  private readonly rounds: Map<string, RouletteRound>;

  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: RouletteRoundStore; number?: () => number }) {
    this.rounds = new Map(options.store.load().map((round) => [round.spinId, round]));
  }

  async reconcileAll(): Promise<void> {
    await Promise.all([...this.rounds.values()].filter((round) => round.phase !== "settled" && round.phase !== "reconciliation_failed").map(async (round) => {
      try { await this.resume(round); }
      catch (error) { console.error("casino_round_reconcile_failed", { game: "roulette", roundId: round.spinId, phase: round.phase, errorName: error instanceof Error ? error.name : "NonErrorThrown", errorMessage: error instanceof Error ? error.message : "unknown reconciliation error" }); }
    }));
  }

  async spin(user: DiscordUser, spinId: string, bets: RouletteBet[]): Promise<RouletteRound> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(spinId)) throw new AppError(400, "bad_request", "Roulette spin is invalid.");
    const existing = this.rounds.get(spinId);
    if (existing) {
      if (existing.discordUserId !== user.id || JSON.stringify(existing.bets) !== JSON.stringify(bets)) {
        throw new AppError(409, "casino_transaction_conflict", "Roulette spin does not match its original request.");
      }
      await this.resume(existing);
      return existing;
    }

    const normalized = normalizeBets(bets);
    const round: RouletteRound = { spinId, discordUserId: user.id, bets: normalized, total: normalized.reduce((sum, bet) => sum + bet.amount, 0), number: null, payout: null, wallet: null, phase: "reserving" };
    this.rounds.set(spinId, round);
    this.save("roulette.state.save.initial");
    await this.resume(round);
    return round;
  }

  private async resume(round: RouletteRound): Promise<void> {
    if (round.phase === "reserving") {
      const reservation = await this.reserve(round);
      if (reservation.transaction.status !== "reserved") {
        this.quarantine(round, "reservation_not_reserved", reservation.transaction.status, reservation.transaction.payout);
        return;
      }
      round.wallet = reservation.wallet;
      round.number ??= this.options.number?.() ?? randomInt(37);
      round.payout = round.bets.reduce((sum, bet) => sum + bet.amount * multiplier(bet.selection, round.number!), 0);
      round.phase = "settling";
      this.save("roulette.state.save.before_settle");
    }
    if (round.phase === "settling") {
      try {
        const settlement = await this.settle(round);
        round.wallet = settlement.wallet;
        round.phase = "settled";
        this.save("roulette.state.save.settled");
      } catch (error) {
        if (!(error instanceof AppError) || (error.code !== "casino_transaction_conflict" && error.code !== "casino_transaction_not_found")) throw error;
        await this.reconcileSettlement(round);
      }
    }
  }

  private async reserve(round: RouletteRound) {
    try {
      return await reserveCasinoBet({ transactionId: `roulette-${round.spinId}`, discordUserId: round.discordUserId, sessionId: `roulette-${round.spinId}`, game: "roulette", bet: round.total }, this.options.env, this.options.fetch);
    } catch (error) {
      throw annotateErrorStage(error, "roulette.reserve");
    }
  }

  private async settle(round: RouletteRound) {
    try {
      return await settleCasinoReservation(`roulette-${round.spinId}`, { payout: round.payout ?? 0 }, this.options.env, this.options.fetch);
    } catch (error) {
      throw annotateErrorStage(error, "roulette.settle");
    }
  }

  private async reconcileSettlement(round: RouletteRound): Promise<void> {
    let transaction;
    try {
      transaction = await getCasinoTransaction(`roulette-${round.spinId}`, this.options.env, this.options.fetch);
    } catch (error) {
      if (error instanceof AppError && error.code === "casino_transaction_not_found") {
        this.quarantine(round, "remote_not_found");
        return;
      }
      throw error;
    }
    if (transaction.transaction.status === "reserved") {
      const settled = await this.settle(round);
      round.wallet = settled.wallet;
      round.phase = "settled";
      this.save("roulette.state.save.reconciled");
      return;
    }
    if (transaction.transaction.status === "settled" && transaction.transaction.payout === (round.payout ?? 0)) {
      round.phase = "settled";
      this.save("roulette.state.save.repaired");
      return;
    }
    this.quarantine(round, transaction.transaction.status === "settled" ? "remote_payout_mismatch" : "remote_cancelled", transaction.transaction.status, transaction.transaction.payout);
  }

  private quarantine(round: RouletteRound, reason: string, remoteStatus?: string, remotePayout?: number | null): void {
    round.phase = "reconciliation_failed";
    round.reconciliation = { reason, remoteStatus, remotePayout };
    this.save("roulette.state.save.quarantined");
  }

  private save(stage: string): void {
    try {
      this.options.store.save([...this.rounds.values()]);
    } catch (error) {
      throw annotateErrorStage(error, stage);
    }
  }
}

function normalizeBets(input: RouletteBet[]): RouletteBet[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 64) throw new AppError(400, "bad_request", "Roulette bets are invalid.");
  const grouped = new Map<string, number>();
  for (const bet of input) {
    if (!bet || typeof bet.selection !== "string" || !Number.isSafeInteger(bet.amount) || bet.amount <= 0 || !validSelection(bet.selection)) throw new AppError(400, "bad_request", "Roulette bet is invalid.");
    grouped.set(bet.selection, (grouped.get(bet.selection) ?? 0) + bet.amount);
  }
  const bets = [...grouped].map(([selection, amount]) => ({ selection, amount }));
  const total = bets.reduce((sum, bet) => sum + bet.amount, 0);
  if (!Number.isSafeInteger(total) || total <= 0) throw new AppError(400, "bad_request", "Roulette bet total is invalid.");
  return bets;
}

function validSelection(value: string): boolean {
  return /^n:(?:[0-9]|[12][0-9]|3[0-6])$/.test(value) || /^(?:dozen|column):[123]$/.test(value) || /^(?:range:(?:low|high)|parity:(?:even|odd)|color:(?:red|black))$/.test(value);
}

function multiplier(selection: string, number: number): number {
  if (selection.startsWith("n:")) return Number(selection.slice(2)) === number ? 36 : 0;
  if (number === 0) return 0;
  const [kind, value] = selection.split(":");
  if (kind === "color") return (value === "red") === RED.has(number) ? 2 : 0;
  if (kind === "parity") return (number % 2 === 0 ? "even" : "odd") === value ? 2 : 0;
  if (kind === "range") return (value === "low" ? number <= 18 : number >= 19) ? 2 : 0;
  if (kind === "dozen") return Math.ceil(number / 12) === Number(value) ? 3 : 0;
  if (kind === "column") return ((number - 1) % 3) + 1 === Number(value) ? 3 : 0;
  return 0;
}
