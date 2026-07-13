import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { PokerService, type PokerCard, type PokerRound, type PokerRoundStore } from "./poker.js";

class MemoryStore implements PokerRoundStore {
  rounds: PokerRound[] = [];
  load() { return structuredClone(this.rounds); }
  save(rounds: PokerRound[]) { this.rounds = structuredClone(rounds); }
}

function response(wallet: number, status: "reserved" | "settled", payout: number | null) {
  return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "poker-round-1", sessionId: "poker-round-1", game: "poker", bet: 100, status, payout } }), { headers: { "content-type": "application/json" } });
}

describe("PokerService", () => {
  it("reserves on deal and settles exactly once after the player draws", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(12400, "reserved", null)).mockResolvedValueOnce(response(12400, "settled", 0));
    const cards: PokerCard[] = [
      { rank: "A", suit: "S" }, { rank: "K", suit: "H" }, { rank: "3", suit: "D" }, { rank: "4", suit: "C" }, { rank: "7", suit: "S" }
    ];
    const service = new PokerService({
      env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }),
      fetch: fetchMock,
      store: new MemoryStore(),
      deck: () => [...cards].reverse()
    });
    const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };

    const dealt = await service.deal(user, "round-1", 100);
    expect(dealt).toMatchObject({ phase: "holding", wallet: 12400 });
    const result = await service.draw(user, "round-1", [true, true, true, true, true]);
    const retry = await service.draw(user, "round-1", [true, true, true, true, true]);

    expect(result).toMatchObject({ phase: "settled", payout: 0, result: { id: "none" } });
    expect(retry).toEqual(result);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
