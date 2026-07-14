import { describe, expect, it, vi } from "vitest";
import { ActivityEconomyService, type ActivityProgressStore } from "./activity-economy.js";
import { loadEnv } from "../env.js";

class MemoryStore implements ActivityProgressStore {
  state = { users: {} };
  load() { return structuredClone(this.state); }
  save(state: typeof this.state) { this.state = structuredClone(state); }
}

const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };
const env = loadEnv({ NODE_ENV: "test", IRIS_ECONOMY_API_BASE_URL: "http://economy.local", IRIS_ECONOMY_API_KEY: "test-key" });

describe("ActivityEconomyService missions", () => {
  it("awards a server-recorded daily mission once even when its round is retried", async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url).includes("/activity/adjustments")) return new Response(JSON.stringify({ ok: true, wallet: 5600, currency: "Ris" }), { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } });
    });
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });
    const status = await service.missionStatus(user);
    const mission = status.items[0]!;
    const events = mission.event === "round" ? {} : mission.event === "win" ? {} : mission.event === "wager" ? {} : { [mission.event]: mission.target };
    const wager = mission.event === "wager" ? mission.target : 100;
    const payout = mission.event === "win" ? 200 : 0;

    let first;
    for (let index = 0; index < (mission.event === "round" ? mission.target : 1); index += 1) {
      first = await service.recordMissionRound(user, { id: `trusted-round-${index}`, wager, payout, events });
    }
    await service.recordMissionRound(user, { id: `trusted-round-${mission.event === "round" ? mission.target - 1 : 0}`, wager, payout, events });

    expect(first?.awarded).toContainEqual({ id: mission.id, amount: mission.reward });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/activity/adjustments"))).toHaveLength(1);
  });

  it("charges and settles Eclipse Vault through a single RIS adjustment", async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
      if (String(url).includes("/activity/adjustments")) return new Response(JSON.stringify({ ok: true, wallet: 9000, currency: "Ris" }), { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ wallet: 5000, currency: "Ris" }), { headers: { "content-type": "application/json" } });
    });
    const service = new ActivityEconomyService({ env, fetch: fetchMock, store: new MemoryStore() });

    for (let index = 0; index < 10; index += 1) {
      await service.recordMissionRound(user, { id: `vault-round-${index}`, wager: 20_000, payout: 20_001 });
    }
    const ready = await service.vaultStatus(user);
    expect(ready).toMatchObject({ pot: 5000, charge: 100, ready: true, claims: 0 });

    const claimed = await service.claimVault(user, 0);
    expect([500, 1250, 2500, 5000]).toContain(claimed.amount);
    expect(claimed).toMatchObject({ charge: 0, ready: false, claims: 1, wallet: 9000, currency: "Ris" });
    const adjustmentBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).includes("/activity/adjustments"))
      .map(([, init]) => JSON.parse(String((init as RequestInit).body)) as { reason: string });
    expect(adjustmentBodies.filter((body) => body.reason === "vault")).toHaveLength(1);
  });
});
