import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type Phase = "reserving" | "player" | "settling" | "settled";
type HandStatus = "active" | "stand" | "bust";
export type BlackjackAction = "hit" | "stand" | "double" | "split";

export interface BlackjackCard {
  rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
  suit: "S" | "H" | "D" | "C";
}

interface Stake {
  transactionId: string;
  bet: number;
}

interface Hand {
  cards: BlackjackCard[];
  stakes: Stake[];
  status: HandStatus;
  split: boolean;
  result?: "BLACKJACK" | "WIN" | "PUSH" | "LOSE" | "BUST";
}

interface PendingStake {
  handIndex: number;
  stake: Stake;
}

interface Settlement {
  transactionId: string;
  payout: number;
}

export interface BlackjackRound {
  id: string;
  discordUserId: string;
  sessionId: string;
  phase: Phase;
  deck: BlackjackCard[];
  dealer: BlackjackCard[];
  hands: Hand[];
  activeHand: number;
  pendingStake?: PendingStake;
  settlements?: Settlement[];
  wallet?: number;
  lastActionId?: string;
  lastAction?: BlackjackAction;
  createdAt: number;
  updatedAt: number;
}

export interface BlackjackRoundStore {
  load(): BlackjackRound[];
  save(rounds: BlackjackRound[]): void;
}

export class FileBlackjackRoundStore implements BlackjackRoundStore {
  constructor(private readonly filePath: string) {}

