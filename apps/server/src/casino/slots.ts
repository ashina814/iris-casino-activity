import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type SymbolId = "WILD" | "SCATTER" | "CROWN" | "MOON" | "DIAMOND" | "ROSE" | "BELL" | "STAR";
type SlotsPhase = "reserving" | "settling" | "settled";

const symbols: Array<[SymbolId, number]> = [
  ["WILD", 2], ["SCATTER", 3], ["CROWN", 6], ["MOON", 8],
  ["DIAMOND", 10], ["ROSE", 13], ["BELL", 16], ["STAR", 20]
];
const pay: Record<Exclude<SymbolId, "SCATTER">, Record<number, number>> = {
  WILD: { 3: 15, 4: 60, 5: 250 },
  CROWN: { 3: 8, 4: 30, 5: 120 },
  MOON: { 3: 6, 4: 20, 5: 80 },
  DIAMOND: { 3: 5, 4: 15, 5: 55 },
  ROSE: { 3: 4, 4: 12, 5: 40 },
  BELL: { 3: 3, 4: 9, 5: 30 },
  STAR: { 3: 2, 4: 6, 5: 20 }
};
const lines = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0]
];

export interface SlotsCascade {
  grid: SymbolId[][];
  positions: string[];
  multiplier: number;
  payout: number;
}

export interface SlotsRound {
  spinId: string;
  discordUserId: string;
  bet: number;
  wager: number;
  phase: SlotsPhase;
  grid: SymbolId[][] | null;
  payout: number | null;
  awarded: number;
  cascades: SlotsCascade[];
  wallet: number | null;
}

export interface SlotsPlayerState {
  discordUserId: string;
  freeSpins: number;
}

export interface SlotsState {
  rounds: SlotsRound[];
  players: SlotsPlayerState[];
}

export interface SlotsRoundStore {
  load(): SlotsState;
  save(state: SlotsState): void;
}

export class FileSlotsRoundStore implements SlotsRoundStore {
  constructor(private readonly filePath: string) {}

  load(): SlotsState {
    try {
      const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!value || typeof value !== "object" || !Array.isArray((value as SlotsState).rounds) || !Array.isArray((value as SlotsState).players)) {
        throw new Error("Slots state is invalid.");
      }
      return value as SlotsState;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return { rounds: [], players: [] };
      throw error;
    }
  }

  save(state: SlotsState): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state), "utf8");
  }
}

