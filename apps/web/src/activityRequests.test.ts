import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach, vi } from "vitest";

type Requests = {
  adopt(operation: string, payload: Record<string, unknown>, options: { roundId: string; idField: string }): { id: string };
  setUserScope(scope: string): void;
  fingerprint(value: unknown): string;
};

function requests(): Requests {
  window.eval(readFileSync(resolve(process.cwd(), "public/lux-noctis/activity-requests.js"), "utf8"));
  return (window as unknown as Window & { __IRIS_ACTIVITY_REQUESTS__: Requests }).__IRIS_ACTIVITY_REQUESTS__;
}

function activeRounds() { window.eval(readFileSync(resolve(process.cwd(), "public/lux-noctis/active-rounds.js"), "utf8")); }

describe("activity request v2", () => {
  beforeEach(() => localStorage.clear());

  it("canonically fingerprints nested payloads", () => {
    const api = requests();
    expect(api.fingerprint({ bets: [{ selection: "red", amount: 1000 }] })).not.toBe(api.fingerprint({ bets: [{ selection: "black", amount: 1000 }] }));
    expect(api.fingerprint({ nested: { amount: 1000, selection: "red" } })).toBe(api.fingerprint({ nested: { selection: "red", amount: 1000 } }));
  });

  it("does not create an anonymous request and keeps ids scoped to the authenticated user", () => {
    const api = requests();
    expect(() => api.adopt("war:r:war", { actionId: "a" }, { roundId: "r", idField: "actionId" })).toThrow("Authentication is not ready");
    api.setUserScope("user-a");
    const first = api.adopt("war:r:war", { actionId: "a", action: "war" }, { roundId: "r", idField: "actionId" });
    const retry = api.adopt("war:r:war", { actionId: "different", action: "war" }, { roundId: "r", idField: "actionId" });
    expect(retry.id).toBe(first.id);
    api.setUserScope("user-b");
    const otherUser = api.adopt("war:r:war", { actionId: "b", action: "war" }, { roundId: "r", idField: "actionId" });
    expect(otherUser.id).toBe("b");
  });

  it("keeps an ambiguous conflict pending and reuses its action id", async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === "/api/casino/active-rounds") return new Response(JSON.stringify({ ok: true, userId: "user-a", rounds: [] }), { headers: { "content-type": "application/json" } });
      if (input === "/api/games/war/active-round") return new Response(JSON.stringify({ ok: true, round: { game: "war", roundId: "r", phase: "tie", state: {} } }), { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ ok: false, error: { code: "casino_transaction_conflict" } }), { status: 409, headers: { "content-type": "application/json" } });
    });
    window.fetch = fetchMock as unknown as typeof fetch;
    const api = requests(); api.setUserScope("user-a"); activeRounds();
    await window.fetch("/api/games/war/rounds/r/actions", { method: "POST", body: JSON.stringify({ actionId: "first", action: "war" }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const retry = api.adopt("war:r:war", { actionId: "second", action: "war" }, { roundId: "r", idField: "actionId" });
    expect(retry.id).toBe("first");
  });
});
