import type { DiscordUser } from "@iris/shared";
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
  seals: number;
  purchases: Record<TreasuryItemId, number>;
  purchaseRequests: Record<string, { itemId: TreasuryItemId; pay: TreasuryPay }>;
};

type ActivityProgressState = {
  users: Record<string, ActivityProgress>;
};

type TreasuryItemId = "stardust" | "capsule" | "key" | "seal";
type TreasuryPay = "coins" | "notes";

const treasuryItemIds = ["stardust", "capsule", "key", "seal"] as const satisfies readonly TreasuryItemId[];

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
    this.state = options.store.load();
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
}

function dailyGiftAmount(wallet: number, streak: number): number {
  const base = wallet >= 250000 ? 300 : wallet >= 100000 ? 500 : 1000;
  const rescue = Math.floor(Math.max(0, Math.min(1, (30000 - wallet) / 30000)) * 1000 / 50) * 50;
  return base + rescue + Math.min(250, Math.max(0, streak) * 25);
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
    seals: safeNonNegativeInteger(raw.seals),
    purchases: normalizePurchases(raw.purchases),
    purchaseRequests: normalizePurchaseRequests(raw.purchaseRequests)
  };
}

function initialProgress(): ActivityProgress {
  return {
    lastDaily: "",
    dailyStreak: 0,
    reserve: 3000,
    notes: 0,
    noteRemainder: 0,
    seals: 0,
    purchases: normalizePurchases(),
    purchaseRequests: {}
  };
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
