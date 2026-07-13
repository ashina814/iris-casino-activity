import { describe, expect, it, vi } from "vitest";
import { CrapsService, type CrapsRound, type CrapsRoundStore } from "./craps.js";
import { loadEnv } from "../env.js";

class MemoryStore implements CrapsRoundStore { rounds: CrapsRound[] = []; load() { return structuredClone(this.rounds); } save(rounds: CrapsRound[]) { this.rounds = structuredClone(rounds); } }
function response(wallet: number, status: "reserved" | "settled", payout: number | null) { return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "craps-round-1", sessionId: "craps-round-1", game: "craps", bet: 100, status, payout } }), { headers: { "content-type": "application/json" } }); }

describe("CrapsService", () => {
  it("keeps one reservation active until a point is made", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(12400, "reserved", null)).mockResolvedValueOnce(response(12600, "settled", 200));
    const service = new CrapsService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store: new MemoryStore(), dice: () => [2, 2] });
    const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };
    const first = await service.start(user, "round-1", "pass", 100);
    expect(first).toMatchObject({ phase: "active", point: 4, dice: [2, 2], wallet: 12400 });
    const settled = await service.roll(user, "round-1", "roll-2");
    const retry = await service.roll(user, "round-1", "roll-2");
    expect(settled).toMatchObject({ phase: "settled", payout: 200, point: null, wallet: 12600 });
    expect(retry).toEqual(settled);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
