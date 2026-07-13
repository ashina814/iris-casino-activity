import { describe, expect, it, vi } from "vitest";
import { loadEnv } from "../env.js";
import { AppError } from "../errors.js";
import {
  cancelCasinoReservation,
  reserveCasinoBet,
  settleCasinoReservation
} from "./casino-economy.js";

const env = loadEnv({
  NODE_ENV: "test",
  IRIS_ECONOMY_API_BASE_URL: "http://economy.local",
  IRIS_ECONOMY_API_KEY: "test-economy-api-key",
  ECONOMY_API_TIMEOUT_MS: "20"
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

const transaction = {
  transactionId: "round-123",
  sessionId: "session-123",
  game: "blackjack",
  bet: 500,
  status: "reserved" as const,
  payout: null
};

describe("Casino Economy client", () => {
  it("reserves a bet through the internal Economy API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ ok: true, wallet: 12000, currency: "Ris", transaction })
    );

    const result = await reserveCasinoBet(
      {
        transactionId: "round-123",
        discordUserId: "234567890123456789",
        sessionId: "session-123",
        game: "blackjack",
        bet: 500
      },
      env,
      fetchMock
    );

    expect(result.wallet).toBe(12000);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://economy.local/internal/v1/casino/reservations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer test-economy-api-key" }),
        body: JSON.stringify({
          transactionId: "round-123",
          discordUserId: "234567890123456789",
          sessionId: "session-123",
          game: "blackjack",
          bet: 500
        })
      })
    );
  });

  it("settles and cancels by the server-owned transaction id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          ok: true,
          wallet: 13000,
          currency: "Ris",
          transaction: { ...transaction, status: "settled", payout: 1500 }
        })
      )
      .mockResolvedValueOnce(
        response({
          ok: true,
          wallet: 12500,
          currency: "Ris",
          transaction: { ...transaction, status: "cancelled" }
        })
      );

    await settleCasinoReservation("round-123", { payout: 1500 }, env, fetchMock);
    await cancelCasinoReservation("round-123", env, fetchMock);

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://economy.local/internal/v1/casino/reservations/round-123/settle"
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "http://economy.local/internal/v1/casino/reservations/round-123/cancel"
    );
  });

  it("maps insufficient funds without exposing the Economy response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ ok: false, error: { code: "INSUFFICIENT_FUNDS", message: "internal details" } }, 409)
    );

    await expect(
      reserveCasinoBet(
        {
          transactionId: "round-123",
          discordUserId: "234567890123456789",
          sessionId: "session-123",
          game: "blackjack",
          bet: 500
        },
        env,
        fetchMock
      )
    ).rejects.toMatchObject({ code: "insufficient_funds", status: 409 } satisfies Partial<AppError>);
  });

  it("rejects malformed transaction ids before making a request", async () => {
    const fetchMock = vi.fn();

    await expect(cancelCasinoReservation("bad/id", env, fetchMock)).rejects.toMatchObject({
      code: "bad_request",
      status: 400
    } satisfies Partial<AppError>);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps reserve and settle behavior available in local mock mode", async () => {
    const mockEnv = loadEnv({ NODE_ENV: "test", IRIS_MOCK_WALLET: "true" });
    const fetchMock = vi.fn();
    const input = {
      transactionId: "mock-round-001",
      discordUserId: "999999999999999999",
      sessionId: "mock-session-001",
      game: "blackjack",
      bet: 500
    };

    const reserved = await reserveCasinoBet(input, mockEnv, fetchMock);
    const settled = await settleCasinoReservation(input.transactionId, { payout: 1000 }, mockEnv, fetchMock);

    expect(reserved.wallet).toBe(12000);
    expect(settled.wallet).toBe(13000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
