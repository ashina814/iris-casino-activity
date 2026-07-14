import { describe, expect, it } from "vitest";
import { PartyService, type PartyStore } from "./party.js";

const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };
const appearance = { level: 7, game: "Lobby", glyph: "R" };

class MemoryPartyStore implements PartyStore {
  state: ReturnType<PartyStore["load"]> = { rooms: {} };
  load() { return structuredClone(this.state); }
  save(state: ReturnType<PartyStore["load"]>) { this.state = structuredClone(state); }
}

describe("PartyService", () => {
  it("derives the party member from the authenticated Discord user and broadcasts safe feed text", () => {
    const party = new PartyService();
    const joined = party.join(user, "night-test", appearance);
    const received: unknown[] = [];
    const unsubscribe = party.subscribe("night-test", user.id, (message) => received.push(message));

    expect(joined.players).toEqual([{ id: user.id, name: "Yuki", ...appearance }]);
    party.publish(user, "night-test", "reaction", { emoji: "OK" });

    expect(received).toEqual([{ type: "feed", item: expect.objectContaining({ text: "Yuki: OK" }) }]);
    unsubscribe?.();
  });

  it("unlocks a Party Crown from trusted wins and limits its recipients to the active room", () => {
    const party = new PartyService();
    const secondUser = { id: "345678901234567890", username: "Haru", displayName: "Haru", avatarUrl: null };
    party.join(user, "night-crown", appearance);
    party.join(secondUser, "night-crown", appearance);
    const received: unknown[] = [];
    party.subscribe("night-crown", user.id, (message) => received.push(message));

    for (let index = 0; index < 6; index += 1) party.recordTrustedWin(user.id, 40_000);

    const crown = received.find((message): message is { type: "crown"; id: string } => Boolean(message && typeof message === "object" && (message as { type?: string }).type === "crown"));
    expect(crown).toBeDefined();
    expect(party.canClaimCrown(user.id, "night-crown", crown!.id)).toBe(true);
    expect(party.canClaimCrown(secondUser.id, "night-crown", crown!.id)).toBe(true);
    expect(party.canClaimCrown("456789012345678901", "night-crown", crown!.id)).toBe(false);
  });

  it("restores Party Crown eligibility after the service restarts", () => {
    const store = new MemoryPartyStore();
    const party = new PartyService({ store });
    party.join(user, "night-restart", appearance);
    for (let index = 0; index < 6; index += 1) party.recordTrustedWin(user.id, 40_000);
    const crownId = store.state.rooms["night-restart"]!.crowns[0]!.id;

    const restarted = new PartyService({ store });
    expect(restarted.canClaimCrown(user.id, "night-restart", crownId)).toBe(true);
  });

  it("builds a persisted Night League only from trusted settled rounds", () => {
    const store = new MemoryPartyStore();
    const party = new PartyService({ store });
    party.join(user, "night-league", appearance);
    expect(party.recordTrustedRound(user.id, 900, 1_800)).toBe(404);

    expect(party.submitLeague(user.id, "night-league")).toMatchObject({
      league: [{ id: user.id, name: "Yuki", glyph: "R", score: 35, rounds: 1, wins: 1, bestReturn: 1_800 }]
    });

    const restarted = new PartyService({ store });
    expect(restarted.submitLeague(user.id, "night-league")?.league[0]).toMatchObject({ score: 35, rounds: 1, wins: 1, bestReturn: 1_800 });
  });
});
