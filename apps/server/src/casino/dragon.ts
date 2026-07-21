import { randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { readJsonFileSync as readFileSync, writeJsonFile as writeFileSync } from "../storage/atomic-json.js";
import { dirname } from "node:path";
import type { DiscordUser } from "@iris/shared";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { reserveCasinoBet, settleCasinoReservation } from "../services/casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type DragonSelection = "dragon" | "tiger" | "tie" | "suited";
type Phase = "reserving" | "settling" | "settled";
export interface DragonCard { rank: "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K"; suit: "S" | "H" | "D" | "C"; }
export interface DragonRound { roundId: string; discordUserId: string; selection: DragonSelection; bet: number; dragon: DragonCard | null; tiger: DragonCard | null; outcome: "dragon" | "tiger" | "tie" | "suited" | null; payout: number | null; wallet: number | null; phase: Phase; }
export interface DragonRoundStore { load(): DragonRound[]; save(rounds: DragonRound[]): void; }
export class FileDragonRoundStore implements DragonRoundStore {
  constructor(private readonly filePath: string) {}
  load(): DragonRound[] { try { const value: unknown = JSON.parse(readFileSync(this.filePath, "utf8")); if (!Array.isArray(value)) throw new Error("Dragon state is invalid."); return value as DragonRound[]; } catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") return []; throw error; } }
  save(rounds: DragonRound[]): void { mkdirSync(dirname(this.filePath), { recursive: true }); writeFileSync(this.filePath, JSON.stringify(rounds), "utf8"); }
}
export class DragonService {
  private readonly rounds: Map<string, DragonRound>;
  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: DragonRoundStore; deck?: () => DragonCard[] }) { this.rounds = new Map(options.store.load().map((round) => [round.roundId, round])); }
  async reconcileAll(): Promise<void> { for (const round of this.rounds.values()) if (round.phase !== "settled") await this.resume(round); }
  async deal(user: DiscordUser, roundId: string, selection: DragonSelection, bet: number): Promise<DragonRound> {
    if (!/^[A-Za-z0-9:_.-]{1,128}$/.test(roundId) || !isSelection(selection) || ![100, 500, 1000, 2500, 5000].includes(bet)) throw new AppError(400, "bad_request", "Dragon round is invalid.");
    const existing = this.rounds.get(roundId);
    if (existing) { if (existing.discordUserId !== user.id || existing.selection !== selection || existing.bet !== bet) throw new AppError(409, "casino_transaction_conflict", "Dragon round does not match its original request."); await this.resume(existing); return existing; }
    const round: DragonRound = { roundId, discordUserId: user.id, selection, bet, dragon: null, tiger: null, outcome: null, payout: null, wallet: null, phase: "reserving" };
    this.rounds.set(roundId, round); this.save(); await this.resume(round); return round;
  }
  private async resume(round: DragonRound): Promise<void> {
    if (round.phase === "reserving") {
      const reservation = await reserveCasinoBet({ transactionId: `dragon-${round.roundId}`, discordUserId: round.discordUserId, sessionId: `dragon-${round.roundId}`, game: "dragon", bet: round.bet }, this.options.env, this.options.fetch);
      round.wallet = reservation.wallet;
      if (!round.outcome) this.resolve(round);
      round.phase = "settling"; this.save();
    }
    if (round.phase === "settling") { const settled = await settleCasinoReservation(`dragon-${round.roundId}`, { payout: round.payout ?? 0 }, this.options.env, this.options.fetch); round.wallet = settled.wallet; round.phase = "settled"; this.save(); }
  }
  private resolve(round: DragonRound): void {
    const deck = this.options.deck?.() ?? makeDeck(8); const dragon = deck.pop(), tiger = deck.pop();
    if (!dragon || !tiger) throw new AppError(500, "internal_error", "Dragon shoe is exhausted.");
    round.dragon = dragon; round.tiger = tiger;
    const tie = value(dragon) === value(tiger), suited = tie && dragon.suit === tiger.suit;
    round.outcome = suited ? "suited" : tie ? "tie" : value(dragon) > value(tiger) ? "dragon" : "tiger";
    const multiplier = round.selection === round.outcome ? round.outcome === "suited" ? 51 : round.outcome === "tie" ? 9 : 2 : 0;
    round.payout = round.bet * multiplier;
  }
  private save(): void { this.options.store.save([...this.rounds.values()]); }
}
function isSelection(value: string): value is DragonSelection { return value === "dragon" || value === "tiger" || value === "tie" || value === "suited"; }
function value(card: DragonCard): number { return ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].indexOf(card.rank); }
function makeDeck(decks: number): DragonCard[] { const cards: DragonCard[] = []; for (let deck = 0; deck < decks; deck += 1) for (const suit of ["S", "H", "D", "C"] as const) for (const rank of ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const) cards.push({ rank, suit }); for (let index = cards.length - 1; index > 0; index -= 1) { const next = randomInt(index + 1); [cards[index], cards[next]] = [cards[next]!, cards[index]!]; } return cards; }