export class SlotsService {
  private readonly rounds: Map<string, SlotsRound>;
  private readonly players: Map<string, SlotsPlayerState>;

  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: SlotsRoundStore; symbol?: () => SymbolId }) {
    const state = options.store.load();
    this.rounds = new Map(state.rounds.map((round) => [round.spinId, round]));
    this.players = new Map(state.players.map((player) => [player.discordUserId, player]));
  }

  async reconcileAll(): Promise<void> {
    for (const round of this.rounds.values()) if (round.phase !== "settled") await this.resume(round);
  }

  async spin(user: DiscordUser, spinId: string, bet: number): Promise<SlotsRound & { freeSpins: number }> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(spinId) || ![100, 500, 1000, 2500, 5000].includes(bet)) {
      throw new AppError(400, "bad_request", "Slots spin is invalid.");
    }

    const existing = this.rounds.get(spinId);
    if (existing) {
      if (existing.discordUserId !== user.id || existing.bet !== bet) {
        throw new AppError(409, "casino_transaction_conflict", "Slots spin does not match its original request.");
      }
      await this.resume(existing);
      return this.publicState(existing);
    }

    const player = this.player(user.id);
    const wager = player.freeSpins > 0 ? 0 : bet;
    if (wager === 0) player.freeSpins -= 1;
    const round: SlotsRound = {
      spinId,
      discordUserId: user.id,
      bet,
      wager,
      phase: "reserving",
      grid: null,
      payout: null,
      awarded: 0,
      cascades: [],
      wallet: null
    };
    this.rounds.set(spinId, round);
    this.save();
    await this.resume(round);
    return this.publicState(round);
  }

  private async resume(round: SlotsRound): Promise<void> {
    if (round.phase === "reserving") {
      if (round.wager > 0) {
        const reservation = await reserveCasinoBet({
          transactionId: `slots-${round.spinId}`,
          discordUserId: round.discordUserId,
          sessionId: `slots-${round.spinId}`,
          game: "slots",
          bet: round.wager
        }, this.options.env, this.options.fetch);
        round.wallet = reservation.wallet;
      }
      this.resolve(round);
      round.phase = "settling";
      this.save();
    }

    if (round.phase === "settling") {
      if (round.wager > 0) {
        const settlement = await settleCasinoReservation(
          `slots-${round.spinId}`,
          { payout: round.payout ?? 0 },
          this.options.env,
          this.options.fetch
        );
        round.wallet = settlement.wallet;
      }
      round.phase = "settled";
      this.save();
    }
  }

  private resolve(round: SlotsRound): void {
    if (round.grid) return;
    let grid = this.grid();
    const scatter = this.scatter(grid, round.bet);
    let payout = scatter.payout;
    const cascades: SlotsCascade[] = [];
    const baseMultiplier = round.wager === 0 ? 2 : 1;

    for (let cascade = 0; cascade < 5; cascade += 1) {
      const won = this.wins(grid, round.bet);
      if (won.payout === 0) break;
      const multiplier = baseMultiplier + cascade;
      const stepPayout = won.payout * multiplier;
      payout += stepPayout;
      cascades.push({ grid: structuredClone(grid), positions: [...won.positions], multiplier, payout: stepPayout });
      grid = this.cascade(grid, won.positions);
    }

    round.grid = grid;
    round.payout = payout;
    round.awarded = scatter.free;
    round.cascades = cascades;
    if (scatter.free > 0) this.player(round.discordUserId).freeSpins += scatter.free;
  }

  private publicState(round: SlotsRound): SlotsRound & { freeSpins: number } {
    if (!round.grid || round.payout === null) throw new AppError(500, "internal_error", "Slots round is incomplete.");
    return { ...round, grid: structuredClone(round.grid), cascades: structuredClone(round.cascades), freeSpins: this.player(round.discordUserId).freeSpins };
  }

  private player(discordUserId: string): SlotsPlayerState {
    let player = this.players.get(discordUserId);
    if (!player) {
      player = { discordUserId, freeSpins: 0 };
      this.players.set(discordUserId, player);
    }
    return player;
  }

  private symbol(): SymbolId {
    if (this.options.symbol) return this.options.symbol();
    let remaining = randomInt(symbols.reduce((sum, [, weight]) => sum + weight, 0));
    for (const [id, weight] of symbols) {
      remaining -= weight;
      if (remaining < 0) return id;
    }
    return "STAR";
  }

  private grid(): SymbolId[][] {
    return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => this.symbol()));
  }

  private scatter(grid: SymbolId[][], bet: number): { payout: number; free: number } {
    const count = grid.flat().filter((symbol) => symbol === "SCATTER").length;
    if (count < 3) return { payout: 0, free: 0 };
    const key = Math.min(5, count) as 3 | 4 | 5;
    return { payout: bet * ({ 3: 2, 4: 8, 5: 25 }[key]), free: ({ 3: 5, 4: 10, 5: 15 }[key]) };
  }

  private wins(grid: SymbolId[][], bet: number): { payout: number; positions: Set<string> } {
    const positions = new Set<string>();
    let payout = 0;
    for (const rows of lines) {
      const sequence = rows.map((row, column) => grid[column]![row]!);
      let base = sequence[0]!;
      if (base === "SCATTER") continue;
      if (base === "WILD") base = sequence.find((symbol) => symbol !== "WILD" && symbol !== "SCATTER") ?? "WILD";
      let count = 0;
      while (count < 5 && (sequence[count] === base || sequence[count] === "WILD")) count += 1;
      if (count < 3) continue;
      payout += Math.floor((bet / 10) * (pay[base]![count] ?? 0));
      for (let column = 0; column < count; column += 1) positions.add(`${column}-${rows[column]}`);
    }
    return { payout, positions };
  }

  private cascade(grid: SymbolId[][], positions: Set<string>): SymbolId[][] {
    return grid.map((column, columnIndex) => {
      const kept = column.filter((_symbol, rowIndex) => !positions.has(`${columnIndex}-${rowIndex}`));
      while (kept.length < 3) kept.unshift(this.symbol());
      return kept;
    });
  }

  private save(): void {
    this.options.store.save({ rounds: [...this.rounds.values()], players: [...this.players.values()] });
  }
}
