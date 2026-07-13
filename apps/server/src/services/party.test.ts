import { describe, expect, it } from "vitest";
import { PartyService } from "./party.js";

const user = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };
const appearance = { level: 7, game: "Lobby", glyph: "R" };

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
});
