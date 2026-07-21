import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { pokerRounds } from "../storage/store-validators.js";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type PokerPhase = "reserving" | "holding" | "settling" | "settled";

export interface PokerCard {
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  suit: "S" | "H" | "D" | "C";
}

export interface PokerResult {
  id: "royal" | "straightFlush" | "four" | "fullHouse" | "flush" | "straight" | "three" | "twoPair" | "jacks" | "none";
  name: string;
  pay: number;
  rank: number;
}

export interface PokerRound {
  roundId: string;
  discordUserId: string;
  bet: number;
  deck: PokerCard[];
  cards: PokerCard[];
  held: boolean[] | null;
  result: PokerResult | null;
  payout: number | null;
  wallet: number | null;
  phase: PokerPhase;
}

export interface PokerRoundStore {
  load(): PokerRound[];
  save(rounds: PokerRound[]): void;
}

export class FilePokerRoundStore implements PokerRoundStore {
  constructor(private readonly filePath: string) {}

  load(): PokerRound[] {
    try {
      const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8", pokerRounds));
      if (!Array.isArray(value)) throw new Error("Poker state is invalid.");
      return value as PokerRound[];
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
  }

  save(rounds: PokerRound[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(rounds), "utf8", pokerRounds);
  }
}

export class PokerService {
  private readonly rounds: Map<string, PokerRound>;

  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: PokerRoundStore; deck?: () => PokerCard[] }) {
    this.rounds = new Map(options.store.load().map((round) => [round.roundId, round]));
  }

  async reconcileAll(): Promise<void> {
    for (const round of this.rounds.values()) if (round.phase === "reserving" || round.phase === "settling") await this.resume(round);
  }

  async deal(user: DiscordUser, roundId: string, bet: number): Promise<PokerRound> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(roundId) || ![100, 500, 1000, 2500, 5000].includes(bet)) {
      throw new AppError(400, "bad_request", "Poker round is invalid.");
    }
    const existing = this.rounds.get(roundId);
    if (existing) {
      if (existing.discordUserId !== user.id || existing.bet !== bet) throw new AppError(409, "casino_transaction_conflict", "Poker round does not match its original request.");
      await this.resume(existing);
      return existing;
    }

    const round: PokerRound = {
      roundId,
      discordUserId: user.id,
      bet,
      deck: this.options.deck?.() ?? makeDeck(),
      cards: [],
      held: null,
      result: null,
      payout: null,
      wallet: null,
      phase: "reserving"
    };
    this.rounds.set(roundId, round);
    this.save();
    await this.resume(round);
    return round;
  }

  async draw(user: DiscordUser, roundId: string, held: boolean[]): Promise<PokerRound> {
    const round = this.requireRound(user, roundId);
    if (!validHeld(held)) throw new AppError(400, "bad_request", "Poker holds are invalid.");
    if (round.phase === "holding") {
      round.held = [...held];
      for (let index = 0; index < 5; index += 1) if (!held[index]) round.cards[index] = draw(round);
      round.result = evaluate(round.cards);
      round.payout = round.bet * round.result.pay;
      round.phase = "settling";
      this.save();
    } else if (!round.held || JSON.stringify(round.held) !== JSON.stringify(held)) {
      throw new AppError(409, "casino_transaction_conflict", "Poker draw does not match its original request.");
    }
    await this.resume(round);
    return round;
  }

  private async resume(round: PokerRound): Promise<void> {
    if (round.phase === "reserving") {
      const reservation = await reserveCasinoBet({
        transactionId: `poker-${round.roundId}`,
        discordUserId: round.discordUserId,
        sessionId: `poker-${round.roundId}`,
        game: "poker",
        bet: round.bet
      }, this.options.env, this.options.fetch);
      round.wallet = reservation.wallet;
      while (round.cards.length < 5) round.cards.push(draw(round));
      round.phase = "holding";
      this.save();
    }
    if (round.phase === "settling") {
      const settlement = await settleCasinoReservation(`poker-${round.roundId}`, { payout: round.payout ?? 0 }, this.options.env, this.options.fetch);
      round.wallet = settlement.wallet;
      round.phase = "settled";
      this.save();
    }
  }

  private requireRound(user: DiscordUser, roundId: string): PokerRound {
    const round = this.rounds.get(roundId);
    if (!round || round.discordUserId !== user.id) throw new AppError(404, "casino_transaction_not_found", "Poker round was not found.");
    return round;
  }

  private save(): void { this.options.store.save([...this.rounds.values()]); }
}

const RESULTS: PokerResult[] = [
  { id: "royal", name: "ROYAL FLUSH", pay: 800, rank: 9 },
  { id: "straightFlush", name: "STRAIGHT FLUSH", pay: 50, rank: 8 },
  { id: "four", name: "FOUR OF A KIND", pay: 25, rank: 7 },
  { id: "fullHouse", name: "FULL HOUSE", pay: 9, rank: 6 },
  { id: "flush", name: "FLUSH", pay: 6, rank: 5 },
  { id: "straight", name: "STRAIGHT", pay: 4, rank: 4 },
  { id: "three", name: "THREE OF A KIND", pay: 3, rank: 3 },
  { id: "twoPair", name: "TWO PAIR", pay: 2, rank: 2 },
  { id: "jacks", name: "JACKS OR BETTER", pay: 1, rank: 1 },
  { id: "none", name: "NO WIN", pay: 0, rank: 0 }
];

function evaluate(cards: PokerCard[]): PokerResult {
  const values = cards.map((card) => card.rank === "A" ? 14 : rankValue(card.rank)).sort((left, right) => left - right);
  const suits = new Set(cards.map((card) => card.suit));
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const groups = [...counts.entries()].sort((left, right) => right[1] - left[1] || right[0] - left[0]);
  const unique = [...new Set(values)];
  const wheel = unique.join(",") === "2,3,4,5,14";
  const straight = unique.length === 5 && (unique[4]! - unique[0]! === 4 || wheel);
  const flush = suits.size === 1;
  let id: PokerResult["id"] = "none";
  if (flush && straight && unique.includes(10) && unique.includes(14)) id = "royal";
  else if (flush && straight) id = "straightFlush";
  else if (groups[0]![1] === 4) id = "four";
  else if (groups[0]![1] === 3 && groups[1]![1] === 2) id = "fullHouse";
  else if (flush) id = "flush";
  else if (straight) id = "straight";
  else if (groups[0]![1] === 3) id = "three";
  else if (groups[0]![1] === 2 && groups[1]![1] === 2) id = "twoPair";
  else if (groups[0]![1] === 2 && groups[0]![0] >= 11) id = "jacks";
  return RESULTS.find((result) => result.id === id)!;
}

function rankValue(rank: PokerCard["rank"]): number { return ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].indexOf(rank) + 1; }

function validHeld(value: unknown): value is boolean[] { return Array.isArray(value) && value.length === 5 && value.every((held) => typeof held === "boolean"); }

function draw(round: PokerRound): PokerCard {
  const card = round.deck.pop();
  if (!card) throw new AppError(500, "internal_error", "Poker deck is exhausted.");
  return card;
}

function makeDeck(): PokerCard[] {
  const cards: PokerCard[] = [];
  for (const suit of ["S", "H", "D", "C"] as const) {
    for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const) cards.push({ rank, suit });
  }
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const next = randomInt(index + 1);
    [cards[index], cards[next]] = [cards[next]!, cards[index]!];
  }
  return cards;
}
