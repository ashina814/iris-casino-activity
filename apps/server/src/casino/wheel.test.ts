import { describe, expect, it, vi } from "vitest";
import { WheelService, type WheelRound, type WheelRoundStore } from "./wheel.js";
import { loadEnv } from "../env.js";

class MemoryStore implements WheelRoundStore { rounds: WheelRound[] = []; load() { return structuredClone(this.rounds); } save(rounds: WheelRound[]) { this.rounds = structuredClone(rounds); } }
function response(wallet: number, status: "reserved" | "settled", payout: number | null) { return new Response(JSON.stringify({ ok: true, wallet, currency: "Ris", transaction: { transactionId: "wheel-spin-1", sessionId: "wheel-spin-1", game: "wheel", bet: 100, status, payout } }), { headers: { "content-type": "application/json" } }); }

describe("WheelService", () => {
  it("settles a server-selected multiplier", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(12400, "reserved", null)).mockResolvedValueOnce(response(13200, "settled", 800));
    const service = new WheelService({ env: loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-economy-api-key" }), fetch: fetchMock, store: new MemoryStore(), index: () => 0 });
    const result = await service.spin({ id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null }, "spin-1", 100);
    expect(result).toMatchObject({ index: 0, multiplier: 8, payout: 800, phase: "settled", wallet: 13200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
