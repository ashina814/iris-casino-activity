import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

const baseEnv = {
  NODE_ENV: "test",
  SESSION_SECRET: "test-session-secret-with-enough-length",
  WEB_ORIGIN: "http://localhost:5173",
  IRIS_MOCK_AUTH: "true",
  IRIS_MOCK_WALLET: "false",
  IRIS_ECONOMY_API_BASE_URL: "http://economy.local",
  IRIS_ECONOMY_API_KEY: "super-secret-economy-key",
  ECONOMY_API_TIMEOUT_MS: "20"
};

const silentLogger = {
  error: vi.fn()
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function appWith(fetch = vi.fn()) {
  return createApp({
    env: baseEnv,
    fetch,
    logger: silentLogger
  });
}

async function authenticatedAgent(fetch = vi.fn()) {
  const agent = request.agent(appWith(fetch));
  await agent.post("/api/auth/exchange").send({ code: "mock-code" }).expect(200);
  return agent;
}

describe("server API", () => {
  it("returns health without secrets", async () => {
    const res = await request(appWith()).get("/api/health").expect(200);

    expect(res.body).toEqual({
      ok: true,
      service: "iris-casino-activity",
      version: "0.1.0"
    });
    expect(JSON.stringify(res.body)).not.toContain("super-secret");
  });

  it("returns 401 for unauthenticated /api/me", async () => {
    const res = await request(appWith()).get("/api/me").expect(401);

    expect(res.body.error.code).toBe("unauthorized");
  });

  it("returns the current user after mock authentication", async () => {
    const agent = await authenticatedAgent();
    const res = await agent.get("/api/me").expect(200);

    expect(res.body.user).toMatchObject({
      id: "234567890123456789",
      username: "Yuki",
      displayName: "Yuki",
      avatarUrl: null
    });
  });

  it("returns 401 for unauthenticated /api/wallet", async () => {
    const res = await request(appWith()).get("/api/wallet").expect(401);

    expect(res.body.error.code).toBe("unauthorized");
  });

  it("converts a successful Economy API wallet response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ wallet: 12500, currency: "Ris" })
    );
    const agent = await authenticatedAgent(fetchMock);

    const res = await agent.get("/api/wallet").expect(200);

    expect(res.body).toEqual({ ok: true, wallet: 12500, currency: "Ris" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://economy.local/internal/v1/wallets/234567890123456789",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer super-secret-economy-key"
        })
      })
    );
  });

  it("maps Economy API 404 to user_not_registered", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "nope" }, 404));
    const agent = await authenticatedAgent(fetchMock);

    const res = await agent.get("/api/wallet").expect(404);

    expect(res.body.error.code).toBe("user_not_registered");
  });

  it("maps Economy API timeout to economy_timeout", async () => {
    const fetchMock = vi.fn((_url: string | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        });
      });
    });
    const agent = await authenticatedAgent(fetchMock);

    const res = await agent.get("/api/wallet").expect(504);

    expect(res.body.error.code).toBe("economy_timeout");
  });

  it("maps invalid Economy API response shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ wallet: "12500", currency: "Ris" })
    );
    const agent = await authenticatedAgent(fetchMock);

    const res = await agent.get("/api/wallet").expect(502);

    expect(res.body.error.code).toBe("invalid_economy_response");
  });

  it("does not expose secrets in error responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ message: "super-secret-economy-key" }, 500)
    );
    const agent = await authenticatedAgent(fetchMock);

    const res = await agent.get("/api/wallet").expect(502);

    expect(JSON.stringify(res.body)).not.toContain("super-secret-economy-key");
    expect(JSON.stringify(res.body)).not.toContain("Authorization");
  });
});
