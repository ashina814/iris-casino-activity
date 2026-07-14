import type { DiscordUser } from "@iris/shared";
import { randomInt } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { getWalletForDiscordUser } from "./wallet.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type ActivityProgress = {
  lastDaily: string;
  dailyStreak: number;
  reserve: number;
  notes: number;
  noteRemainder: number;
  reliefClaimed: boolean;
  missionDate: string;
  missions: MissionProgress[];
  missionRounds: string[];
  vaultPot: number;
  vaultCharge: number;
  vaultReady: boolean;
  vaultClaims: number;
  vaultOffer: number[] | null;
  nightEventActive: NightEventId | null;
  nightEventRemaining: number;
  nightEventNextIn: number;
  seals: number;
  purchases: Record<TreasuryItemId, number>;
  purchaseRequests: Record<string, { itemId: TreasuryItemId; pay: TreasuryPay }>;
  weeklyId: string;
  weekly: WeeklyProgress[];
  weeklyRounds: string[];
  mysteryOffer: MysteryOffer | null;
  seasonId: string;
  seasonXp: number;
  seasonClaimed: number[];
  circuitDay: string;
  circuitActive: boolean;
  circuitStage: number;
  circuitLives: number;
  circuitScore: number;
  circuitRoute: CircuitNode[];
  circuitClears: number;
  circuitBest: number;
  circuitClaimedDay: string;
  odysseyActive: boolean;
  odysseyRunId: string;
  odysseyFloor: number;
  odysseyLives: number;
  odysseyShields: number;
  odysseyScore: number;
  odysseyNodes: OdysseyNode[];
  odysseySelected: number | null;
  odysseyChoices: OdysseyBoon[];
  odysseyBoons: OdysseyBoon[];
  odysseyCompleted: number;
  odysseyFailed: number;
  odysseyBestFloor: number;
  odysseyBestScore: number;
  collectionMigrated: boolean;
  collectionOwned: string[];
  albumClaims: string[];
  collectionCapsules: number;
  collectionDust: number;
  collectionShards: number;
  collectionOpened: number;
  collectionDuplicates: number;
  sovereignMigrated: boolean;
  sovereignMarks: number;
  sovereignChests: number;
  sovereignRounds: Record<string, number>;
  artifactMigrated: boolean;
  artifactOwned: string[];
  artifactClaims: string[];
};

type MissionEvent = "round" | "win" | "wager" | "blackjack" | "rouletteStraight" | "freeSpins" | "slotCascade" | "pokerGood" | "baccaratRound" | "sicboRound" | "kenoFour";
type MissionProgress = { id: string; event: MissionEvent; target: number; reward: number; progress: number; claimed: boolean };
type WeeklyEvent = "round" | "win" | "wager" | "variety";
type WeeklyProgress = { id: string; event: WeeklyEvent; target: number; reward: number; progress: number; claimed: boolean; games: string[] };
type MysteryReward = { type: "coins" | "dust" | "capsule" | "tokens"; amount: number };
type MysteryOffer = { id: string; rewards: MysteryReward[]; claimed: boolean };
type SeasonReward = { type: "coins" | "dust" | "tokens" | "shards" | "capsule"; amount: number };
type CircuitNode = { game: string; type: "play" | "win" | "return"; target: number };
type OdysseyNode = { game: string; type: "play" | "win" | "wager"; target: number; boss: boolean };
type OdysseyBoon = "life" | "coins" | "key" | "shield" | "fame" | "score";
type NightEventId = "stardust" | "vault" | "echo" | "crown";
export type TrustedMissionRound = { id: string; game?: string; wager: number; payout: number; events?: Partial<Record<MissionEvent, number>> };

type ActivityProgressState = {
  users: Record<string, ActivityProgress>;
};

type TreasuryItemId = "stardust" | "capsule" | "key" | "seal";
type TreasuryPay = "coins" | "notes";

const treasuryItemIds = ["stardust", "capsule", "key", "seal"] as const satisfies readonly TreasuryItemId[];
const missionPool: Omit<MissionProgress, "progress" | "claimed">[] = [
  { id: "rounds", event: "round", target: 5, reward: 600 }, { id: "wins", event: "win", target: 3, reward: 900 }, { id: "wager", event: "wager", target: 10000, reward: 750 },
  { id: "blackjack", event: "blackjack", target: 1, reward: 1200 }, { id: "roulette", event: "rouletteStraight", target: 1, reward: 1400 }, { id: "free", event: "freeSpins", target: 1, reward: 1200 },
  { id: "cascade", event: "slotCascade", target: 3, reward: 1000 }, { id: "poker", event: "pokerGood", target: 1, reward: 900 }, { id: "baccarat", event: "baccaratRound", target: 3, reward: 650 },
  { id: "sicbo", event: "sicboRound", target: 3, reward: 700 }, { id: "keno", event: "kenoFour", target: 1, reward: 1000 }
];
const nightEventRounds: Record<NightEventId, number> = { stardust: 4, vault: 4, echo: 3, crown: 4 };
const nightEventIds = Object.keys(nightEventRounds) as NightEventId[];
const weeklyPool: Omit<WeeklyProgress, "progress" | "claimed" | "games">[] = [
  { id: "rounds", event: "round", target: 50, reward: 2500 },
  { id: "wins", event: "win", target: 15, reward: 3000 },
  { id: "wager", event: "wager", target: 250000, reward: 3500 },
  { id: "variety", event: "variety", target: 10, reward: 3000 }
];
const circuitGames = ["blackjack", "roulette", "slots", "baccarat", "poker", "sicbo", "keno", "craps", "dragon", "wheel", "mines", "plinko", "hilo", "holdem", "war", "bingo", "tower", "scratch", "threecard", "derby", "ascent", "arcana", "moonshot"];
const odysseyGames = ["blackjack", "roulette", "slots", "baccarat", "poker", "sicbo", "keno", "craps", "dragon", "wheel", "mines", "plinko", "hilo", "holdem", "war", "bingo", "tower", "scratch"];
const odysseyBoons: OdysseyBoon[] = ["life", "coins", "key", "shield", "fame", "score"];
const collectionSeries = ["nocturne", "aurora", "crimson", "celestial", "obsidian", "eclipse", "lunar", "infernal", "verdant", "royal", "void", "solar"];
const collectionTypes = ["avatar", "frame", "chip", "back", "aura", "emote"];
const collectionItemIds = collectionSeries.flatMap((series) => collectionTypes.map((type) => `${series}_${type}`));
type CollectionRarity = "common" | "rare" | "epic" | "legendary" | "mythic";
const collectionDuplicateShards: Record<CollectionRarity, number> = { common: 8, rare: 18, epic: 45, legendary: 100, mythic: 280 };
const artifactSets = ["eclipse", "seraph", "dragon", "oracle", "obsidian", "velvet", "cosmos", "jester"];
const artifactItemIds = artifactSets.flatMap((set) => Array.from({ length: 6 }, (_, index) => `${set}-${index}`));

const adjustmentResponseSchema = z.object({
  ok: z.literal(true),
  wallet: z.number().int().nonnegative(),
  currency: z.literal("Ris").default("Ris")
});

export interface ActivityProgressStore {
  load(): ActivityProgressState;
  save(state: ActivityProgressState): void;
}

export class FileActivityProgressStore implements ActivityProgressStore {
  constructor(private readonly path: string) {}

  load(): ActivityProgressState {
    try {
      const value: unknown = JSON.parse(readFileSync(this.path, "utf8"));
      return normalizeState(value);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return { users: {} };
      throw error;
    }
  }

  save(state: ActivityProgressState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(state), "utf8");
  }
}

export class ActivityEconomyService {
  private readonly state: ActivityProgressState;

  constructor(private readonly options: { env: ServerEnv; fetch: FetchLike; store: ActivityProgressStore }) {
    this.state = normalizeState(options.store.load());
  }

  async dailyStatus(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    const date = jstDateKey();
    return {
      date,
      claimed: progress.lastDaily === date,
      streak: progress.dailyStreak,
      reserve: progress.reserve,
      notes: progress.notes,
      wallet: wallet.wallet,
      currency: wallet.currency
    };
  }

  async treasuryStatus(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return this.publicTreasury(progress, wallet.wallet, wallet.currency);
  }

