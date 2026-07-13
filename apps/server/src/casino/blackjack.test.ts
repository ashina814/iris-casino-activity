import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { BlackjackService, type BlackjackCard, type BlackjackRoundStore } from "./blackjack.js";

const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };
const env = loadEnv({
  NODE_ENV: "test",
  IRIS_ECONOMY_API_BASE_URL: "http://economy.local",
  IRIS_ECONOMY_API_KEY: "test-economy-api-key"
});

class MemoryStore implements BlackjackRoundStore {
  rounds = [] as ReturnType<BlackjackRoundStore["load"]>;
  load() { return structuredClone(this.rounds); }
  save(rounds: ReturnType<BlackjackRoundStore["load"]>) { this.rounds = structuredClone(rounds); }
}

function response(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
}

function card(rank: BlackjackCard["rank"], suit: BlackjackCard["suit"] = "S"): BlackjackCard {
  return { rank, suit };
}

describe("BlackjackService", () => {
  it("reserves and settles a natural blackjack on server-owned cards", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ ok: true, wallet: 12000, currency: "Ris", transaction: { transactionId: "blackjack-round-1-0", sessionId: "blackjack-round-1", game: "blackjack", bet: 500, status: "reserved", payout: null } }))
      .mockResolvedValueOnce(response({ ok: true, wallet: 13250, currency: "Ris", transaction: { transactionId: "blackjack-round-1-0", sessionId: "blackjack-round-1", game: "blackjack", bet: 500, status: "settled", payout: 1250 } }));
    const service = new BlackjackService({
      env,
      fetch: fetchMock,
      store: new MemoryStore(),
      shoe: () => [card("K"), card("A"), card("7"), card("10")]
    });

    const round = await service.start(user, "round-1", 500);
    const retry = await service.start(user, "round-1", 500);

    expect(service.publicState(round)).toMatchObject({ phase: "settled", wallet: 13250 });
    expect(service.publicState(round).hands[0]).toMatchObject({ value: 21, result: "BLACKJACK" });
    expect(retry).toEqual(round);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses a second reservation for a split hand and settles both hands", async () => {
    const transaction = (id: string, status: "reserved" | "settled", payout: number | null, wallet: number) => ({
      ok: true,
      wallet,
      currency: "Ris",
      transaction: { transactionId: id, sessionId: "blackjack-round-2", game: "blackjack", bet: 100, status, payout }
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(transaction("blackjack-round-2-0", "reserved", null, 9900)))
      .mockResolvedValueOnce(response(transaction("blackjack-round-2-1", "reserved", null, 9800)))
      .mockResolvedValueOnce(response(transaction("blackjack-round-2-0", "settled", 0, 9800)))
      .mockResolvedValueOnce(response(transaction("blackjack-round-2-1", "settled", 200, 10000)));
    const service = new BlackjackService({
      env,
      fetch: fetchMock,
      store: new MemoryStore(),
      shoe: () => [card("K"), card("K"), card("2"), card("8"), card("8"), card("7"), card("10")]
    });

    const started = await service.start(user, "round-2", 100);
    const split = await service.act(user, started.id, "split-1", "split");
    await service.act(user, split.id, "stand-1", "stand");
    await service.act(user, split.id, "stand-1", "stand");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const settled = await service.act(user, split.id, "stand-2", "stand");

    expect(service.publicState(settled)).toMatchObject({ phase: "settled", wallet: 10000 });
    expect(service.publicState(settled).hands).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
