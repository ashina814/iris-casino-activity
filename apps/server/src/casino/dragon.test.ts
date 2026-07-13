import { describe, expect, it, vi } from "vitest";
import { DragonService, type DragonCard, type DragonRound, type DragonRoundStore } from "./dragon.js";
import { loadEnv } from "../env.js";

class MemoryStore implements DragonRoundStore { rounds: DragonRound[] = []; load() { return structuredClone(this.rounds); } save(rounds: DragonRound[]) { this.rounds = structuredClone(rounds); } }
function response(wallet: number, status: "reserved" | "settled", payout: number | null) { return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "dragon-round-1", sessionId: "dragon-round-1", game: "dragon", bet: 100, status, payout } }), { headers: { "content-type": "application/json" } }); }

describe("DragonService", () => {
  it("settles the server cards and preserves a retried round", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(12400, "reserved", null)).mockResolvedValueOnce(response(12600, "settled", 200));
    const cards: DragonCard[] = [{ rank: "K", suit: "S" }, { rank: "2", suit: "H" }];
    const service = new DragonService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store: new MemoryStore(), deck: () => [...cards].reverse() });
    const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };
    const first = await service.deal(user, "round-1", "dragon", 100);
    const retry = await service.deal(user, "round-1", "dragon", 100);
    expect(first).toMatchObject({ outcome: "dragon", payout: 200, wallet: 12600, phase: "settled" });
    expect(retry).toEqual(first); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
