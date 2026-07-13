import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { SlotsService, type SlotsState } from "./slots.js";

class MemorySlotsStore {
  state: SlotsState = { rounds: [], players: [] };
  load(): SlotsState { return structuredClone(this.state); }
  save(state: SlotsState): void { this.state = structuredClone(state); }
}

const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };

function reply(wallet: number, status: "reserved" | "settled", payout: number | null) {
  return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "slots-spin-1", sessionId: "slots-spin-1", game: "slots", bet: 100, status, payout } }), { headers: { "content-type": "application/json" } });
}

describe("SlotsService", () => {
  it("persists a paid spin and returns its settled result on retry", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(12400, "reserved", null)).mockResolvedValueOnce(reply(12400, "settled", 0));
    const store = new MemorySlotsStore();
    const env = loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" });
    const service = new SlotsService({ env, fetch: fetchMock, store, symbol: () => "STAR" });

    const spin = await service.spin(user, "spin-1", 100);
    const retry = await service.spin(user, "spin-1", 100);

    expect(spin).toMatchObject({ wager: 100, wallet: 12400, phase: "settled", freeSpins: 0 });
    expect(spin.grid).toHaveLength(5);
    expect(retry).toEqual(spin);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(store.state.rounds).toHaveLength(1);
  });

  it("persists free spins and does not charge their wager", async () => {
    const store = new MemorySlotsStore();
    const service = new SlotsService({
      env: loadEnv({ NODE_ENV: "test", IRIS_MOCK_WALLET: "true" }),
      fetch: vi.fn(),
      store,
      symbol: () => "SCATTER"
    });

    const first = await service.spin(user, "scatter-win", 100);
    const free = await service.spin(user, "free-spin", 100);

    expect(first).toMatchObject({ wager: 100, awarded: 15, freeSpins: 15 });
    expect(free).toMatchObject({ wager: 0, freeSpins: 29 });
    expect(store.state.players[0]).toMatchObject({ discordUserId: user.id, freeSpins: 29 });
  });
});
