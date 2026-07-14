import { describe, expect, it, vi } from "vitest";
import { ActivityEconomyService, type ActivityProgressStore } from "./activity-economy.js";
import { loadEnv } from "../env.js";

class MemoryStore implements ActivityProgressStore {
  state = { users: {} };
  load() { return structuredClone(this.state); }
  save(state: typeof this.state) { this.state = structuredClone(state); }
}

const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };
const env = loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-key" });

describe("ActivityEconomyService missions", () => {
  it("tracks and pays a weekly contract from trusted rounds exactly once", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 7500, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    for (let index = 0; index < 50; index += 1) await service.recordMissionRound(user, { id: `weekly-round-${index}`, wager: 100, payout: 0 });

    const weekly = await service.weeklyStatus(user);
    expect(weekly.items.find((item) => item.id === "rounds")).toMatchObject({ progress: 50, target: 50, claimed: false });
    expect(await service.claimWeekly(user, "rounds")).toMatchObject({ amount: 2500, alreadyClaimed: false, wallet: 7500 });
    expect((await service.claimWeekly(user, "rounds")).alreadyClaimed).toBe(true);
  });

  it("tracks distinct games for the weekly variety contract", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    for (const game of ["blackjack", "roulette", "slots", "baccarat", "poker", "sicbo", "keno", "dragon", "wheel", "craps"]) {
      await service.recordMissionRound(user, { id: `${game}-round`, wager: 100, payout: 0 });
    }
    expect((await service.weeklyStatus(user)).items.find((item) => item.id === "variety")).toMatchObject({ progress: 10, target: 10 });
  });

  it("claims a server-owned mystery coin reward exactly once", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { mysteryOffer: { id: "100-1", rewards: [{ type: "coins", amount: 700 }, { type: "dust", amount: 100 }, { type: "tokens", amount: 3 }], claimed: false } } } });
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 5700, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });

    expect(await service.claimMystery(user, "100-1", 0)).toMatchObject({ reward: { type: "coins", amount: 700 }, wallet: 5700 });
    await expect(service.claimMystery(user, "100-1", 0)).rejects.toMatchObject({ code: "casino_transaction_conflict" });
    const adjustment = fetchMock.mock.calls.find(([url]) => String(url).includes("adjustments"));
    expect(JSON.parse(String(adjustment?.[1]?.body))).toMatchObject({ amount: 700, reason: "mystery" });
  });

  it("awards a server-recorded daily mission once even when its round is retried", async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url).includes("/activity/adjustments")) return new Response(JSON.stringify({ ok: true, wallet: 5600, currency: "Ris" }), { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } });
    });
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    const status = await service.missionStatus(user);
    const mission = status.items[0]!;
    const events = mission.event === "round" ? {} : mission.event === "win" ? {} : mission.event === "wager" ? {} : { [mission.event]: mission.target };
    const wager = mission.event === "wager" ? mission.target : 100;
    const payout = mission.event === "win" ? 200 : 0;

    let first;
    for (let index = 0; index < (mission.event === "round" ? mission.target : 1); index += 1) {
      first = await service.recordMissionRound(user, { id: `trusted-round-${index}`, wager, payout, events });
    }
    await service.recordMissionRound(user, { id: `trusted-round-${mission.event === "round" ? mission.target - 1 : 0}`, wager, payout, events });

    expect(first?.awarded).toContainEqual({ id: mission.id, amount: mission.reward });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/activity/adjustments"))).toHaveLength(1);
  });

  it("charges and settles Eclipse Vault through a single RIS adjustment", async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url).includes("/activity/adjustments")) return new Response(JSON.stringify({ ok: true, wallet: 9000, currency: "Ris" }), { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } });
    });
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });

    for (let index = 0; index < 10; index += 1) {
      await service.recordMissionRound(user, { id: `vault-round-${index}`, wager: 20_000, payout: 20_001 });
    }
    const ready = await service.vaultStatus(user);
    expect(ready).toMatchObject({ pot: 5000, charge: 100, ready: true, claims: 0 });

    const claimed = await service.claimVault(user, 0);
    expect([500, 1250, 2500, 5000]).toContain(claimed.amount);
    expect(claimed).toMatchObject({ charge: 0, ready: false, claims: 1, wallet: 9000, currency: "Ris" });
    const adjustmentBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/activity/adjustments"))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as { reason: string });
    expect(adjustmentBodies.filter((body) => body.reason === "vault")).toHaveLength(1);
  });

  it("settles Fortune Echo once from the server-owned night event", async () => {
    const store = new MemoryStore();
    store.save({
      users: {
        [user.id]: {
          lastDaily: "", dailyStreak: 0, reserve: 3000, notes: 0, noteRemainder: 0, reliefClaimed: false,
          missionDate: "", missions: [], missionRounds: [],
          vaultPot: 5000, vaultCharge: 0, vaultReady: false, vaultClaims: 0, vaultOffer: null,
          nightEventActive: "echo", nightEventRemaining: 1, nightEventNextIn: 0,
          seals: 0, purchases: { stardust: 0, capsule: 0, key: 0, seal: 0 }, purchaseRequests: {}
        }
      }
    });
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url).includes("/activity/adjustments")) return new Response(JSON.stringify({ ok: true, wallet: 7030, currency: "Ris" }), { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } });
    });
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });

    await service.recordMissionRound(user, { id: "echo-round", wager: 100, payout: 1100 });
    await service.recordMissionRound(user, { id: "echo-round", wager: 100, payout: 1100 });

    const eventAdjustments = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/activity/adjustments"))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as { reason: string; amount: number })
      .filter((body) => body.reason === "event");
    expect(eventAdjustments).toHaveLength(1);
    expect(eventAdjustments[0]).toMatchObject({ reason: "event", amount: 30 });
  });
});
