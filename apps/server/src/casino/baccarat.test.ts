import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { BaccaratService, type BaccaratCard, type BaccaratRound, type BaccaratRoundStore } from "./baccarat.js";

class MemoryStore implements BaccaratRoundStore {
  rounds: BaccaratRound[] = [];
  load() { return structuredClone(this.rounds); }
  save(rounds: BaccaratRound[]) { this.rounds = structuredClone(rounds); }
}

function response(wallet: number, status: "reserved" | "settled", payout: number | null) {
  return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "baccarat-round-1", sessionId: "baccarat-round-1", game: "baccarat", bet: 100, status, payout } }), { headers: { "content-type": "application/json" } });
}

describe("BaccaratService", () => {
  it("uses server-owned cards and settles a player win", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(12400, "reserved", null)).mockResolvedValueOnce(response(12600, "settled", 200));
    const dealOrder: BaccaratCard[] = [
      { rank: "A", suit: "S" }, { rank: "2", suit: "H" }, { rank: "8", suit: "D" }, { rank: "3", suit: "C" }
    ];
    const service = new BaccaratService({
      env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }),
      fetch: fetchMock,
      store: new MemoryStore(),
      deck: () => [...dealOrder].reverse()
    });

    const result = await service.deal({ id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null }, "round-1", [{ selection: "player", amount: 100 }]);

    expect(result).toMatchObject({ outcome: "player", payout: 200, wallet: 12600, phase: "settled" });
    expect(result.player.map((card) => card.rank)).toEqual(["A", "8"]);
    expect(result.banker.map((card) => card.rank)).toEqual(["2", "3"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