  async claimRelief(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    if (progress.reliefClaimed || wallet.wallet >= 100) {
      return { claimed: false, amount: 0, wallet: wallet.wallet, currency: wallet.currency };
    }

    const amount = 2500 - wallet.wallet;
    const result = await requestActivityAdjustment({
      transactionId: `activity-relief-${user.id}`,
      discordUserId: user.id,
      sessionId: "relief",
      operation: "credit",
      amount,
      reason: "relief"
    }, this.options.env, this.options.fetch);

    this.state.users[user.id] = { ...progress, reliefClaimed: true };
    this.options.store.save(this.state);
    return { claimed: true, amount, wallet: result.wallet, currency: result.currency };
  }

  async missionStatus(user: DiscordUser) {
    const progress = this.ensureMissionDay(user.id, this.progressFor(user.id));
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { date: progress.missionDate, items: progress.missions, wallet: wallet.wallet, currency: wallet.currency };
  }

  async weeklyStatus(user: DiscordUser) {
    const progress = this.ensureWeekly(user.id, this.progressFor(user.id));
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { week: progress.weeklyId, items: progress.weekly, wallet: wallet.wallet, currency: wallet.currency };
  }

  async mysteryStatus(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { offer: progress.mysteryOffer, wallet: wallet.wallet, currency: wallet.currency };
  }

  async seasonStatus(user: DiscordUser) {
    const progress = this.ensureSeason(user.id, this.progressFor(user.id));
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { id: progress.seasonId, xp: progress.seasonXp, tier: seasonTier(progress.seasonXp), claimed: progress.seasonClaimed, wallet: wallet.wallet, currency: wallet.currency };
  }

