import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { RouletteService, type RouletteRound, type RouletteRoundStore } from "./roulette.js";

class MemoryStore implements RouletteRoundStore {
  rounds: RouletteRound[] = [];
  load() { return structuredClone(this.rounds); }
  save(rounds: RouletteRound[]) { this.rounds = structuredClone(rounds); }
}

class FailingStore extends MemoryStore {
  override save(): void { throw new Error("roulette state write failed"); }
}

function response(wallet: number, status: "reserved" | "settled", payout: number | null) {
  return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "roulette-spin-1", sessionId: "roulette-spin-1", game: "roulette", bet: 200, status, payout } }), { headers: { "content-type": "application/json" } });
}

describe("RouletteService", () => {
  it("settles validated multiple bets from a server-owned number", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(12300, "reserved", null)).mockResolvedValueOnce(response(12500, "settled", 200));
    const service = new RouletteService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store: new MemoryStore(), number: () => 7 });
    const result = await service.spin({ id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null }, "spin-1", [{ selection: "n:7", amount: 100 }, { selection: "color:red", amount: 100 }]);

    expect(result).toMatchObject({ number: 7, payout: 3800, phase: "settled" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("identifies the reservation, settlement, and persistence stages without changing their idempotent ids", async () => {
    const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };
    const env = loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" });

    const reservationFailure = new RouletteService({ env, fetch: vi.fn().mockRejectedValue(new Error("reserve transport failed")), store: new MemoryStore() });
    await expect(reservationFailure.spin(user, "reserve-stage", [{ selection: "n:7", amount: 100 }])).rejects.toMatchObject({ casinoStage: "roulette.reserve" });

    const settlementFailure = new RouletteService({ env, fetch: vi.fn().mockResolvedValueOnce(response(12300, "reserved", null)).mockRejectedValueOnce(new Error("settle transport failed")), store: new MemoryStore() });
    await expect(settlementFailure.spin(user, "settle-stage", [{ selection: "n:7", amount: 100 }])).rejects.toMatchObject({ casinoStage: "roulette.settle" });

    const writeFailure = new RouletteService({ env, fetch: vi.fn(), store: new FailingStore() });
    await expect(writeFailure.spin(user, "save-stage", [{ selection: "n:7", amount: 100 }])).rejects.toMatchObject({ casinoStage: "roulette.state.save.initial" });
  });
});
