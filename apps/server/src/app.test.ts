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
  ECONOMY_API_TIMEOUT_MS: "20",
  CASINO_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-blackjack.json",
  ROULETTE_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-roulette.json",
  SLOTS_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-slots.json",
  BACCARAT_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-baccarat.json",
  POKER_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-poker.json",
  SICBO_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-sicbo.json",
  KENO_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-keno.json",
  DRAGON_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-dragon.json",
  WHEEL_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-wheel.json",
  CRAPS_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-craps.json",
  PLINKO_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-plinko.json",
  HILO_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-hilo.json",
  MINES_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-mines.json",
  WAR_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-war.json",
  BINGO_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-bingo.json",
  SCRATCH_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-scratch.json",
  LEGACY_GAMES_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-legacy.json"
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
    const app = appWith();
    await app.locals.reconciliation;
    const res = await request(app).get("/api/health").expect(200);

    expect(res.body).toEqual({
      ok: true,
      service: "iris-casino-activity",
      version: "0.1.0"
    });
    expect(JSON.stringify(res.body)).not.toContain("super-secret");
  });

  it("exposes only the public Activity runtime configuration", async () => {
    const res = await request(appWith()).get("/api/config").expect(200);

    expect(res.body).toEqual({ ok: true, discordClientId: "", mockAuth: true });
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

  it("sets a partitioned secure session cookie for the Discord Activity proxy", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "discord-token", token_type: "Bearer" }))
      .mockResolvedValueOnce(jsonResponse({ id: "234567890123456789", username: "Yuki", global_name: "Yuki", avatar: null }));
    const app = createApp({
      env: {
        ...baseEnv,
        NODE_ENV: "production",
        WEB_ORIGIN: "https://casino.iris.example",
        DISCORD_ACTIVITY_MODE: "true",
        ACTIVITY_COOKIE_DOMAIN: "1234567890.discordsays.com",
        DISCORD_CLIENT_ID: "1234567890",
        DISCORD_CLIENT_SECRET: "discord-client-secret",
        DISCORD_REDIRECT_URI: "https://127.0.0.1",
        IRIS_MOCK_AUTH: "false",
        IRIS_MOCK_WALLET: "false"
      },
      fetch: fetchMock,
      logger: silentLogger
    });

    const res = await request(app)
      .post("/api/auth/exchange")
      .set("Origin", "https://1234567890.discordsays.com")
      .set("X-Forwarded-Proto", "https")
      .send({ code: "discord-authorization-code" })
      .expect(200);

    const cookie = String(res.headers["set-cookie"] ?? "").toLowerCase();
    expect(cookie).toContain("domain=1234567890.discordsays.com");
    expect(cookie).toContain("samesite=none");
    expect(cookie).toContain("secure");
    expect(cookie).toContain("partitioned");
  });

  it("permits the Discord Activity iframe only in Activity mode", async () => {
    const app = createApp({
      env: {
        ...baseEnv,
        DISCORD_ACTIVITY_MODE: "true",
        DISCORD_CLIENT_ID: "1234567890"
      },
      logger: silentLogger
    });

    const res = await request(app).get("/api/health").expect(200);
    const policy = String(res.headers["content-security-policy"] ?? "");

    expect(res.headers["x-frame-options"]).toBeUndefined();
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toContain("https://discord.com");
    expect(policy).toContain("https://*.discord.com");
    expect(policy).toContain("https://discordapp.com");
    expect(policy).toContain("https://*.discordapp.com");
    expect(policy).toContain("https://*.discordsays.com");
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