  async claimSeason(user: DiscordUser, tier: number) {
    const progress = this.ensureSeason(user.id, this.progressFor(user.id));
    if (!Number.isInteger(tier) || tier < 1 || tier > 40 || tier > seasonTier(progress.seasonXp)) throw new AppError(409, "casino_transaction_conflict", "Season reward is unavailable.");
    const reward = seasonReward(tier);
    if (progress.seasonClaimed.includes(tier)) return { tier, reward, alreadyClaimed: true, wallet: (await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch)).wallet, currency: "Ris" };
    const result = reward.type === "coins"
      ? await requestActivityAdjustment({ transactionId: `activity-season-${user.id}-${progress.seasonId}-${tier}`, discordUserId: user.id, sessionId: `season-${progress.seasonId}-${tier}`, operation: "credit", amount: reward.amount, reason: "season" }, this.options.env, this.options.fetch)
      : await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    const next = {
      ...progress,
      seasonClaimed: [...progress.seasonClaimed, tier],
      collectionCapsules: reward.type === "capsule" ? progress.collectionCapsules + reward.amount : progress.collectionCapsules
    };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return { tier, reward, alreadyClaimed: false, wallet: result.wallet, currency: result.currency };
  }

  async circuitStatus(user: DiscordUser) {
    const progress = this.ensureCircuit(user.id, this.progressFor(user.id));
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { ...this.publicCircuit(progress), wallet: wallet.wallet, currency: wallet.currency };
  }

  async startCircuit(user: DiscordUser) {
    const progress = this.ensureCircuit(user.id, this.progressFor(user.id));
    if (progress.circuitActive) return this.circuitStatus(user);
    const next = { ...progress, circuitActive: true, circuitStage: 0, circuitLives: 3, circuitScore: 0 };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { ...this.publicCircuit(next), wallet: wallet.wallet, currency: wallet.currency };
  }

  async odysseyStatus(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { ...this.publicOdyssey(progress), wallet: wallet.wallet, currency: wallet.currency };
  }

  async startOdyssey(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    if (progress.odysseyActive) return this.odysseyStatus(user);
    const next = this.prepareOdysseyNodes({ ...progress, odysseyActive: true, odysseyRunId: `ody-${Date.now()}-${randomInt(1_000_000)}`, odysseyFloor: 1, odysseyLives: 3, odysseyShields: 0, odysseyScore: 0, odysseySelected: null, odysseyChoices: [], odysseyBoons: [] });
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { ...this.publicOdyssey(next), wallet: wallet.wallet, currency: wallet.currency };
  }

  async selectOdysseyNode(user: DiscordUser, index: number) {
    const progress = this.progressFor(user.id);
    if (!progress.odysseyActive || progress.odysseyChoices.length || !Number.isInteger(index) || index < 0 || index >= progress.odysseyNodes.length) throw new AppError(409, "casino_transaction_conflict", "Odyssey route is unavailable.");
    const next = { ...progress, odysseySelected: index };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return this.publicOdyssey(next);
  }

  async chooseOdysseyBoon(user: DiscordUser, boon: OdysseyBoon) {
    const progress = this.progressFor(user.id);
    if (!progress.odysseyActive || !progress.odysseyChoices.includes(boon)) throw new AppError(409, "casino_transaction_conflict", "Odyssey boon is unavailable.");
    let next: ActivityProgress = { ...progress, odysseyChoices: [], odysseyBoons: [...progress.odysseyBoons, boon] };
    let wallet: number | null = null;
    let currency = "Ris";
    if (boon === "life") next = { ...next, odysseyLives: Math.min(5, next.odysseyLives + 1) };
    if (boon === "shield") next = { ...next, odysseyShields: next.odysseyShields + 1 };
    if (boon === "score") next = { ...next, odysseyScore: Math.floor(next.odysseyScore * 1.25 + 300) };
    if (boon === "coins") {
      const result = await requestActivityAdjustment({ transactionId: `activity-odyssey-boon-${user.id}-${next.odysseyRunId}-${next.odysseyBoons.length}`, discordUserId: user.id, sessionId: `odyssey-${next.odysseyRunId}-boon-${next.odysseyBoons.length}`, operation: "credit", amount: 1_500, reason: "odyssey" }, this.options.env, this.options.fetch);
      wallet = result.wallet;
      currency = result.currency;
    }
    if (next.odysseyFloor >= 12) {
      const amount = Math.min(12_000, Math.floor(4_000 + next.odysseyScore * 2));
      const result = await requestActivityAdjustment({ transactionId: `activity-odyssey-complete-${user.id}-${next.odysseyRunId}`, discordUserId: user.id, sessionId: `odyssey-${next.odysseyRunId}-complete`, operation: "credit", amount, reason: "odyssey" }, this.options.env, this.options.fetch);
      wallet = result.wallet;
      currency = result.currency;
      next = { ...next, odysseyActive: false, odysseyCompleted: next.odysseyCompleted + 1, odysseyBestScore: Math.max(next.odysseyBestScore, next.odysseyScore) };
    } else {
      next = this.prepareOdysseyNodes({ ...next, odysseyFloor: next.odysseyFloor + 1, odysseySelected: null });
    }
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    if (wallet === null) {
      const current = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
      wallet = current.wallet;
      currency = current.currency;
    }
    return { ...this.publicOdyssey(next), boon, wallet, currency };
  }

  abandonOdyssey(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    if (!progress.odysseyActive) return this.publicOdyssey(progress);
    const next = { ...progress, odysseyActive: false, odysseySelected: null, odysseyChoices: [], odysseyFailed: progress.odysseyFailed + 1, odysseyBestScore: Math.max(progress.odysseyBestScore, progress.odysseyScore) };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return this.publicOdyssey(next);
  }

  async albumStatus(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { ...this.publicCollection(progress), wallet: wallet.wallet, currency: wallet.currency };
  }

  async migrateAlbumCollection(user: DiscordUser, owned: string[], resources: { capsules: number; dust: number; shards: number; opened: number; duplicates: number }) {
    const progress = this.progressFor(user.id);
    if (progress.collectionMigrated) return this.albumStatus(user);
    const collectionOwned = [...new Set(owned.filter((id) => collectionItemIds.includes(id)))];
    const next = {
      ...progress,
      collectionMigrated: true,
      collectionOwned,
      collectionCapsules: resources.capsules,
      collectionDust: resources.dust,
      collectionShards: resources.shards,
      collectionOpened: resources.opened,
      collectionDuplicates: resources.duplicates
    };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { ...this.publicCollection(next), wallet: wallet.wallet, currency: wallet.currency };
  }

  async openCollectionCapsule(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    if (!progress.collectionMigrated) throw new AppError(409, "casino_transaction_conflict", "Collection migration is unavailable.");
    if (progress.collectionCapsules <= 0 && progress.collectionDust < 300) throw new AppError(409, "insufficient_funds", "Insufficient Star Dust.");
    const rarity = rollCollectionRarity();
    const candidates = collectionItemIds.filter((id) => collectionRarity(id) === rarity);
    const unseen = candidates.filter((id) => !progress.collectionOwned.includes(id));
    const itemId = (unseen.length ? unseen : candidates)[randomInt((unseen.length ? unseen : candidates).length)]!;
    const duplicate = progress.collectionOwned.includes(itemId);
    const shards = duplicate ? collectionDuplicateShards[rarity] : 0;
    const next = {
      ...progress,
      collectionCapsules: progress.collectionCapsules > 0 ? progress.collectionCapsules - 1 : 0,
      collectionDust: progress.collectionCapsules > 0 ? progress.collectionDust : progress.collectionDust - 300,
      collectionShards: progress.collectionShards + shards,
      collectionOpened: progress.collectionOpened + 1,
      collectionDuplicates: progress.collectionDuplicates + (duplicate ? 1 : 0),
      collectionOwned: duplicate ? progress.collectionOwned : [...progress.collectionOwned, itemId]
    };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return { collection: this.publicCollection(next), item: collectionItem(itemId), duplicate, shards };
  }

  async craftCollectionLegendary(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    if (!progress.collectionMigrated) throw new AppError(409, "casino_transaction_conflict", "Collection migration is unavailable.");
    if (progress.collectionShards < 500) throw new AppError(409, "insufficient_funds", "Insufficient Crown Shards.");
    const candidates = collectionItemIds.filter((id) => (collectionRarity(id) === "legendary" || collectionRarity(id) === "mythic") && !progress.collectionOwned.includes(id));
    if (!candidates.length) throw new AppError(409, "casino_transaction_conflict", "All legendary collection items are owned.");
    const itemId = candidates[randomInt(candidates.length)]!;
    const next = { ...progress, collectionShards: progress.collectionShards - 500, collectionOwned: [...progress.collectionOwned, itemId] };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return { collection: this.publicCollection(next), item: collectionItem(itemId) };
  }

  async claimAlbum(user: DiscordUser, series: string) {
    const progress = this.progressFor(user.id);
    if (!progress.collectionMigrated || !collectionSeries.includes(series) || progress.albumClaims.includes(series)) throw new AppError(409, "casino_transaction_conflict", "Album reward is unavailable.");
    const required = collectionTypes.map((type) => `${series}_${type}`);
    if (!required.every((id) => progress.collectionOwned.includes(id))) throw new AppError(409, "casino_transaction_conflict", "Album is incomplete.");
    const result = await requestActivityAdjustment({ transactionId: `activity-album-${user.id}-${series}`, discordUserId: user.id, sessionId: `album-${series}`, operation: "credit", amount: 3_000, reason: "album" }, this.options.env, this.options.fetch);
    const next = { ...progress, albumClaims: [...progress.albumClaims, series], collectionDust: progress.collectionDust + 400, collectionShards: progress.collectionShards + 150 };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return { series, amount: 3_000, dust: 400, shards: 150, collection: this.publicCollection(next), wallet: result.wallet, currency: result.currency };
  }

  async sovereignStatus(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { migrated: progress.sovereignMigrated, marks: progress.sovereignMarks, chests: progress.sovereignChests, wallet: wallet.wallet, currency: wallet.currency };
  }

  async migrateSovereign(user: DiscordUser, marks: number, chests: number) {
    const progress = this.progressFor(user.id);
    if (progress.sovereignMigrated) return this.sovereignStatus(user);
    const next = { ...progress, sovereignMigrated: true, sovereignMarks: Math.min(9_999, Math.max(0, Math.floor(marks))), sovereignChests: Math.max(0, Math.floor(chests)) };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { migrated: true, marks: next.sovereignMarks, chests: next.sovereignChests, wallet: wallet.wallet, currency: wallet.currency };
  }

  async openSovereignChest(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    if (!progress.sovereignMigrated || progress.sovereignMarks < 150) throw new AppError(409, "casino_transaction_conflict", "Sovereign Chest is unavailable.");
    const chests = progress.sovereignChests + 1;
    const amount = [2_000, 3_000, 4_000, 6_000, 10_000][randomInt(5)]!;
    const result = await requestActivityAdjustment({ transactionId: `activity-chest-${user.id}-${chests}`, discordUserId: user.id, sessionId: `chest-${chests}`, operation: "credit", amount, reason: "chest" }, this.options.env, this.options.fetch);
    const next = { ...progress, sovereignMarks: progress.sovereignMarks - 150, sovereignChests: chests };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return { amount, marks: next.sovereignMarks, chests, wallet: result.wallet, currency: result.currency };
  }

  async artifactStatus(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { migrated: progress.artifactMigrated, owned: progress.artifactOwned, claimed: progress.artifactClaims, wallet: wallet.wallet, currency: wallet.currency };
  }

  async migrateArtifacts(user: DiscordUser, owned: string[]) {
    const progress = this.progressFor(user.id);
    if (progress.artifactMigrated) return this.artifactStatus(user);
    const artifactOwned = [...new Set(owned.filter((id) => artifactItemIds.includes(id)))];
    const next = { ...progress, artifactMigrated: true, artifactOwned };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return { migrated: true, owned: next.artifactOwned, claimed: next.artifactClaims, wallet: wallet.wallet, currency: wallet.currency };
  }

  async claimArtifactSet(user: DiscordUser, set: string) {
    const progress = this.progressFor(user.id);
    if (!progress.artifactMigrated || !artifactSets.includes(set) || progress.artifactClaims.includes(set)) throw new AppError(409, "casino_transaction_conflict", "Artifact reward is unavailable.");
    if (!Array.from({ length: 6 }, (_, index) => `${set}-${index}`).every((id) => progress.artifactOwned.includes(id))) throw new AppError(409, "casino_transaction_conflict", "Artifact set is incomplete.");
    const result = await requestActivityAdjustment({ transactionId: `activity-artifact-${user.id}-${set}`, discordUserId: user.id, sessionId: `artifact-${set}`, operation: "credit", amount: 4_000, reason: "collection" }, this.options.env, this.options.fetch);
    const next = { ...progress, artifactClaims: [...progress.artifactClaims, set] };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return { set, amount: 4_000, keys: 2, wallet: result.wallet, currency: result.currency };
  }

  async claimMystery(user: DiscordUser, offerId: string, index: number) {
    let progress = this.progressFor(user.id); const offer = progress.mysteryOffer;
    if (!offer || offer.id !== offerId || offer.claimed || !Number.isInteger(index) || index < 0 || index >= offer.rewards.length) throw new AppError(409, "casino_transaction_conflict", "Mystery reward is unavailable.");
    const reward = offer.rewards[index]!;
    const result = reward.type === "coins" ? await requestActivityAdjustment({ transactionId: `activity-mystery-${user.id}-${offer.id}`, discordUserId: user.id, sessionId: `mystery-${offer.id}`, operation: "credit", amount: reward.amount, reason: "mystery" }, this.options.env, this.options.fetch) : await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    progress = { ...progress, mysteryOffer: { ...offer, claimed: true }, collectionCapsules: reward.type === "capsule" ? progress.collectionCapsules + reward.amount : progress.collectionCapsules };
    this.state.users[user.id] = progress; this.options.store.save(this.state);
    return { reward, wallet: result.wallet, currency: result.currency };
  }

  async claimWeekly(user: DiscordUser, id: string) {
    const progress = this.ensureWeekly(user.id, this.progressFor(user.id));
    const item = progress.weekly.find((entry) => entry.id === id);
    if (!item || item.progress < item.target) throw new AppError(409, "casino_transaction_conflict", "Weekly contract is incomplete.");
    if (item.claimed) return { id, amount: 0, wallet: (await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch)).wallet, currency: "Ris", alreadyClaimed: true };
    const result = await requestActivityAdjustment({ transactionId: `activity-weekly-${user.id}-${progress.weeklyId}-${id}`, discordUserId: user.id, sessionId: `weekly-${progress.weeklyId}-${id}`, operation: "credit", amount: item.reward, reason: "weekly" }, this.options.env, this.options.fetch);
    item.claimed = true;
    this.state.users[user.id] = progress;
    this.options.store.save(this.state);
    return { id, amount: item.reward, wallet: result.wallet, currency: result.currency, alreadyClaimed: false };
  }

  async vaultStatus(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return this.publicVault(progress, wallet.wallet, wallet.currency);
  }

  async nightEventStatus(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    return this.publicNightEvent(progress, wallet.wallet, wallet.currency);
  }

  async claimVault(user: DiscordUser, chestIndex: number) {
    let progress = this.progressFor(user.id);
    if (!progress.vaultReady || progress.vaultPot < 100) {
      throw new AppError(409, "casino_transaction_conflict", "Eclipse Vault is not ready.");
    }

    const offer = progress.vaultOffer ?? vaultOffer();
    if (!progress.vaultOffer) {
      progress = { ...progress, vaultOffer: offer };
      this.state.users[user.id] = progress;
      this.options.store.save(this.state);
    }
    const multiplier = offer[chestIndex];
    if (multiplier === undefined) throw new AppError(400, "bad_request", "Vault chest is invalid.");

    const claimNumber = progress.vaultClaims + 1;
    const amount = Math.min(progress.vaultPot, Math.max(100, Math.floor(progress.vaultPot * multiplier)));
    const result = await requestActivityAdjustment({
      transactionId: `activity-vault-${user.id}-${claimNumber}`,
      discordUserId: user.id,
      sessionId: `vault-${claimNumber}`,
      operation: "credit",
      amount,
      reason: "vault"
    }, this.options.env, this.options.fetch);
    const next = {
      ...progress,
      vaultPot: Math.max(0, progress.vaultPot - amount),
      vaultCharge: 0,
      vaultReady: false,
      vaultClaims: claimNumber,
      vaultOffer: null
    };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return { chestIndex, multiplier, amount, ...this.publicVault(next, result.wallet, result.currency) };
  }

  async claimPartyCrown(user: DiscordUser, crownId: string) {
    const result = await requestActivityAdjustment({
      transactionId: `activity-party-${user.id}-${crownId}`,
      discordUserId: user.id,
      sessionId: `party-${crownId}`,
      operation: "credit",
      amount: 500,
      reason: "party"
    }, this.options.env, this.options.fetch);
    return { amount: 500, wallet: result.wallet, currency: result.currency };
  }

  async claimRaid(user: DiscordUser, raidId: string) {
    const result = await requestActivityAdjustment({
      transactionId: `activity-raid-${user.id}-${raidId}`,
      discordUserId: user.id,
      sessionId: `raid-${raidId}`,
      operation: "credit",
      amount: 3_000,
      reason: "raid"
    }, this.options.env, this.options.fetch);
    return { amount: 3_000, wallet: result.wallet, currency: result.currency };
  }

  async claimDuel(user: DiscordUser, duelId: string, amount: number) {
    if (amount <= 0) return { amount: 0, wallet: null, currency: "Ris" };
    const result = await requestActivityAdjustment({ transactionId: `activity-pvp-${user.id}-${duelId}`, discordUserId: user.id, sessionId: `pvp-${duelId}`, operation: "credit", amount, reason: "pvp" }, this.options.env, this.options.fetch);
    return { amount, wallet: result.wallet, currency: result.currency };
  }

  awardDuelSeason(user: DiscordUser, result: "win" | "loss" | "tie") {
    let progress = this.ensureSeason(user.id, this.progressFor(user.id));
    const gain = result === "win" ? 180 : 80;
    progress = { ...progress, seasonXp: Math.min(9_999, progress.seasonXp + gain) };
    this.state.users[user.id] = progress;
    this.options.store.save(this.state);
    return { id: progress.seasonId, xp: progress.seasonXp, tier: seasonTier(progress.seasonXp), claimed: progress.seasonClaimed };
  }

  async recordMissionRound(user: DiscordUser, round: TrustedMissionRound) {
    let progress = this.ensureMissionDay(user.id, this.progressFor(user.id));
    if (progress.missionRounds.includes(round.id)) {
      const status = await this.missionStatus(user);
      return { ...status, awarded: [] };
    }
    const events: Partial<Record<MissionEvent, number>> = { round: 1, wager: round.wager, ...round.events };
    if (round.payout > round.wager) events.win = (events.win ?? 0) + 1;
    const items = progress.missions.map((mission) => {
      const amount = Math.max(0, Math.floor(events[mission.event] ?? 0));
      const nextProgress = mission.claimed ? mission.progress : Math.min(mission.target, mission.progress + amount);
      return { ...mission, progress: nextProgress, claimed: mission.claimed || nextProgress >= mission.target };
    });
    const newlyClaimed = items.filter((item, index) => item.claimed && !progress.missions[index]!.claimed);
    let wallet: number | null = null;
    let currency = "Ris";
    for (const mission of newlyClaimed) {
      const result = await requestActivityAdjustment({ transactionId: `activity-mission-${user.id}-${progress.missionDate}-${mission.id}`, discordUserId: user.id, sessionId: `mission-${progress.missionDate}-${mission.id}`, operation: "credit", amount: mission.reward, reason: "mission" }, this.options.env, this.options.fetch);
      wallet = result.wallet;
      currency = result.currency;
    }
    const nightEvent = this.advanceNightEvent(progress, round);
    if (nightEvent.bonus > 0) {
      const result = await requestActivityAdjustment({
        transactionId: `activity-event-${user.id}-${round.id}`,
        discordUserId: user.id,
        sessionId: `event-${round.id}`,
        operation: "credit",
        amount: nightEvent.bonus,
        reason: "event"
      }, this.options.env, this.options.fetch);
      wallet = result.wallet;
      currency = result.currency;
    }
    progress = this.advanceVault(nightEvent.progress, round, nightEvent.active === "vault");
    progress = this.advanceWeekly(user.id, progress, round);
    progress = this.advanceMystery(progress);
    progress = this.advanceSeason(user.id, progress, round);
    const circuit = await this.advanceCircuit(user, progress, round);
    progress = circuit.progress;
    if (circuit.wallet !== null) {
      wallet = circuit.wallet;
      currency = circuit.currency;
    }
    progress = this.advanceOdyssey(progress, round);
    progress = this.advanceSovereign(progress, round);
    progress = this.advanceCollection(progress, round);
    progress = { ...progress, missions: items, missionRounds: [...progress.missionRounds, round.id].slice(-500) };
    this.state.users[user.id] = progress;
    this.options.store.save(this.state);
    if (wallet === null) {
      const current = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
      wallet = current.wallet;
      currency = current.currency;
    }
    return { date: progress.missionDate, items, awarded: newlyClaimed.map((item) => ({ id: item.id, amount: item.reward })), collection: this.publicCollection(progress), wallet, currency };
  }

  async purchaseTreasury(user: DiscordUser, purchaseId: string, itemId: TreasuryItemId, pay: TreasuryPay) {
    const progress = this.progressFor(user.id);
    const existing = progress.purchaseRequests[purchaseId];
    if (existing && (existing.itemId !== itemId || existing.pay !== pay)) {
      throw new AppError(409, "casino_transaction_conflict", "Treasury purchase id conflicts with an existing purchase.");
    }
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    if (existing) {
      return { purchaseId, itemId, pay, ...this.publicTreasury(progress, wallet.wallet, wallet.currency) };
    }

    const item = treasuryCatalog(progress.seals).find((entry) => entry.id === itemId);
    if (!item) throw new AppError(400, "bad_request", "Treasury item is invalid.");
    let nextWallet = wallet.wallet;
    if (pay === "notes") {
      if (progress.notes < item.notes) throw new AppError(409, "insufficient_funds", "Insufficient Crown Notes.");
    } else {
      const result = await requestActivityAdjustment({
        transactionId: `activity-treasury-${user.id}-${purchaseId}`,
        discordUserId: user.id,
        sessionId: `treasury-${purchaseId}`,
        operation: "debit",
        amount: item.coins,
        reason: "treasury"
      }, this.options.env, this.options.fetch);
      nextWallet = result.wallet;
    }

    const next: ActivityProgress = {
      ...progress,
      notes: pay === "notes" ? progress.notes - item.notes : progress.notes,
      seals: itemId === "seal" ? progress.seals + 1 : progress.seals,
      collectionCapsules: itemId === "capsule" ? progress.collectionCapsules + 1 : progress.collectionCapsules,
      collectionDust: itemId === "stardust" ? progress.collectionDust + 250 : progress.collectionDust,
      purchases: { ...progress.purchases, [itemId]: progress.purchases[itemId] + 1 },
      purchaseRequests: { ...progress.purchaseRequests, [purchaseId]: { itemId, pay } }
    };
    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return { purchaseId, itemId, pay, ...this.publicTreasury(next, nextWallet, wallet.currency) };
  }

  async claimDaily(user: DiscordUser) {
    const progress = this.progressFor(user.id);
    const wallet = await getWalletForDiscordUser(user.id, this.options.env, this.options.fetch);
    const date = jstDateKey();
    if (progress.lastDaily === date) {
      return {
        date,
        claimed: false,
        amount: 0,
        requested: 0,
        notesAwarded: 0,
        streak: progress.dailyStreak,
        reserve: progress.reserve,
        notes: progress.notes,
        wallet: wallet.wallet,
        currency: wallet.currency
      };
    }

    const requested = dailyGiftAmount(wallet.wallet, progress.dailyStreak);
    const amount = Math.min(requested, progress.reserve);
    const remainder = requested - amount;
    const nextNoteRemainder = progress.noteRemainder + remainder;
    const notesAwarded = Math.floor(nextNoteRemainder / 100);
    const next: ActivityProgress = {
      ...progress,
      lastDaily: date,
      dailyStreak: progress.dailyStreak + 1,
      reserve: progress.reserve - amount,
      notes: progress.notes + notesAwarded,
      noteRemainder: nextNoteRemainder - notesAwarded * 100
    };
    const result = amount > 0
      ? await requestActivityAdjustment({
        transactionId: `activity-daily-${user.id}-${date}`,
        discordUserId: user.id,
        sessionId: `daily-${date}`,
        operation: "credit",
        amount,
        reason: "daily"
      }, this.options.env, this.options.fetch)
      : { wallet: wallet.wallet, currency: wallet.currency };

    this.state.users[user.id] = next;
    this.options.store.save(this.state);
    return {
      date,
      claimed: true,
      amount,
      requested,
      notesAwarded,
      streak: next.dailyStreak,
      reserve: next.reserve,
      notes: next.notes,
      wallet: result.wallet,
      currency: result.currency
    };
  }

  private progressFor(discordUserId: string): ActivityProgress {
    const current = this.state.users[discordUserId];
    return current ?? initialProgress();
  }

  private ensureMissionDay(discordUserId: string, progress: ActivityProgress): ActivityProgress {
    const date = jstDateKey();
    if (progress.missionDate === date && progress.missions.length === 3) return progress;
    const next = { ...progress, missionDate: date, missions: dailyMissions(date), missionRounds: [] };
    this.state.users[discordUserId] = next;
    this.options.store.save(this.state);
    return next;
  }

  private ensureWeekly(discordUserId: string, progress: ActivityProgress): ActivityProgress {
    const week = jstWeekKey();
    if (progress.weeklyId === week && progress.weekly.length === weeklyPool.length) return progress;
    const next = { ...progress, weeklyId: week, weekly: weeklyPool.map((item) => ({ ...item, progress: 0, claimed: false, games: [] })), weeklyRounds: [] };
    this.state.users[discordUserId] = next;
    this.options.store.save(this.state);
    return next;
  }

  private ensureSeason(discordUserId: string, progress: ActivityProgress): ActivityProgress {
    const id = jstSeasonKey();
    if (progress.seasonId === id) return progress;
    const next = { ...progress, seasonId: id, seasonXp: 0, seasonClaimed: [] };
    this.state.users[discordUserId] = next;
    this.options.store.save(this.state);
    return next;
  }

  private advanceWeekly(discordUserId: string, progress: ActivityProgress, round: TrustedMissionRound): ActivityProgress {
    progress = this.ensureWeekly(discordUserId, progress);
    if (progress.weeklyRounds.includes(round.id)) return progress;
    const win = round.payout > round.wager;
    const game = round.game ?? round.id.split("-", 1)[0] ?? "";
    const weekly = progress.weekly.map((item) => {
      if (item.claimed) return item;
      const games = item.event === "variety" && game && !item.games.includes(game) ? [...item.games, game] : item.games;
      const progressValue = item.event === "round" ? item.progress + 1 : item.event === "win" ? item.progress + (win ? 1 : 0) : item.event === "wager" ? item.progress + round.wager : games.length;
      return { ...item, games, progress: Math.min(item.target, progressValue) };
    });
    const next = { ...progress, weekly, weeklyRounds: [...progress.weeklyRounds, round.id].slice(-1000) };
    this.state.users[discordUserId] = next;
    this.options.store.save(this.state);
    return next;
  }

  private advanceMystery(progress: ActivityProgress): ActivityProgress {
    if (progress.mysteryOffer && !progress.mysteryOffer.claimed) return progress;
    if (randomInt(10_000) >= 450) return progress;
    const rewards: MysteryReward[] = [{ type: "coins", amount: 250 + randomInt(751) }, { type: "dust", amount: 80 + randomInt(221) }, randomInt(100) < 35 ? { type: "capsule", amount: 1 } : { type: "tokens", amount: 2 + randomInt(3) }];
    return { ...progress, mysteryOffer: { id: `${Date.now()}-${randomInt(1_000_000)}`, rewards: shuffle(rewards), claimed: false } };
  }

  private advanceSeason(discordUserId: string, progress: ActivityProgress, round: TrustedMissionRound): ActivityProgress {
    progress = this.ensureSeason(discordUserId, progress);
    const gain = 32 + Math.floor(round.wager / 800) + (round.payout > round.wager ? 20 : 0);
    return { ...progress, seasonXp: Math.min(9_999, progress.seasonXp + Math.max(0, gain)) };
  }

  private ensureCircuit(discordUserId: string, progress: ActivityProgress): ActivityProgress {
    const day = jstDateKey();
    if (progress.circuitDay === day && progress.circuitRoute.length === 7) return progress;
    const route = shuffle(circuitGames).slice(0, 7).map((game, index): CircuitNode => ({ game, type: index === 0 || index === 3 ? "play" : index === 1 || index === 4 || index === 6 ? "win" : "return", target: index >= 5 ? 1.75 : 1.35 }));
    const next = { ...progress, circuitDay: day, circuitActive: false, circuitStage: 0, circuitLives: 3, circuitScore: 0, circuitRoute: route };
    this.state.users[discordUserId] = next;
    this.options.store.save(this.state);
    return next;
  }

  private async advanceCircuit(user: DiscordUser, progress: ActivityProgress, round: TrustedMissionRound) {
    progress = this.ensureCircuit(user.id, progress);
    if (!progress.circuitActive) return { progress, wallet: null as number | null, currency: "Ris" };
    const game = round.game ?? round.id.split("-", 1)[0] ?? "";
    const node = progress.circuitRoute[progress.circuitStage];
    if (!node || node.game !== game) return { progress, wallet: null as number | null, currency: "Ris" };
    const success = node.type === "play" ? true : node.type === "win" ? round.payout > round.wager : round.wager > 0 && round.payout / round.wager >= node.target;
    if (!success) {
      const lives = Math.max(0, progress.circuitLives - 1);
      return { progress: { ...progress, circuitLives: lives, circuitActive: lives > 0 }, wallet: null as number | null, currency: "Ris" };
    }
    const score = progress.circuitScore + 500 + (progress.circuitStage + 1) * 350 + Math.max(0, Math.floor((round.payout - round.wager) / 20));
    const stage = progress.circuitStage + 1;
    if (stage < progress.circuitRoute.length) return { progress: { ...progress, circuitStage: stage, circuitScore: score }, wallet: null as number | null, currency: "Ris" };
    const clears = progress.circuitClears + 1;
    const firstToday = progress.circuitClaimedDay !== progress.circuitDay;
    const amount = firstToday ? 8_000 : 1_500;
    const result = await requestActivityAdjustment({ transactionId: `activity-circuit-${user.id}-${progress.circuitDay}-${clears}`, discordUserId: user.id, sessionId: `circuit-${progress.circuitDay}-${clears}`, operation: "credit", amount, reason: "circuit" }, this.options.env, this.options.fetch);
    return { progress: { ...progress, circuitActive: false, circuitStage: stage, circuitScore: score, circuitClears: clears, circuitBest: Math.max(progress.circuitBest, score), circuitClaimedDay: progress.circuitDay }, wallet: result.wallet, currency: result.currency };
  }

  private prepareOdysseyNodes(progress: ActivityProgress): ActivityProgress {
    const boss = [4, 8, 12].includes(progress.odysseyFloor);
    const nodes = shuffle(odysseyGames).slice(0, 3).map((game): OdysseyNode => {
      const type = boss ? "win" : (["play", "win", "wager"] as const)[randomInt(3)]!;
      return { game, type, target: type === "wager" ? Math.min(10_000, 500 + progress.odysseyFloor * 500) : 1, boss };
    });
    return { ...progress, odysseyNodes: nodes, odysseySelected: null };
  }

  private advanceOdyssey(progress: ActivityProgress, round: TrustedMissionRound): ActivityProgress {
    if (!progress.odysseyActive || progress.odysseyChoices.length || progress.odysseySelected === null) return progress;
    const node = progress.odysseyNodes[progress.odysseySelected];
    const game = round.game ?? round.id.split("-", 1)[0] ?? "";
    if (!node || node.game !== game) return progress;
    const success = node.type === "play" ? true : node.type === "win" ? round.payout > round.wager : round.wager >= node.target;
    const bestFloor = Math.max(progress.odysseyBestFloor, progress.odysseyFloor);
    if (success) {
      const score = progress.odysseyScore + 200 + progress.odysseyFloor * 100 + Math.max(0, Math.floor((round.payout - round.wager) / 50));
      return { ...progress, odysseyScore: score, odysseyBestFloor: bestFloor, odysseySelected: null, odysseyChoices: shuffle(odysseyBoons).slice(0, 3) };
    }
    if (progress.odysseyShields > 0) return this.prepareOdysseyNodes({ ...progress, odysseyShields: progress.odysseyShields - 1, odysseySelected: null, odysseyBestFloor: bestFloor });
    const lives = Math.max(0, progress.odysseyLives - 1);
    if (lives === 0) return { ...progress, odysseyActive: false, odysseyLives: 0, odysseySelected: null, odysseyFailed: progress.odysseyFailed + 1, odysseyBestFloor: bestFloor, odysseyBestScore: Math.max(progress.odysseyBestScore, progress.odysseyScore) };
    return this.prepareOdysseyNodes({ ...progress, odysseyLives: lives, odysseySelected: null, odysseyBestFloor: bestFloor });
  }

  private advanceSovereign(progress: ActivityProgress, round: TrustedMissionRound): ActivityProgress {
    if (!progress.sovereignMigrated) return progress;
    const game = round.game ?? round.id.split("-", 1)[0] ?? "";
    if (!circuitGames.includes(game)) return progress;
    const rounds = (progress.sovereignRounds[game] ?? 0) + 1;
    const marks = Math.min(9_999, progress.sovereignMarks + (rounds % 2 === 0 ? 1 : 0) + (round.payout > round.wager ? 1 : 0));
    return { ...progress, sovereignMarks: marks, sovereignRounds: { ...progress.sovereignRounds, [game]: rounds } };
  }

  private advanceVault(progress: ActivityProgress, round: TrustedMissionRound, doubled: boolean): ActivityProgress {
    if (progress.vaultReady) return progress;
    const baseGain = Math.min(10, Math.max(1, 2 + Math.floor(round.wager / 2500) + (round.payout > round.wager ? 1 : 0)));
    const gain = doubled ? baseGain * 2 : baseGain;
    const vaultCharge = Math.min(100, progress.vaultCharge + gain);
    const vaultReady = vaultCharge >= 100 && progress.vaultPot >= 100;
    return {
      ...progress,
      vaultCharge,
      vaultReady,
      vaultOffer: vaultReady && !progress.vaultReady ? vaultOffer() : progress.vaultOffer
    };
  }

  private advanceNightEvent(progress: ActivityProgress, round: TrustedMissionRound) {
    const active = progress.nightEventActive;
    const bonus = active === "echo" && round.payout > round.wager
      ? Math.min(500, Math.max(25, Math.floor((round.payout - round.wager) * 0.03)))
      : 0;
    if (active) {
      const remaining = Math.max(0, progress.nightEventRemaining - 1);
      if (remaining > 0) return { active, bonus, progress: { ...progress, nightEventRemaining: remaining } };
      return { active, bonus, progress: { ...progress, nightEventActive: null, nightEventRemaining: 0, nightEventNextIn: 4 + randomInt(4) } };
    }

    const nextIn = Math.max(0, progress.nightEventNextIn - 1);
    if (nextIn > 0) return { active: null, bonus, progress: { ...progress, nightEventNextIn: nextIn } };
    const next = nightEventIds[randomInt(nightEventIds.length)]!;
    return { active: null, bonus, progress: { ...progress, nightEventActive: next, nightEventRemaining: nightEventRounds[next], nightEventNextIn: 0 } };
  }

  private advanceCollection(progress: ActivityProgress, round: TrustedMissionRound) {
    if (!progress.collectionMigrated) return progress;
    const won = round.payout > round.wager;
    const dust = 6 + Math.floor(round.wager / 1_200) + (won ? 12 : 0);
    const capsule = randomInt(10_000) < 350;
    return {
      ...progress,
      collectionDust: progress.collectionDust + dust,
      collectionCapsules: progress.collectionCapsules + (capsule ? 1 : 0)
    };
  }

  private publicCollection(progress: ActivityProgress) {
    return {
      migrated: progress.collectionMigrated,
      owned: progress.collectionOwned,
      claimed: progress.albumClaims,
      capsules: progress.collectionCapsules,
      dust: progress.collectionDust,
      shards: progress.collectionShards,
      opened: progress.collectionOpened,
      duplicates: progress.collectionDuplicates
    };
  }

  private publicTreasury(progress: ActivityProgress, wallet: number, currency: string) {
    return {
      wallet,
      currency,
      reserve: progress.reserve,
      notes: progress.notes,
      seals: progress.seals,
      purchases: progress.purchases
    };
  }

  private publicVault(progress: ActivityProgress, wallet: number, currency: string) {
    return {
      wallet,
      currency,
      pot: progress.vaultPot,
      charge: progress.vaultCharge,
      ready: progress.vaultReady,
      claims: progress.vaultClaims
    };
  }

  private publicNightEvent(progress: ActivityProgress, wallet: number, currency: string) {
    return {
      wallet,
      currency,
      active: progress.nightEventActive,
      remaining: progress.nightEventRemaining,
      nextIn: progress.nightEventNextIn
    };
  }

  private publicCircuit(progress: ActivityProgress) {
    return { day: progress.circuitDay, active: progress.circuitActive, stage: progress.circuitStage, lives: progress.circuitLives, score: progress.circuitScore, route: progress.circuitRoute, clears: progress.circuitClears, best: progress.circuitBest, claimedDay: progress.circuitClaimedDay };
  }

  private publicOdyssey(progress: ActivityProgress) {
    return { active: progress.odysseyActive, runId: progress.odysseyRunId, floor: progress.odysseyFloor, lives: progress.odysseyLives, shields: progress.odysseyShields, score: progress.odysseyScore, nodes: progress.odysseyNodes, selected: progress.odysseySelected, rewardChoices: progress.odysseyChoices, boons: progress.odysseyBoons, completed: progress.odysseyCompleted, failed: progress.odysseyFailed, bestFloor: progress.odysseyBestFloor, bestScore: progress.odysseyBestScore };
  }
}

