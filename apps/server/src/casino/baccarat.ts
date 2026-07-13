import { randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type BaccaratBetKey = "player" | "banker" | "tie" | "playerPair" | "bankerPair";
type BaccaratPhase = "reserving" | "settling" | "settled";

export interface BaccaratCard {
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  suit: "S" | "H" | "D" | "C";
}

export interface BaccaratBet {
  selection: BaccaratBetKey;
  amount: number;
}

export interface BaccaratRound {
  roundId: string;
  discordUserId: string;
  bets: BaccaratBet[];
  total: number;
  player: BaccaratCard[];
  banker: BaccaratCard[];
  outcome: "player" | "banker" | "tie" | null;
  payout: number | null;
  wallet: number | null;
  phase: BaccaratPhase;
}

export interface BaccaratRoundStore {
  load(): BaccaratRound[];
  save(rounds: BaccaratRound[]): void;
}

export class FileBaccaratRoundStore implements BaccaratRoundStore {
  constructor(private readonly filePath: string) {}

  load(): BaccaratRound[] {
    try {
      const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!Array.isArray(value)) throw new Error("Baccarat state is invalid.");
      return value as BaccaratRound[];
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  }

  save(rounds: BaccaratRound[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(rounds), "utf8");
  }
}

export class BaccaratService {
  private readonly rounds: Map<string, BaccaratRound>;

  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: BaccaratRoundStore; deck?: () => BaccaratCard[] }) {
    this.rounds = new Map(options.store.load().map((round) => [round.roundId, round]));
  }

  async reconcileAll(): Promise<void> {
    for (const round of this.rounds.values()) if (round.phase !== "settled") await this.resume(round);
  }

  async deal(user: DiscordUser, roundId: string, bets: BaccaratBet[]): Promise<BaccaratRound> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(roundId)) throw new AppError(400, "bad_request", "Baccarat round is invalid.");
    const normalized = normalizeBets(bets);
    const existing = this.rounds.get(roundId);
    if (existing) {
      if (existing.discordUserId !== user.id || JSON.stringify(existing.bets) !== JSON.stringify(normalized)) {
        throw new AppError(409, "casino_transaction_conflict", "Baccarat round does not match its original request.");
      }
      await this.resume(existing);
      return existing;
    }

    const round: BaccaratRound = {
      roundId,
      discordUserId: user.id,
      bets: normalized,
      total: normalized.reduce((sum, bet) => sum + bet.amount, 0),
      player: [],
      banker: [],
      outcome: null,
      payout: null,
      wallet: null,
      phase: "reserving"
    };
    this.rounds.set(roundId, round);
    this.save();
    await this.resume(round);
    return round;
  }

  private async resume(round: BaccaratRound): Promise<void> {
    if (round.phase === "reserving") {
      const reservation = await reserveCasinoBet({
        transactionId: `baccarat-${round.roundId}`,
        discordUserId: round.discordUserId,
        sessionId: `baccarat-${round.roundId}`,
        game: "baccarat",
        bet: round.total
      }, this.options.env, this.options.fetch);
      round.wallet = reservation.wallet;
      if (!round.outcome) this.resolve(round);
      round.phase = "settling";
      this.save();
    }

    if (round.phase === "settling") {
      const settlement = await settleCasinoReservation(
        `baccarat-${round.roundId}`,
        { payout: round.payout ?? 0 },
        this.options.env,
        this.options.fetch
      );
      round.wallet = settlement.wallet;
      round.phase = "settled";
      this.save();
    }
  }

  private resolve(round: BaccaratRound): void {
    const deck = this.options.deck?.() ?? makeDeck(8);
    const draw = () => {
      const card = deck.pop();
      if (!card) throw new AppError(500, "internal_error", "Baccarat shoe is exhausted.");
      return card;
    };
    round.player = [draw()];
    round.banker = [draw()];
    round.player.push(draw());
    round.banker.push(draw());
    let playerThird: BaccaratCard | undefined;
    if (total(round.player) < 8 && total(round.banker) < 8) {
      if (total(round.player) <= 5) {
        playerThird = draw();
        round.player.push(playerThird);
      }
      if (bankerDraws(round.banker, playerThird)) round.banker.push(draw());
    }
    const playerTotal = total(round.player);
    const bankerTotal = total(round.banker);
    round.outcome = playerTotal === bankerTotal ? "tie" : playerTotal > bankerTotal ? "player" : "banker";
    const playerPair = round.player[0]!.rank === round.player[1]!.rank;
    const bankerPair = round.banker[0]!.rank === round.banker[1]!.rank;
    round.payout = round.bets.reduce((sum, bet) => sum + payoutFor(bet, round.outcome!, playerPair, bankerPair), 0);
  }

  private save(): void { this.options.store.save([...this.rounds.values()]); }
}

function normalizeBets(input: BaccaratBet[]): BaccaratBet[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 5) throw new AppError(400, "bad_request", "Baccarat bets are invalid.");
  const grouped = new Map<BaccaratBetKey, number>();
  for (const bet of input) {
    if (!bet || !isKey(bet.selection) || !Number.isSafeInteger(bet.amount) || bet.amount <= 0) {
      throw new AppError(400, "bad_request", "Baccarat bet is invalid.");
    }
    grouped.set(bet.selection, (grouped.get(bet.selection) ?? 0) + bet.amount);
  }
  const bets = [...grouped].map(([selection, amount]) => ({ selection, amount }));
  if (!Number.isSafeInteger(bets.reduce((sum, bet) => sum + bet.amount, 0))) {
    throw new AppError(400, "bad_request", "Baccarat bet total is invalid.");
  }
  return bets;
}

function isKey(value: unknown): value is BaccaratBetKey {
  return value === "player" || value === "banker" || value === "tie" || value === "playerPair" || value === "bankerPair";
}

function payoutFor(bet: BaccaratBet, outcome: BaccaratRound["outcome"], playerPair: boolean, bankerPair: boolean): number {
  if (bet.selection === "player") return outcome === "player" ? bet.amount * 2 : outcome === "tie" ? bet.amount : 0;
  if (bet.selection === "banker") return outcome === "banker" ? Math.floor(bet.amount * 1.95) : outcome === "tie" ? bet.amount : 0;
  if (bet.selection === "tie") return outcome === "tie" ? bet.amount * 9 : 0;
  if (bet.selection === "playerPair") return playerPair ? bet.amount * 12 : 0;
  return bankerPair ? bet.amount * 12 : 0;
}

function value(card: BaccaratCard): number {
  return card.rank === "A" ? 1 : ["10", "J", "Q", "K"].includes(card.rank) ? 0 : Number(card.rank);
}

function total(cards: BaccaratCard[]): number { return cards.reduce((sum, card) => sum + value(card), 0) % 10; }

function bankerDraws(banker: BaccaratCard[], playerThird?: BaccaratCard): boolean {
  const bankerTotal = total(banker);
  if (!playerThird) return bankerTotal <= 5;
  const thirdValue = value(playerThird);
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return thirdValue !== 8;
  if (bankerTotal === 4) return thirdValue >= 2 && thirdValue <= 7;
  if (bankerTotal === 5) return thirdValue >= 4 && thirdValue <= 7;
  return bankerTotal === 6 && (thirdValue === 6 || thirdValue === 7);
}

function makeDeck(decks: number): BaccaratCard[] {
  const cards: BaccaratCard[] = [];
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of ["S", "H", "D", "C"] as const) {
      for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const) cards.push({ rank, suit });
    }
  }
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const next = randomInt(index + 1);
    [cards[index], cards[next]] = [cards[next]!, cards[index]!];
  }
  return cards;
}
