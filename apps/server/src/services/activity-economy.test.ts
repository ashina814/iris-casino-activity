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

type WeeklyFixtureEvent = "round" | "win" | "wager" | "variety" | "masteryLevel" | "duelWin" | "raidDamage" | "capsule";
type WeeklyFixture = { id: string; event: WeeklyFixtureEvent; target: number; reward: { coins: number; dust: number; tokens: number }; progress: number; claimed: boolean; games: string[] };
type FetchMock = (url: string | URL, init?: RequestInit) => Promise<Response>;

function weeklyFixture(id: string, event: WeeklyFixtureEvent, target: number, reward: WeeklyFixture["reward"]): WeeklyFixture {
  return { id, event, target, reward, progress: 0, claimed: false, games: [] };
}

async function serviceWithWeeklyContracts(fetchMock: FetchMock, items: WeeklyFixture[]) {
  const store = new MemoryStore();
  const bootstrap = new ActivityEconomyService({ env, fetch: fetchMock as typeof fetch, store });
  const { week } = await bootstrap.weeklyStatus(user);
  store.save({ users: { [user.id]: { weeklyId: week, weekly: items } } });
  return new ActivityEconomyService({ env, fetch: fetchMock as typeof fetch, store });
}

describe("ActivityEconomyService missions", () => {
  it("tracks and pays a weekly contract from trusted rounds exactly once", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 7500, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = await serviceWithWeeklyContracts(fetchMock, [
      weeklyFixture("rounds", "round", 50, { coins: 2500, dust: 180, tokens: 2 }),
      weeklyFixture("wins", "win", 15, { coins: 3000, dust: 220, tokens: 2 }),
      weeklyFixture("wager", "wager", 250000, { coins: 3500, dust: 250, tokens: 3 }),
      weeklyFixture("variety", "variety", 10, { coins: 3000, dust: 300, tokens: 3 })
    ]);
    for (let index = 0; index < 50; index += 1) await service.recordMissionRound(user, { id: `weekly-round-${index}`, wager: 100, payout: 0 });

    const weekly = await service.weeklyStatus(user);
    expect(weekly.items.find((item) => item.id === "rounds")).toMatchObject({ progress: 50, target: 50, claimed: false });
    expect(await service.claimWeekly(user, "rounds")).toMatchObject({ amount: 2500, reward: { coins: 2500, dust: 180, tokens: 2 }, collection: { dust: 180 }, eventTokens: 2, alreadyClaimed: false, wallet: 7500 });
    expect((await service.claimWeekly(user, "rounds")).alreadyClaimed).toBe(true);
  });

  it("tracks distinct games for the weekly variety contract", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = await serviceWithWeeklyContracts(fetchMock, [
      weeklyFixture("rounds", "round", 50, { coins: 2500, dust: 180, tokens: 2 }),
      weeklyFixture("wins", "win", 15, { coins: 3000, dust: 220, tokens: 2 }),
      weeklyFixture("wager", "wager", 250000, { coins: 3500, dust: 250, tokens: 3 }),
      weeklyFixture("variety", "variety", 10, { coins: 3000, dust: 300, tokens: 3 })
    ]);
    for (const game of ["blackjack", "roulette", "slots", "baccarat", "poker", "sicbo", "keno", "dragon", "wheel", "craps"]) {
      await service.recordMissionRound(user, { id: `${game}-round`, wager: 100, payout: 0 });
    }
    expect((await service.weeklyStatus(user)).items.find((item) => item.id === "variety")).toMatchObject({ progress: 10, target: 10 });
  });

  it("selects four weekly contracts from the complete Lux pool", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    const weekly = await service.weeklyStatus(user);

    expect(weekly.items).toHaveLength(4);
    expect(weekly.items.map((item) => item.id)).toEqual(expect.arrayContaining([expect.any(String)]));
    expect(weekly.items.every((item) => ["rounds", "wins", "wager", "variety", "mastery", "duel", "raid", "capsule"].includes(item.id))).toBe(true);
  });

  it("records mastery levels and their weekly progress on the server", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = await serviceWithWeeklyContracts(fetchMock, [
      weeklyFixture("mastery", "masteryLevel", 5, { coins: 2200, dust: 320, tokens: 3 }),
      weeklyFixture("rounds", "round", 50, { coins: 2500, dust: 180, tokens: 2 }),
      weeklyFixture("wins", "win", 15, { coins: 3000, dust: 220, tokens: 2 }),
      weeklyFixture("capsule", "capsule", 4, { coins: 2200, dust: 250, tokens: 3 })
    ]);
    for (let index = 0; index < 8; index += 1) await service.recordMissionRound(user, { id: `mastery-${index}`, game: "blackjack", wager: 100_000, payout: 0 });

    const weekly = await service.weeklyStatus(user);
    expect(weekly.items.find((item) => item.id === "mastery")).toMatchObject({ progress: 5, target: 5 });
    expect(weekly.collection).toMatchObject({ dust: 275, capsules: 2 });
  });

  it("records server-owned collection capsule openings for weekly contracts", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const store = new MemoryStore();
    const bootstrap = new ActivityEconomyService({ env, fetch: fetchMock, store });
    const { week } = await bootstrap.weeklyStatus(user);
    store.save({ users: { [user.id]: { weeklyId: week, weekly: [
      weeklyFixture("capsule", "capsule", 4, { coins: 2200, dust: 250, tokens: 3 }),
      weeklyFixture("rounds", "round", 50, { coins: 2500, dust: 180, tokens: 2 }),
      weeklyFixture("wins", "win", 15, { coins: 3000, dust: 220, tokens: 2 }),
      weeklyFixture("wager", "wager", 250000, { coins: 3500, dust: 250, tokens: 3 })
    ], collectionMigrated: true, collectionCapsules: 1 } } });
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });

    await service.openCollectionCapsule(user);
    expect((await service.weeklyStatus(user)).items.find((item) => item.id === "capsule")).toMatchObject({ progress: 1, target: 4 });
  });

  it("migrates and authorizes constellation progression on the server", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    expect(service.migrateAscension(user, { mastery: { blackjack: { xp: 0, level: 1, rounds: 0, wins: 0 } }, nodes: ["fortune_1"], points: 2 })).toMatchObject({ migrated: true, mastery: { blackjack: { level: 1 } }, constellation: { nodes: ["fortune_1"], points: 2 } });
    expect(service.unlockConstellation(user, "fortune_3")).toMatchObject({ constellation: { nodes: ["fortune_1", "fortune_3"], points: 0 } });

    await service.recordMissionRound(user, { id: "blackjack-constellation", game: "blackjack", wager: 0, payout: 0 });
    expect(service.ascensionStatus(user)).toMatchObject({ mastery: { blackjack: { xp: 24, level: 1, rounds: 1, wins: 0 } } });
    expect(() => service.unlockConstellation(user, "fortune_7")).toThrow("Constellation prerequisites are incomplete.");
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

  it("tracks season XP from trusted rounds and settles a tier reward once", async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 5530, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    for (let index = 0; index < 5; index += 1) await service.recordMissionRound(user, { id: `season-${index}`, wager: 40_000, payout: 40_001 });

    expect(await service.seasonStatus(user)).toMatchObject({ xp: 510, tier: 3, claimed: [] });
    expect(await service.claimSeason(user, 1)).toMatchObject({ tier: 1, reward: { type: "coins", amount: 530 }, alreadyClaimed: false, wallet: 5530 });
    expect(await service.claimSeason(user, 1)).toMatchObject({ alreadyClaimed: true });
  });

  it("runs a server-owned Crown Circuit and settles its daily reward", async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 13000, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    const started = await service.startCircuit(user);
    for (const [index, node] of started.route.entries()) {
      const payout = node.type === "play" ? 0 : node.type === "win" ? 200 : 200;
      await service.recordMissionRound(user, { id: `circuit-${index}-${node.game}`, game: node.game, wager: 100, payout });
    }
    expect(await service.circuitStatus(user)).toMatchObject({ active: false, stage: 7, clears: 1, claimedDay: expect.any(String) });
    const adjustment = fetchMock.mock.calls.find(([, init]) => String(init?.body).includes('"reason":"circuit"'));
    expect(JSON.parse(String(adjustment?.[1]?.body))).toMatchObject({ amount: 8000, reason: "circuit" });
  });

  it("settles an Odyssey coin boon from server-owned run state", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { odysseyActive: true, odysseyRunId: "ody-test", odysseyFloor: 1, odysseyLives: 3, odysseyShields: 0, odysseyScore: 0, odysseyNodes: [], odysseySelected: null, odysseyChoices: ["coins"], odysseyBoons: [], odysseyCompleted: 0, odysseyFailed: 0, odysseyBestFloor: 0, odysseyBestScore: 0 } } });
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 6500, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });
    expect(await service.chooseOdysseyBoon(user, "coins")).toMatchObject({ boon: "coins", wallet: 6500 });
    await expect(service.chooseOdysseyBoon(user, "coins")).rejects.toMatchObject({ code: "casino_transaction_conflict" });
    const adjustment = fetchMock.mock.calls.find(([, init]) => String(init?.body).includes('"reason":"odyssey"'));
    expect(JSON.parse(String(adjustment?.[1]?.body))).toMatchObject({ amount: 1500, reason: "odyssey" });
  });

  it("settles a completed migrated album through RIS exactly once", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { collectionMigrated: true, collectionOwned: ["nocturne_avatar", "nocturne_frame", "nocturne_chip", "nocturne_back", "nocturne_aura", "nocturne_emote"], albumClaims: [] } } });
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 8000, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });
    expect(await service.claimAlbum(user, "nocturne")).toMatchObject({ amount: 3000, dust: 400, shards: 150, wallet: 8000 });
    await expect(service.claimAlbum(user, "nocturne")).rejects.toMatchObject({ code: "casino_transaction_conflict" });
  });

  it("does not accept collection ownership changes after the initial migration", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { collectionMigrated: true, collectionOwned: ["nocturne_avatar"], albumClaims: [] } } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });
    expect((await service.migrateAlbumCollection(user, ["nocturne_frame"], { capsules: 0, dust: 0, shards: 0, opened: 0, duplicates: 0 })).owned).toEqual(["nocturne_avatar"]);
  });

  it("opens and crafts collection items from server-owned resources", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { collectionMigrated: true, collectionCapsules: 1, collectionDust: 0, collectionShards: 500, collectionOwned: [], albumClaims: [] } } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });
    const capsule = await service.openCollectionCapsule(user);
    expect(capsule).toMatchObject({ duplicate: false, collection: { capsules: 0, opened: 1 } });
    expect(capsule.collection.owned).toContain(capsule.item.id);
    const crafted = await service.craftCollectionLegendary(user);
    expect(crafted.collection.shards).toBe(0);
    expect(["legendary", "mythic"]).toContain(crafted.item.rarity);
  });

  it("opens a server-owned Sovereign Chest through a single RIS adjustment", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { sovereignMigrated: true, sovereignMarks: 150, sovereignChests: 0, sovereignRounds: {} } } });
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 7000, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });
    const chest = await service.openSovereignChest(user);
    expect(chest).toMatchObject({ marks: 0, chests: 1, wallet: 7000 });
    expect([2000, 3000, 4000, 6000, 10000]).toContain(chest.amount);
    await expect(service.openSovereignChest(user)).rejects.toMatchObject({ code: "casino_transaction_conflict" });
  });

  it("settles a completed Eternal Artifact set through RIS exactly once", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { artifactMigrated: true, artifactOwned: ["eclipse-0", "eclipse-1", "eclipse-2", "eclipse-3", "eclipse-4", "eclipse-5"], artifactClaims: [] } } });
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 9000, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });
    expect(await service.claimArtifactSet(user, "eclipse")).toMatchObject({ amount: 4000, keys: 2, wallet: 9000 });
    await expect(service.claimArtifactSet(user, "eclipse")).rejects.toMatchObject({ code: "casino_transaction_conflict" });
  });

  it("opens an Eternal Artifact vault from server-owned keys only", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { artifactMigrated: true, artifactOwned: [], artifactClaims: [], artifactKeys: 1, artifactFragments: 0, artifactOpened: 0, artifactDuplicates: 0, artifactShards: 0 } } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });
    const vault = await service.openArtifactVault(user);
    expect(vault.artifacts).toMatchObject({ keys: 0, opened: 1 });
    expect(vault.drops).toHaveLength(3);
    expect(vault.drops.every((item) => vault.artifacts.owned.includes(item.id))).toBe(true);
    await expect(service.openArtifactVault(user)).rejects.toMatchObject({ code: "casino_transaction_conflict" });
  });

  it("crafts an unowned artifact from server-owned shards only", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { artifactMigrated: true, artifactOwned: [], artifactClaims: [], artifactKeys: 0, artifactFragments: 0, artifactOpened: 0, artifactDuplicates: 0, artifactShards: 400 } } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });
    const craft = await service.craftArtifact(user);
    expect(craft.artifacts.shards).toBe(0);
    expect(craft.artifacts.owned).toContain(craft.item.id);
    await expect(service.craftArtifact(user)).rejects.toMatchObject({ code: "casino_transaction_conflict" });
  });

  it("does not accept artifact ownership changes after the initial migration", async () => {
    const store = new MemoryStore();
    store.save({ users: { [user.id]: { artifactMigrated: true, artifactOwned: ["eclipse-0"], artifactClaims: [] } } });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store });
    const artifacts = await service.migrateArtifacts(user, ["eclipse-1"], { keys: 0, fragments: 0, opened: 0, duplicates: 0, shards: 0 });
    expect(artifacts.owned).toEqual(["eclipse-0"]);
  });

  it("settles a raid reward and its collection resources exactly once", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 8000, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    expect(await service.claimRaid(user, "raid-test")).toMatchObject({ amount: 3000, dust: 350, capsules: 1, collection: { dust: 350, capsules: 1 }, wallet: 8000 });
    expect(await service.claimRaid(user, "raid-test")).toMatchObject({ amount: 0, alreadyClaimed: true, collection: { dust: 350, capsules: 1 } });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("adjustments"))).toHaveLength(1);
  });

  it("settles each Party Crown exactly once", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 5500, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    expect(await service.claimPartyCrown(user, "crown-test")).toMatchObject({ amount: 500, alreadyClaimed: false, wallet: 5500 });
    expect(await service.claimPartyCrown(user, "crown-test")).toMatchObject({ amount: 0, alreadyClaimed: true, wallet: 5000 });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("adjustments"))).toHaveLength(1);
  });

  it("settles each Crown Duel reward exactly once", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => new Response(JSON.stringify(String(url).includes("adjustments") ? { ok: true, wallet: 5500, currency: "Ris" } : { wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } }));
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    expect(await service.claimDuel(user, "duel-test", 500)).toMatchObject({ amount: 500, alreadyClaimed: false, wallet: 5500 });
    expect(await service.claimDuel(user, "duel-test", 500)).toMatchObject({ amount: 0, alreadyClaimed: true, wallet: 5000 });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("adjustments"))).toHaveLength(1);
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
