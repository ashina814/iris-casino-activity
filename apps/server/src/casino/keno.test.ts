import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { KenoService, type KenoRound, type KenoRoundStore } from "./keno.js";

class MemoryStore implements KenoRoundStore {
  rounds: KenoRound[] = [];
  load() { return structuredClone(this.rounds); }
  save(rounds: KenoRound[]) { this.rounds = structuredClone(rounds); }
}

function response(wallet: number, status: "reserved" | "settled", payout: number | null) {
  return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "keno-draw-1", sessionId: "keno-draw-1", game: "keno", bet: 100, status, payout } }), { headers: { "content-type": "application/json" } });
}

describe("KenoService", () => {
  it("validates a server-owned draw and settles its paytable result", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(12400, "reserved", null)).mockResolvedValueOnce(response(12700, "settled", 300));
    const service = new KenoService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store: new MemoryStore(), drawn: () => [1, 2, 3, 20, 21, 22, 23, 24, 25, 26] });
    const result = await service.draw({ id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null }, "draw-1", 100, [1, 2, 3, 4, 5]);

    expect(result).toMatchObject({ hits: 3, payout: 300, phase: "settled", wallet: 12700 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