function dailyGiftAmount(wallet: number, streak: number): number {
  const base = wallet >= 250000 ? 300 : wallet >= 100000 ? 500 : 1000;
  const rescue = Math.floor(Math.max(0, Math.min(1, (30000 - wallet) / 30000)) * 1000 / 50) * 50;
  return base + rescue + Math.min(250, Math.max(0, streak) * 25);
}

function collectionRarity(itemId: string): CollectionRarity {
  const [series, type] = itemId.split("_");
  const rarityIndex = collectionSeries.indexOf(series ?? "") + collectionTypes.indexOf(type ?? "");
  if (rarityIndex >= 11) return "mythic";
  if (rarityIndex >= 8) return "legendary";
  if (rarityIndex >= 5) return "epic";
  if (rarityIndex >= 2) return "rare";
  return "common";
}

function rollCollectionRarity(): CollectionRarity {
  const roll = randomInt(100);
  if (roll < 54) return "common";
  if (roll < 82) return "rare";
  if (roll < 94) return "epic";
  if (roll < 99) return "legendary";
  return "mythic";
}

function collectionItem(id: string) {
  const [series, type] = id.split("_");
  const glyphs: Record<string, string> = { avatar: "A", frame: "F", chip: "C", back: "B", aura: "U", emote: "E" };
  return { id, name: id.replace(/_/g, " ").toUpperCase(), rarity: collectionRarity(id), tone: "#c89a5b", glyph: glyphs[type ?? ""] ?? "?", series, type };
}

