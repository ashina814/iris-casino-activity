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
    const fetchMock = vi.fn(async (url: string | URL) => {
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
});
