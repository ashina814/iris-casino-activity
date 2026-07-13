import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { SicBoService, type SicBoRound, type SicBoRoundStore } from "./sicbo.js";

class MemoryStore implements SicBoRoundStore {
  rounds: SicBoRound[] = [];
  load() { return structuredClone(this.rounds); }
  save(rounds: SicBoRound[]) { this.rounds = structuredClone(rounds); }
}

function response(wallet: number, status: "reserved" | "settled", payout: number | null) {
  return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "sicbo-spin-1", sessionId: "sicbo-spin-1", game: "sicbo", bet: 100, status, payout } }), { headers: { "content-type": "application/json" } });
}

describe("SicBoService", () => {
  it("settles server-owned dice with a full wager breakdown", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(12300, "reserved", null)).mockResolvedValueOnce(response(12600, "settled", 300));
    const service = new SicBoService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store: new MemoryStore(), dice: () => [1, 2, 3] });
    const result = await service.roll({ id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null }, "spin-1", [{ selection: "even", amount: 100 }]);

    expect(result).toMatchObject({ dice: [1, 2, 3], payout: 200, phase: "settled", breakdown: [{ selection: "even", multiplier: 2, payout: 200 }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