async function requestActivityAdjustment(
  body: Record<string, unknown>,
  env: ServerEnv,
  fetchFn: FetchLike
): Promise<z.infer<typeof adjustmentResponseSchema>> {
  if (!env.IRIS_ECONOMY_API_KEY) {
    throw new AppError(503, "economy_unavailable", "Activity economy is unavailable.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ECONOMY_API_TIMEOUT_MS);
  const baseUrl = env.IRIS_ECONOMY_API_BASE_URL.replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}/internal/v1/activity/adjustments`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${env.IRIS_ECONOMY_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) throw new AppError(504, "economy_timeout", "Activity economy timed out.");
    throw new AppError(502, "economy_unavailable", "Activity economy is unavailable.");
  } finally {
    clearTimeout(timeout);
  }
  const payload = await parseResponse(response);
  if (!response.ok) throw mapAdjustmentFailure(response.status, payload);
  const parsed = adjustmentResponseSchema.safeParse(payload);
  if (!parsed.success) throw new AppError(502, "invalid_economy_response", "Activity economy response was invalid.");
  return parsed.data;
}

function normalizeState(value: unknown): ActivityProgressState {
  const raw = value && typeof value === "object" && "users" in value ? value as { users?: unknown } : {};
  const users = raw.users && typeof raw.users === "object" ? raw.users as Record<string, unknown> : {};
  return {
    users: Object.fromEntries(Object.entries(users).map(([id, progress]) => [id, normalizeProgress(progress)]))
  };
}

function normalizeProgress(value: unknown): ActivityProgress {
  const raw = value && typeof value === "object" ? value as Partial<ActivityProgress> : {};
  return {
    lastDaily: typeof raw.lastDaily === "string" ? raw.lastDaily : "",
    dailyStreak: safeNonNegativeInteger(raw.dailyStreak),
    reserve: safeNonNegativeInteger(raw.reserve, 3000),
    notes: safeNonNegativeInteger(raw.notes),
    noteRemainder: safeNonNegativeInteger(raw.noteRemainder),
    reliefClaimed: raw.reliefClaimed === true,
    missionDate: typeof raw.missionDate === "string" ? raw.missionDate : "",
    missions: normalizeMissions(raw.missions),
    missionRounds: Array.isArray(raw.missionRounds) ? raw.missionRounds.filter((id): id is string => typeof id === "string" && id.length <= 160).slice(-500) : [],
    vaultPot: safeNonNegativeInteger(raw.vaultPot, 5000),
    vaultCharge: Math.min(100, safeNonNegativeInteger(raw.vaultCharge)),
    vaultReady: raw.vaultReady === true,
    vaultClaims: safeNonNegativeInteger(raw.vaultClaims),
    vaultOffer: normalizeVaultOffer(raw.vaultOffer),
    nightEventActive: isNightEventId(raw.nightEventActive) ? raw.nightEventActive : null,
    nightEventRemaining: safeNonNegativeInteger(raw.nightEventRemaining),
    nightEventNextIn: safeNonNegativeInteger(raw.nightEventNextIn, 6),
    seals: safeNonNegativeInteger(raw.seals),
    purchases: normalizePurchases(raw.purchases),
    purchaseRequests: normalizePurchaseRequests(raw.purchaseRequests),
    weeklyId: typeof raw.weeklyId === "string" ? raw.weeklyId : "",
    weekly: normalizeWeekly(raw.weekly),
    weeklyRounds: Array.isArray(raw.weeklyRounds) ? raw.weeklyRounds.filter((id): id is string => typeof id === "string").slice(-1000) : [],
    mysteryOffer: normalizeMysteryOffer(raw.mysteryOffer),
    seasonId: typeof raw.seasonId === "string" ? raw.seasonId : "",
    seasonXp: Math.min(9_999, safeNonNegativeInteger(raw.seasonXp)),
    seasonClaimed: Array.isArray(raw.seasonClaimed) ? [...new Set(raw.seasonClaimed.filter((tier): tier is number => Number.isInteger(tier) && tier >= 1 && tier <= 40))] : [],
    circuitDay: typeof raw.circuitDay === "string" ? raw.circuitDay : "",
    circuitActive: raw.circuitActive === true,
    circuitStage: Math.min(7, safeNonNegativeInteger(raw.circuitStage)),
    circuitLives: Math.min(3, safeNonNegativeInteger(raw.circuitLives, 3)),
    circuitScore: safeNonNegativeInteger(raw.circuitScore),
    circuitRoute: normalizeCircuitRoute(raw.circuitRoute),
    circuitClears: safeNonNegativeInteger(raw.circuitClears),
    circuitBest: safeNonNegativeInteger(raw.circuitBest),
    circuitClaimedDay: typeof raw.circuitClaimedDay === "string" ? raw.circuitClaimedDay : "",
    odysseyActive: raw.odysseyActive === true,
    odysseyRunId: typeof raw.odysseyRunId === "string" ? raw.odysseyRunId : "",
    odysseyFloor: Math.min(12, Math.max(1, safeNonNegativeInteger(raw.odysseyFloor, 1))),
    odysseyLives: Math.min(5, safeNonNegativeInteger(raw.odysseyLives, 3)),
    odysseyShields: safeNonNegativeInteger(raw.odysseyShields),
    odysseyScore: safeNonNegativeInteger(raw.odysseyScore),
    odysseyNodes: normalizeOdysseyNodes(raw.odysseyNodes),
    odysseySelected: typeof raw.odysseySelected === "number" && Number.isInteger(raw.odysseySelected) && raw.odysseySelected >= 0 && raw.odysseySelected < 3 ? raw.odysseySelected : null,
    odysseyChoices: normalizeOdysseyBoons(raw.odysseyChoices),
    odysseyBoons: normalizeOdysseyBoons(raw.odysseyBoons),
    odysseyCompleted: safeNonNegativeInteger(raw.odysseyCompleted),
    odysseyFailed: safeNonNegativeInteger(raw.odysseyFailed),
    odysseyBestFloor: Math.min(12, safeNonNegativeInteger(raw.odysseyBestFloor)),
    odysseyBestScore: safeNonNegativeInteger(raw.odysseyBestScore),
    collectionMigrated: raw.collectionMigrated === true,
    collectionOwned: Array.isArray(raw.collectionOwned) ? [...new Set(raw.collectionOwned.filter((id): id is string => typeof id === "string" && collectionItemIds.includes(id)))] : [],
    albumClaims: Array.isArray(raw.albumClaims) ? [...new Set(raw.albumClaims.filter((id): id is string => typeof id === "string" && collectionSeries.includes(id)))] : [],
    collectionCapsules: safeNonNegativeInteger(raw.collectionCapsules),
    collectionDust: safeNonNegativeInteger(raw.collectionDust),
    collectionShards: safeNonNegativeInteger(raw.collectionShards),
    collectionOpened: safeNonNegativeInteger(raw.collectionOpened),
    collectionDuplicates: safeNonNegativeInteger(raw.collectionDuplicates),
    sovereignMigrated: raw.sovereignMigrated === true,
    sovereignMarks: Math.min(9_999, safeNonNegativeInteger(raw.sovereignMarks)),
    sovereignChests: safeNonNegativeInteger(raw.sovereignChests),
    sovereignRounds: normalizeSovereignRounds(raw.sovereignRounds),
    artifactMigrated: raw.artifactMigrated === true,
    artifactOwned: Array.isArray(raw.artifactOwned) ? [...new Set(raw.artifactOwned.filter((id): id is string => typeof id === "string" && artifactItemIds.includes(id)))] : [],
    artifactClaims: Array.isArray(raw.artifactClaims) ? [...new Set(raw.artifactClaims.filter((id): id is string => typeof id === "string" && artifactSets.includes(id)))] : []
  };
}

function initialProgress(): ActivityProgress {
  return {
    lastDaily: "",
    dailyStreak: 0,
    reserve: 3000,
    notes: 0,
    noteRemainder: 0,
    reliefClaimed: false,
    missionDate: "",
    missions: [],
    missionRounds: [],
    vaultPot: 5000,
    vaultCharge: 0,
    vaultReady: false,
    vaultClaims: 0,
    vaultOffer: null,
    nightEventActive: null,
    nightEventRemaining: 0,
    nightEventNextIn: 6,
    seals: 0,
    purchases: normalizePurchases(),
    purchaseRequests: {},
    weeklyId: "",
    weekly: [],
    weeklyRounds: [],
    mysteryOffer: null,
    seasonId: "",
    seasonXp: 0,
    seasonClaimed: [],
    circuitDay: "",
    circuitActive: false,
    circuitStage: 0,
    circuitLives: 3,
    circuitScore: 0,
    circuitRoute: [],
    circuitClears: 0,
    circuitBest: 0,
    circuitClaimedDay: "",
    odysseyActive: false,
    odysseyRunId: "",
    odysseyFloor: 1,
    odysseyLives: 3,
    odysseyShields: 0,
    odysseyScore: 0,
    odysseyNodes: [],
    odysseySelected: null,
    odysseyChoices: [],
    odysseyBoons: [],
    odysseyCompleted: 0,
    odysseyFailed: 0,
    odysseyBestFloor: 0,
    odysseyBestScore: 0,
    collectionMigrated: false,
    collectionOwned: [],
    albumClaims: [],
    collectionCapsules: 0,
    collectionDust: 0,
    collectionShards: 0,
    collectionOpened: 0,
    collectionDuplicates: 0,
    sovereignMigrated: false,
    sovereignMarks: 0,
    sovereignChests: 0,
    sovereignRounds: {},
    artifactMigrated: false,
    artifactOwned: [],
    artifactClaims: []
  };
}

function dailyMissions(date: string): MissionProgress[] {
  let seed = [...date].reduce((value, character) => ((value * 33) ^ character.charCodeAt(0)) >>> 0, 5381);
  const pool = [...missionPool];
  const selected: MissionProgress[] = [];
  while (selected.length < 3 && pool.length) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const mission = pool.splice(seed % pool.length, 1)[0]!;
    selected.push({ ...mission, progress: 0, claimed: false });
  }
  return selected;
}

function normalizeMissions(value: unknown): MissionProgress[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((mission) => {
    if (!mission || typeof mission !== "object") return [];
    const raw = mission as Partial<MissionProgress>;
    const template = missionPool.find((item) => item.id === raw.id);
    if (!template) return [];
    return [{ ...template, progress: Math.min(template.target, safeNonNegativeInteger(raw.progress)), claimed: raw.claimed === true }];
  }).slice(0, 3);
}

function vaultOffer(): number[] {
  const values = [0.1, 0.25, randomInt(20) === 0 ? 1 : 0.5];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex]!, values[index]!];
  }
  return values;
}

function normalizeVaultOffer(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const allowed = new Set([0.1, 0.25, 0.5, 1]);
  return value.every((item) => typeof item === "number" && allowed.has(item)) ? [...value] : null;
}

function isNightEventId(value: unknown): value is NightEventId {
  return typeof value === "string" && nightEventIds.includes(value as NightEventId);
}

function normalizePurchases(value?: Partial<Record<TreasuryItemId, unknown>>): Record<TreasuryItemId, number> {
  return Object.fromEntries(treasuryItemIds.map((id) => [id, safeNonNegativeInteger(value?.[id])])) as Record<TreasuryItemId, number>;
}

function normalizePurchaseRequests(value: unknown): ActivityProgress["purchaseRequests"] {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, request]) => {
    if (!isPurchaseId(id) || !request || typeof request !== "object") return [];
    const raw = request as { itemId?: unknown; pay?: unknown };
    if (!isTreasuryItemId(raw.itemId) || !isTreasuryPay(raw.pay)) return [];
    return [[id, { itemId: raw.itemId, pay: raw.pay }]];
  }));
}

function normalizeWeekly(value: unknown): WeeklyProgress[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Partial<WeeklyProgress>;
    if (!weeklyPool.some((candidate) => candidate.id === entry.id && candidate.event === entry.event)) return [];
    const source = weeklyPool.find((candidate) => candidate.id === entry.id)!;
    return [{ ...source, progress: Math.min(source.target, safeNonNegativeInteger(entry.progress)), claimed: entry.claimed === true, games: Array.isArray(entry.games) ? entry.games.filter((game): game is string => typeof game === "string").slice(0, 32) : [] }];
  });
}

function normalizeMysteryOffer(value: unknown): MysteryOffer | null {
  if (!value || typeof value !== "object") return null;
  const offer = value as Partial<MysteryOffer>;
  if (typeof offer.id !== "string" || !Array.isArray(offer.rewards) || typeof offer.claimed !== "boolean") return null;
  const rewards = offer.rewards.flatMap((reward): MysteryReward[] => {
    if (!reward || typeof reward !== "object") return [];
    const candidate = reward as Partial<MysteryReward>;
    const amount = candidate.amount;
    if ((candidate.type !== "coins" && candidate.type !== "dust" && candidate.type !== "capsule" && candidate.type !== "tokens") || typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) return [];
    return [{ type: candidate.type, amount }];
  }).slice(0, 3);
  return rewards.length === 3 ? { id: offer.id, rewards, claimed: offer.claimed } : null;
}

function normalizeCircuitRoute(value: unknown): CircuitNode[] {
  if (!Array.isArray(value) || value.length !== 7) return [];
  return value.flatMap((node): CircuitNode[] => {
    if (!node || typeof node !== "object") return [];
    const entry = node as Partial<CircuitNode>;
    if (!circuitGames.includes(entry.game ?? "") || (entry.type !== "play" && entry.type !== "win" && entry.type !== "return") || typeof entry.target !== "number") return [];
    return [{ game: entry.game!, type: entry.type, target: entry.target }];
  });
}

function normalizeOdysseyNodes(value: unknown): OdysseyNode[] {
  if (!Array.isArray(value) || value.length !== 3) return [];
  return value.flatMap((node): OdysseyNode[] => {
    if (!node || typeof node !== "object") return [];
    const entry = node as Partial<OdysseyNode>;
    if (!odysseyGames.includes(entry.game ?? "") || (entry.type !== "play" && entry.type !== "win" && entry.type !== "wager") || typeof entry.target !== "number" || typeof entry.boss !== "boolean") return [];
    return [{ game: entry.game!, type: entry.type, target: entry.target, boss: entry.boss }];
  });
}

function normalizeOdysseyBoons(value: unknown): OdysseyBoon[] {
  return Array.isArray(value) ? value.filter((boon): boon is OdysseyBoon => boon === "life" || boon === "coins" || boon === "key" || boon === "shield" || boon === "fame" || boon === "score").slice(0, 24) : [];
}

function normalizeSovereignRounds(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).flatMap(([game, rounds]) => circuitGames.includes(game) && typeof rounds === "number" ? [[game, safeNonNegativeInteger(rounds)]] : []));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
  }
  return copy;
}

function jstWeekKey(date = new Date()) { const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000); jst.setUTCDate(jst.getUTCDate() - ((jst.getUTCDay() + 6) % 7)); return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}-${String(jst.getUTCDate()).padStart(2, "0")}`; }
function jstSeasonKey(date = new Date()) { const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000); return `${jst.getUTCFullYear()}-${String(jst.getUTCMonth() + 1).padStart(2, "0")}`; }
function seasonTier(xp: number) { return Math.min(40, Math.floor(xp / 250) + 1); }
function seasonReward(tier: number): SeasonReward { if (tier % 10 === 0) return { type: "capsule", amount: 2 }; if (tier % 5 === 0) return { type: "shards", amount: 100 + tier * 4 }; if (tier % 4 === 0) return { type: "tokens", amount: 2 }; if (tier % 3 === 0) return { type: "dust", amount: 120 + tier * 3 }; return { type: "coins", amount: 500 + tier * 30 }; }

