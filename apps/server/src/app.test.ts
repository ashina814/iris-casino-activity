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
  LEGACY_GAMES_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-legacy.json",
  ACTIVITY_PROGRESS_STATE_PATH: "C:\\tmp\\iris-casino-activity-test-progress.json"
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

  it("uses the authenticated Discord identity for Party rooms", async () => {
    const agent = await authenticatedAgent();
    const joined = await agent.post("/api/party/join").send({
      room: "night-test",
      appearance: { level: 7, game: "Lobby", glyph: "R" },
      name: "forged-name"
    }).expect(200);

    expect(joined.body.players).toEqual([{ id: "234567890123456789", name: "Yuki", level: 7, game: "Lobby", glyph: "R" }]);

    const event = await agent.post("/api/party/events").send({
      room: "night-test",
      kind: "reaction",
      payload: { emoji: "OK" }
    }).expect(200);
    expect(event.body.feed[0]).toMatchObject({ text: "Yuki: OK" });
  });

  it("returns the server-owned Night League after the user joins the room", async () => {
    const agent = await authenticatedAgent();
    await agent.post("/api/party/join").send({
      room: "night-league",
      appearance: { level: 7, game: "Lobby", glyph: "R" }
    }).expect(200);

    const synced = await agent.post("/api/league/submit").send({
      room: "night-league",
      score: 999_999_999,
      rounds: 9_999,
      wins: 9_999,
      bestReturn: 999_999_999
    }).expect(200);

    expect(synced.body).toMatchObject({ ok: true, league: [] });
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

  it("moves the daily gift and its reward reserve to the server-side RIS ledger", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ wallet: 25000, currency: "Ris" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, wallet: 26150, currency: "Ris" }))
      .mockResolvedValueOnce(jsonResponse({ wallet: 26150, currency: "Ris" }));
    const app = createApp({
      env: {
        ...baseEnv,
        ACTIVITY_PROGRESS_STATE_PATH: `C:\\tmp\\iris-casino-activity-test-progress-${Date.now()}.json`
      },
      fetch: fetchMock,
      logger: console
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/exchange").send({ code: "mock-code" }).expect(200);

    const claim = await agent.post("/api/economy/daily/claim").expect(200);

    expect(claim.body.daily).toMatchObject({
      claimed: true,
      amount: 1150,
      requested: 1150,
      notesAwarded: 0,
      reserve: 1850,
      notes: 0,
      wallet: 26150,
      currency: "Ris"
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://economy.local/internal/v1/activity/adjustments",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"reason":"daily"'),
        headers: expect.objectContaining({ authorization: "Bearer super-secret-economy-key" })
      })
    );

    const status = await agent.get("/api/economy/daily").expect(200);
    expect(status.body.daily).toMatchObject({ claimed: true, reserve: 1850, wallet: 26150 });
  });

  it("moves the one-time low-balance relief grant to the RIS ledger", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ wallet: 50, currency: "Ris" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, wallet: 2500, currency: "Ris" }))
      .mockResolvedValueOnce(jsonResponse({ wallet: 2500, currency: "Ris" }));
    const app = createApp({
      env: {
        ...baseEnv,
        ACTIVITY_PROGRESS_STATE_PATH: `C:\\tmp\\iris-casino-activity-test-relief-${Date.now()}.json`
      },
      fetch: fetchMock,
      logger: silentLogger
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/exchange").send({ code: "mock-code" }).expect(200);

    const claim = await agent.post("/api/economy/relief").expect(200);

    expect(claim.body.relief).toEqual({ claimed: true, amount: 2450, wallet: 2500, currency: "Ris" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://economy.local/internal/v1/activity/adjustments",
      expect.objectContaining({ body: expect.stringContaining('"reason":"relief"') })
    );

    const duplicate = await agent.post("/api/economy/relief").expect(200);
    expect(duplicate.body.relief).toEqual({ claimed: false, amount: 0, wallet: 2500, currency: "Ris" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("settles treasury coin purchases through one idempotent RIS debit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ wallet: 40000, currency: "Ris" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, wallet: 32000, currency: "Ris" }))
      .mockResolvedValueOnce(jsonResponse({ wallet: 32000, currency: "Ris" }));
    const app = createApp({
      env: {
        ...baseEnv,
        ACTIVITY_PROGRESS_STATE_PATH: `C:\\tmp\\iris-casino-activity-test-treasury-${Date.now()}.json`
      },
      fetch: fetchMock,
      logger: silentLogger
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/exchange").send({ code: "mock-code" }).expect(200);

    const purchase = await agent.post("/api/economy/treasury/purchases").send({
      purchaseId: "treasury001",
      itemId: "stardust",
      pay: "coins"
    }).expect(200);

    expect(purchase.body.treasury).toMatchObject({
      itemId: "stardust",
      pay: "coins",
      wallet: 32000,
      notes: 0,
      purchases: { stardust: 1 }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://economy.local/internal/v1/activity/adjustments",
      expect.objectContaining({ body: expect.stringContaining('"reason":"treasury"') })
    );

    const duplicate = await agent.post("/api/economy/treasury/purchases").send({
      purchaseId: "treasury001",
      itemId: "stardust",
      pay: "coins"
    }).expect(200);
    expect(duplicate.body.treasury).toMatchObject({ wallet: 32000, purchases: { stardust: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
