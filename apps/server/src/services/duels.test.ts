import { describe, expect, it } from "vitest";
import { DuelService, FileDuelStore } from "./duels.js";

const first = { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null };
const second = { id: "345678901234567890", username: "Haru", displayName: "Haru", avatarUrl: null };

describe("DuelService", () => {
  it("persists a five-round queue duel and allows each player to claim once", () => {
    const service = new DuelService(new FileDuelStore(`C:\\tmp\\iris-casino-duels-${Date.now()}.json`));
    const room = `test-${Date.now()}`;
    const waiting = service.queue(first, room, "dice", "R");
    expect(waiting.status).toBe("waiting");
    const duel = service.queue(second, room, "dice", "H");

    expect(duel.status).toBe("active");
    for (let round = 0; round < 5; round += 1) {
      service.action(first.id, duel.id, { type: "pick", category: "low" });
      service.action(second.id, duel.id, { type: "pick", category: "high" });
    }

    const complete = service.state(first.id, duel.id);
    expect(complete.status).toBe("complete");
    expect(complete.history).toHaveLength(5);
    expect(service.claim(first.id, duel.id).alreadyClaimed).toBe(false);
    service.markClaim(first.id, duel.id);
    expect(service.claim(first.id, duel.id).alreadyClaimed).toBe(true);
  });
});