function treasuryCatalog(seals: number) {
  return [
    { id: "stardust" as const, coins: 8000, notes: 20 },
    { id: "capsule" as const, coins: 15000, notes: 40 },
    { id: "key" as const, coins: 25000, notes: 75 },
    { id: "seal" as const, coins: Math.floor(50000 * Math.pow(1.5, Math.min(8, seals))), notes: 150 + 50 * seals }
  ];
}

export function isTreasuryItemId(value: unknown): value is TreasuryItemId {
  return typeof value === "string" && treasuryItemIds.includes(value as TreasuryItemId);
}

export function isTreasuryPay(value: unknown): value is TreasuryPay {
  return value === "coins" || value === "notes";
}

export function isPurchaseId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,80}$/.test(value);
}

function safeNonNegativeInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function jstDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function mapAdjustmentFailure(status: number, payload: unknown): AppError {
  const code = payload && typeof payload === "object" && "error" in payload && (payload as { error?: { code?: unknown } }).error?.code;
  if (code === "ECONOMY_NOT_JOINED" || status === 403) return new AppError(409, "economy_not_joined", "IRIS Economy is not joined yet.");
  if (code === "INSUFFICIENT_FUNDS") return new AppError(409, "insufficient_funds", "Insufficient Ris balance.");
  if (status === 409) return new AppError(409, "casino_transaction_conflict", "Activity transaction is not in a valid state.");
  return new AppError(502, "economy_unavailable", "Activity economy is unavailable.");
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");
}