  load(): BlackjackRound[] {
    try {
      const payload: unknown = JSON.parse(readFileSync(this.filePath, "utf8"));
      if (!Array.isArray(payload)) throw new Error("Blackjack state is not an array.");
      return payload as BlackjackRound[];
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  save(rounds: BlackjackRound[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(rounds), "utf8");
  }
}

export class BlackjackService {
  private readonly rounds: Map<string, BlackjackRound>;
  private readonly busyRounds = new Set<string>();

  constructor(
    private readonly options: {
      env: ServerEnv;
      fetch: FetchLike;
      store: BlackjackRoundStore;
      now?: () => number;
      shoe?: () => BlackjackCard[];
    }
  ) {
    this.rounds = new Map(options.store.load().map((round) => [round.id, round]));
  }

  async start(user: DiscordUser, id: string, bet: number): Promise<BlackjackRound> {
    if (!isId(id) || !Number.isSafeInteger(bet) || bet <= 0) {
      throw new AppError(400, "bad_request", "Blackjack bet is invalid.");
    }

    const existing = this.rounds.get(id);
    if (existing) {
      if (existing.discordUserId !== user.id || existing.hands[0]?.stakes[0]?.bet !== bet) {
        throw new AppError(409, "casino_transaction_conflict", "Blackjack round does not match its original request.");
      }
      await this.withLock(existing, async () => this.resume(existing));
      return existing;
    }

    const now = this.now();
    const sessionId = `blackjack-${id}`;
    const stake: Stake = { transactionId: `blackjack-${id}-0`, bet };
    const round: BlackjackRound = {
      id,
      discordUserId: user.id,
      sessionId,
      phase: "reserving",
      deck: this.shoe(),
      dealer: [],
      hands: [],
      activeHand: 0,
      createdAt: now,
      updatedAt: now
    };

    round.dealer = [draw(round), draw(round)];
    round.hands = [{
      cards: [draw(round), draw(round)],
      stakes: [stake],
      status: "active",
      split: false
    }];
    this.rounds.set(round.id, round);
    this.save();

    await this.resume(round);
    return round;
  }

  async get(user: DiscordUser, roundId: string): Promise<BlackjackRound> {
    const round = this.requireRound(user, roundId);
    await this.withLock(round, async () => this.resume(round));
    return round;
  }

  async act(user: DiscordUser, roundId: string, actionId: string, action: BlackjackAction): Promise<BlackjackRound> {
    if (!isId(actionId)) throw new AppError(400, "bad_request", "Blackjack action is invalid.");
    const round = this.requireRound(user, roundId);
    await this.withLock(round, async () => {
      await this.resume(round);
      if (round.lastActionId === actionId) {
        if (round.lastAction !== action) throw new AppError(409, "casino_transaction_conflict", "Blackjack action does not match its original request.");
        return;
      }
      if (round.phase !== "player") {
        throw new AppError(409, "casino_transaction_conflict", "Blackjack round is not accepting actions.");
      }

      const hand = round.hands[round.activeHand];
      if (!hand || hand.status !== "active") {
        throw new AppError(409, "casino_transaction_conflict", "Blackjack hand is not active.");
      }

      round.lastActionId = actionId;
      round.lastAction = action;

      if (action === "hit") {
        hand.cards.push(draw(round));
        if (handValue(hand.cards) > 21) hand.status = "bust";
        if (handValue(hand.cards) >= 21) await this.advance(round);
      } else if (action === "stand") {
        hand.status = "stand";
        await this.advance(round);
      } else if (action === "double") {
        if (hand.cards.length !== 2) {
          throw new AppError(409, "casino_transaction_conflict", "Blackjack hand cannot be doubled.");
        }
        await this.addStake(round, round.activeHand, hand.stakes[0]!.bet);
        hand.cards.push(draw(round));
        hand.status = handValue(hand.cards) > 21 ? "bust" : "stand";
        await this.advance(round);
      } else if (action === "split") {
        if (round.hands.length !== 1 || hand.cards.length !== 2 || hand.cards[0]!.rank !== hand.cards[1]!.rank) {
          throw new AppError(409, "casino_transaction_conflict", "Blackjack hand cannot be split.");
        }
        const [first, second] = hand.cards;
        const splitAces = first!.rank === "A";
        round.hands = [
          { cards: [first!, draw(round)], stakes: hand.stakes, status: splitAces ? "stand" : "active", split: true },
          { cards: [second!, draw(round)], stakes: [], status: splitAces ? "stand" : "active", split: true }
        ];
        round.activeHand = 0;
        await this.addStake(round, 1, hand.stakes[0]!.bet);
        if (splitAces) await this.advance(round);
      } else {
        throw new AppError(400, "bad_request", "Blackjack action is invalid.");
      }

      round.updatedAt = this.now();
      this.save();
    });
    return round;
  }

  publicState(round: BlackjackRound) {
    const revealDealer = round.phase === "settling" || round.phase === "settled";
    return {
      id: round.id,
      phase: round.phase,
      dealer: round.dealer.map((card, index) => (revealDealer || index === 0 ? card : null)),
      dealerValue: revealDealer ? handValue(round.dealer) : handValue(round.dealer.slice(0, 1)),
      hands: round.hands.map((hand) => ({
        cards: hand.cards,
        value: handValue(hand.cards),
        bet: hand.stakes.reduce((total, stake) => total + stake.bet, 0),
        status: hand.status,
        split: hand.split,
        result: hand.result ?? null
      })),
      activeHand: round.activeHand,
      payout: round.phase === "settled" ? (round.settlements ?? []).reduce((total, settlement) => total + settlement.payout, 0) : null,
      wallet: round.wallet ?? null
    };
  }

  private async resume(round: BlackjackRound): Promise<void> {
    if (round.phase === "reserving") {
      const firstStake = round.hands[0]?.stakes[0];
      if (!firstStake) throw new AppError(500, "internal_error", "Blackjack round is missing its first stake.");
      const reservation = await reserveCasinoBet({
        transactionId: firstStake.transactionId,
        discordUserId: round.discordUserId,
        sessionId: round.sessionId,
        game: "blackjack",
        bet: firstStake.bet
      }, this.options.env, this.options.fetch);
      round.wallet = reservation.wallet;
      round.phase = "player";
      round.updatedAt = this.now();
      this.save();
      if (isBlackjack(round.hands[0]!) || isBlackjack({ cards: round.dealer, split: false })) {
        await this.finish(round);
      }
    }

    if (round.pendingStake) {
      const pending = round.pendingStake;
      const reservation = await reserveCasinoBet({
        transactionId: pending.stake.transactionId,
        discordUserId: round.discordUserId,
        sessionId: round.sessionId,
        game: "blackjack",
        bet: pending.stake.bet
      }, this.options.env, this.options.fetch);
      round.hands[pending.handIndex]!.stakes.push(pending.stake);
      round.pendingStake = undefined;
      round.wallet = reservation.wallet;
      round.updatedAt = this.now();
      this.save();
    }

    if (round.phase === "settling") await this.settle(round);
  }

  private async addStake(round: BlackjackRound, handIndex: number, bet: number): Promise<void> {
    const transactionId = `blackjack-${round.id}-${round.hands.flatMap((hand) => hand.stakes).length}`;
    round.pendingStake = { handIndex, stake: { transactionId, bet } };
    round.updatedAt = this.now();
    this.save();
    await this.resume(round);
  }

  private async advance(round: BlackjackRound): Promise<void> {
    const nextIndex = round.hands.findIndex((hand, index) => index > round.activeHand && hand.status === "active");
    if (nextIndex >= 0) {
      round.activeHand = nextIndex;
      return;
    }
    await this.finish(round);
  }

  private async finish(round: BlackjackRound): Promise<void> {
    if (round.phase === "settled") return;
    round.phase = "settling";
    if (!round.hands.every((hand) => hand.status === "bust")) {
      while (handValue(round.dealer) < 17) round.dealer.push(draw(round));
    }

    const dealerValue = handValue(round.dealer);
    const dealerBlackjack = isBlackjack({ cards: round.dealer, split: false });
    round.settlements = [];
    for (const hand of round.hands) {
      const payoutMultiplier = resultMultiplier(hand, dealerValue, dealerBlackjack);
      hand.result = resultLabel(hand, payoutMultiplier);
      for (const stake of hand.stakes) {
        round.settlements.push({ transactionId: stake.transactionId, payout: Math.floor(stake.bet * payoutMultiplier) });
      }
    }
    round.updatedAt = this.now();
    this.save();
    await this.settle(round);
  }

  private async settle(round: BlackjackRound): Promise<void> {
    for (const settlement of round.settlements ?? []) {
      const result = await settleCasinoReservation(
        settlement.transactionId,
        { payout: settlement.payout },
        this.options.env,
        this.options.fetch
      );
      round.wallet = result.wallet;
    }
    round.phase = "settled";
    round.updatedAt = this.now();
    this.save();
  }

  private requireRound(user: DiscordUser, roundId: string): BlackjackRound {
    const round = this.rounds.get(roundId);
    if (!round || round.discordUserId !== user.id) {
      throw new AppError(404, "casino_transaction_not_found", "Blackjack round was not found.");
    }
    return round;
  }

  private async withLock(round: BlackjackRound, action: () => Promise<void>): Promise<void> {
    if (this.busyRounds.has(round.id)) {
      throw new AppError(409, "casino_transaction_conflict", "Blackjack round is processing an action.");
    }
    this.busyRounds.add(round.id);
    try { await action(); } finally { this.busyRounds.delete(round.id); }
  }

  private now(): number { return this.options.now?.() ?? Date.now(); }
  private shoe(): BlackjackCard[] { return this.options.shoe?.() ?? makeShoe(6); }
  private save(): void { this.options.store.save([...this.rounds.values()]); }
}

function makeShoe(decks: number): BlackjackCard[] {
  const cards: BlackjackCard[] = [];
  for (let deck = 0; deck < decks; deck += 1) {
    for (const suit of ["S", "H", "D", "C"] as const) {
      for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const) cards.push({ rank, suit });
    }
  }
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [cards[index], cards[swapIndex]] = [cards[swapIndex]!, cards[index]!];
  }
  return cards;
}

