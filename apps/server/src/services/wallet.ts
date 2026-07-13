import { z } from "zod";
import type { ServerEnv } from "../env.js";
import { AppError } from "../errors.js";
import { getMockCasinoWallet } from "./casino-economy.js";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const economyWalletSchema = z.object({
  wallet: z.number().int().nonnegative(),
  currency: z.literal("Ris").default("Ris")
});

export type WalletResult = z.infer<typeof economyWalletSchema>;

export async function getWalletForDiscordUser(
  discordUserId: string,
  env: ServerEnv,
  fetchFn: FetchLike
): Promise<WalletResult> {
  if (env.IRIS_MOCK_WALLET) {
    return { wallet: getMockCasinoWallet(discordUserId), currency: "Ris" };
  }

  if (!env.IRIS_ECONOMY_API_KEY) {
    throw new AppError(503, "economy_unavailable", "Wallet service is unavailable.");
  }

  const baseUrl = env.IRIS_ECONOMY_API_BASE_URL.replace(/\/+$/, "");
  const url = `${baseUrl}/internal/v1/wallets/${encodeURIComponent(discordUserId)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.ECONOMY_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${env.IRIS_ECONOMY_API_KEY}`,
        accept: "application/json"
      },
      signal: controller.signal
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new AppError(504, "economy_timeout", "Wallet service timed out.");
    }
    throw new AppError(502, "economy_unavailable", "Wallet service is unavailable.");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 404) {
    throw new AppError(404, "user_not_registered", "IRIS Economy user is not registered.");
  }

  if (response.status === 409 || response.status === 422) {
    throw new AppError(409, "economy_not_joined", "IRIS Economy is not joined yet.");
  }

  if (!response.ok) {
    throw new AppError(502, "economy_unavailable", "Wallet service is unavailable.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AppError(502, "invalid_economy_response", "Wallet response was invalid.");
  }

  const parsed = economyWalletSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError(502, "invalid_economy_response", "Wallet response was invalid.");
  }

  return parsed.data;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (
    error instanceof Error && error.name === "AbortError"
  );
}
