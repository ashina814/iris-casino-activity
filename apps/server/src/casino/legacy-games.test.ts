import { describe, expect, it, vi } from "vitest";
import { LegacyGamesService, type LegacyGameStore } from "./legacy-games.js";
import { loadEnv } from "../env.js";

type StoredRound = ReturnType<LegacyGameStore["load"]>[number];
class MemoryStore implements LegacyGameStore {
  rounds: StoredRound[] = [];
  load() { return structuredClone(this.rounds); }
  save(rounds: StoredRound[]) { this.rounds = structuredClone(rounds); }
}

function response(wallet: number, status: "reserved" | "settled", payout: number | null) {
  return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "legacy-test", sessionId: "legacy-test", game: "tower", bet: 100, status, payout } }), { headers: { "content-type": "application/json" } });
}

describe("LegacyGamesService", () => {
  it("keeps active table secrets off the client and settles a completed derby once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(12400, "reserved", null))
      .mockResolvedValueOnce(response(12300, "reserved", null))
      .mockResolvedValueOnce(response(12400, "settled", 0));
    const service = new LegacyGamesService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store: new MemoryStore() });
    const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };

    const tower = await service.start(user, "tower", "tower-round", 100);
    expect(tower).toMatchObject({ phase: "active", state: { floor: 1, traps: [] } });

    const derby = await service.start(user, "derby", "derby-round", 100, { selection: 0 });
    expect(derby.phase).toBe("settled");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not expose a live Hold'em dealer hand", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(12400, "reserved", null));
    const service = new LegacyGamesService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store: new MemoryStore() });
    const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };

    const round = await service.start(user, "holdem", "holdem-round", 100);
    expect(round.state).not.toHaveProperty("deck");
    expect(round.state.dealer).toEqual([{ rank: "A", suit: "S" }, { rank: "A", suit: "S" }]);
  });

  it("starts Arcana's 45-second clock only after its memorization phase", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(12400, "reserved", null));
    const service = new LegacyGamesService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store: new MemoryStore() });
    const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };

    const created = await service.start(user, "arcana", "arcana-round", 100);
    expect(created.state).toMatchObject({ startedAt: null });

    const begun = await service.action(user, "arcana-round", "arcana-begin", "begin");
    expect(begun.state.startedAt).toEqual(expect.any(Number));
    expect(begun.serverNow).toEqual(expect.any(Number));
  });

  it("settles Ascent at the configured auto cash-out before a later crash", async () => {
    const store = new MemoryStore();
    store.rounds = [{ id: "ascent-auto", discordUserId: "234567890123456789", game: "ascent", bet: 100, phase: "active", payout: null, wallet: 12400, state: { startedAt: Date.now() - 4000, crashPoint: 5, multiplier: 1, autoCash: 1.5 }, lastActionId: null }];
    const fetchMock = vi.fn().mockResolvedValue(response(12550, "settled", 150));
    const service = new LegacyGamesService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store });
    const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };

    const round = await service.action(user, "ascent-auto", "ascent-tick", "tick");
    expect(round).toMatchObject({ phase: "settled", payout: 150, state: { multiplier: 1.5, autoCash: 1.5 } });
  });
});