function isId(value: string): boolean {
  return /^[A-Za-z0-9:_.-]{1,128}$/.test(value);
}

function draw(round: BlackjackRound): BlackjackCard {
  const card = round.deck.pop();
  if (!card) throw new AppError(500, "internal_error", "Blackjack shoe is exhausted.");
  return card;
}

function handValue(cards: BlackjackCard[]): number {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    if (card.rank === "A") { total += 1; aces += 1; }
    else if (["J", "Q", "K"].includes(card.rank)) total += 10;
    else total += Number(card.rank);
  }
  while (aces > 0 && total + 10 <= 21) { total += 10; aces -= 1; }
  return total;
}

function isBlackjack(hand: Pick<Hand, "cards" | "split">): boolean {
  return hand.cards.length === 2 && !hand.split && handValue(hand.cards) === 21;
}

function resultMultiplier(hand: Hand, dealerValue: number, dealerBlackjack: boolean): number {
  const playerValue = handValue(hand.cards);
  if (playerValue > 21) return 0;
  if (isBlackjack(hand) && !dealerBlackjack) return 2.5;
  if (dealerBlackjack && !isBlackjack(hand)) return 0;
  if (dealerValue > 21 || playerValue > dealerValue) return 2;
  if (playerValue === dealerValue) return 1;
  return 0;
}

function resultLabel(hand: Hand, multiplier: number): Hand["result"] {
  if (handValue(hand.cards) > 21) return "BUST";
  if (multiplier === 2.5) return "BLACKJACK";
  if (multiplier === 2) return "WIN";
  if (multiplier === 1) return "PUSH";
  return "LOSE";
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
