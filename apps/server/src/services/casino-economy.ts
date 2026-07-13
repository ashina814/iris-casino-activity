import {
  CasinoMutationResponseSchema,
  CasinoReservationRequestSchema,
  CasinoSettlementRequestSchema,
  type CasinoMutationResponse,
  type CasinoReservationRequest,
  type CasinoSettlementRequest
} from "@iris/shared";
import { z } from "zod";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const economyErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1)
  })
});

type MockTransaction = {
  transactionId: string;
  sessionId: string;
  game: string;
  bet: number;
  discordUserId: string;
  status: "reserved" | "settled" | "cancelled";
  payout: number | null;
};

const mockWallets = new Map<string, number>();
const mockTransactions = new Map<string, MockTransaction>();

export function getMockCasinoWallet(discordUserId: string): number {
  return mockWallets.get(discordUserId) ?? 12500;
}

export async function reserveCasinoBet(
  input: CasinoReservationRequest,
  env: ServerEnv,
  fetchFn: FetchLike
): Promise<CasinoMutationResponse> {
  const parsed = CasinoReservationRequestSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(400, "bad_request", "Casino reservation is invalid.");
  }

  return requestCasinoMutation("/internal/v1/casino/reservations", parsed.data, env, fetchFn);
}

export async function settleCasinoReservation(
  transactionId: string,
  input: CasinoSettlementRequest,
  env: ServerEnv,
  fetchFn: FetchLike
): Promise<CasinoMutationResponse> {
  const settlement = CasinoSettlementRequestSchema.safeParse(input);
  if (!settlement.success || !isCasinoIdentifier(transactionId)) {
    throw new AppError(400, "bad_request", "Casino settlement is invalid.");
  }

  return requestCasinoMutation(
    `/internal/v1/casino/reservations/${encodeURIComponent(transactionId)}/settle`,
    settlement.data,
    env,
    fetchFn
  );
}

export async function cancelCasinoReservation(
  transactionId: string,
  env: ServerEnv,
  fetchFn: FetchLike
): Promise<CasinoMutationResponse> {
  if (!isCasinoIdentifier(transactionId)) {
    throw new AppError(400, "bad_request", "Casino cancellation is invalid.");
  }

  return requestCasinoMutation(
    `/internal/v1/casino/reservations/${encodeURIComponent(transactionId)}/cancel`,
    {},
    env,
    fetchFn
  );
}

async function requestCasinoMutation(
  path: string,
  body: Record<string, unknown>,
  env: ServerEnv,
  fetchFn: FetchLike
): Promise<CasinoMutationResponse> {
  if (env.IRIS_MOCK_WALLET) {
    return mockCasinoMutation(path, body);
  }

  if (!env.IRIS_ECONOMY_API_KEY) {
    throw new AppError(503, "economy_unavailable", "Casino economy is unavailable.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ECONOMY_API_TIMEOUT_MS);
  const baseUrl = env.IRIS_ECONOMY_API_BASE_URL.replace(/\/+$/, "");

  let response: Response;
  try {
    response = await fetchFn(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${env.IRIS_ECONOMY_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new AppError(504, "economy_timeout", "Casino economy timed out.");
    }
    throw new AppError(502, "economy_unavailable", "Casino economy is unavailable.");
  } finally {
    clearTimeout(timeout);
  }

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw mapEconomyFailure(response.status, payload);
  }

  const parsed = CasinoMutationResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError(502, "invalid_economy_response", "Casino economy response was invalid.");
  }

  return parsed.data;
}

function mockCasinoMutation(path: string, body: Record<string, unknown>): CasinoMutationResponse {
  if (path === "/internal/v1/casino/reservations") {
    const reservation = CasinoReservationRequestSchema.parse(body);
    const existing = mockTransactions.get(reservation.transactionId);
    if (existing) return mockResponse(existing);

    const wallet = getMockCasinoWallet(reservation.discordUserId);
    if (wallet < reservation.bet) {
      throw new AppError(409, "insufficient_funds", "Insufficient Ris balance.");
    }
    const transaction: MockTransaction = {
      transactionId: reservation.transactionId,
      sessionId: reservation.sessionId,
      game: reservation.game,
      bet: reservation.bet,
      discordUserId: reservation.discordUserId,
      status: "reserved",
      payout: null
    };
    mockWallets.set(reservation.discordUserId, wallet - reservation.bet);
    mockTransactions.set(transaction.transactionId, transaction);
    return mockResponse(transaction);
  }

  const match = path.match(/^\/internal\/v1\/casino\/reservations\/([^/]+)\/(settle|cancel)$/);
  if (!match) throw new AppError(404, "casino_transaction_not_found", "Casino transaction was not found.");
  const transaction = mockTransactions.get(decodeURIComponent(match[1]!));
  if (!transaction) throw new AppError(404, "casino_transaction_not_found", "Casino transaction was not found.");

  if (match[2] === "settle") {
    const settlement = CasinoSettlementRequestSchema.parse(body);
    if (transaction.status === "reserved") {
      transaction.status = "settled";
      transaction.payout = settlement.payout;
      mockWallets.set(transaction.discordUserId, (mockWallets.get(transaction.discordUserId) ?? 0) + settlement.payout);
    }
  } else if (transaction.status === "reserved") {
    transaction.status = "cancelled";
    mockWallets.set(transaction.discordUserId, (mockWallets.get(transaction.discordUserId) ?? 0) + transaction.bet);
  }

  return mockResponse(transaction);
}

function mockResponse(transaction: MockTransaction): CasinoMutationResponse {
  return {
    ok: true,
    wallet: mockWallets.get(transaction.discordUserId) ?? 0,
    currency: "Ris",
    transaction: {
      transactionId: transaction.transactionId,
      sessionId: transaction.sessionId,
      game: transaction.game,
      bet: transaction.bet,
      status: transaction.status,
      payout: transaction.payout
    }
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function mapEconomyFailure(status: number, payload: unknown): AppError {
  const parsedError = economyErrorSchema.safeParse(payload);
  const remoteCode = parsedError.success ? parsedError.data.error.code : undefined;

  if (remoteCode === "ECONOMY_NOT_JOINED" || status === 403) {
    return new AppError(409, "economy_not_joined", "IRIS Economy is not joined yet.");
  }
  if (remoteCode === "INSUFFICIENT_FUNDS") {
    return new AppError(409, "insufficient_funds", "Insufficient Ris balance.");
  }
  if (remoteCode === "BET_OUT_OF_RANGE") {
    return new AppError(400, "bet_out_of_range", "Bet is outside the allowed range.");
  }
  if (remoteCode === "PAYOUT_OUT_OF_RANGE") {
    return new AppError(400, "payout_out_of_range", "Payout is outside the allowed range.");
  }
  if (remoteCode === "TRANSACTION_NOT_FOUND" || status === 404) {
    return new AppError(404, "casino_transaction_not_found", "Casino transaction was not found.");
  }
  if (status === 409) {
    return new AppError(409, "casino_transaction_conflict", "Casino transaction is not in a valid state.");
  }

  return new AppError(502, "economy_unavailable", "Casino economy is unavailable.");
}

function isCasinoIdentifier(value: string): boolean {
  return /^[A-Za-z0-9:_.-]{1,128}$/.test(value);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}
