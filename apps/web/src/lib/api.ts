import {
  ApiErrorSchema,
  MeResponseSchema,
  WalletResponseSchema,
  type ApiErrorCode,
  type MeResponse,
  type WalletResponse
} from "@iris/shared";
import type { z } from "zod";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function exchangeAuthCode(code: string): Promise<MeResponse> {
  return requestJson("/api/auth/exchange", MeResponseSchema, {
    method: "POST",
    body: JSON.stringify({ code })
  });
}

export async function getCurrentUser(): Promise<MeResponse> {
  return requestJson("/api/me", MeResponseSchema);
}

export async function getWallet(): Promise<WalletResponse> {
  return requestJson("/api/wallet", WalletResponseSchema);
}

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers
    }
  });

  const payload = await readJson(response);

  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      throw new ApiClientError(
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.message
      );
    }

    throw new ApiClientError(
      response.status,
      "internal_error",
      "Activity backend request failed."
    );
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiClientError(
      response.status,
      "internal_error",
      "Activity backend returned an unexpected response."
    );
  }

  return parsed.data;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? "";
}
