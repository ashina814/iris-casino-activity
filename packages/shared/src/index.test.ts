import { describe, expect, it } from "vitest";
import {
  AuthExchangeRequestSchema,
  DiscordUserSchema,
  WalletResponseSchema
} from "./index.js";

describe("shared schemas", () => {
  it("validates a Discord user", () => {
    expect(
      DiscordUserSchema.parse({
        id: "234567890123456789",
        username: "Yuki",
        displayName: "Yuki",
        avatarUrl: null
      })
    ).toMatchObject({ displayName: "Yuki" });
  });

  it("rejects an empty auth code", () => {
    expect(() => AuthExchangeRequestSchema.parse({ code: "" })).toThrow();
  });

  it("requires a non-negative Ris wallet", () => {
    expect(() =>
      WalletResponseSchema.parse({ ok: true, wallet: -1, currency: "Ris" })
    ).toThrow();
  });
});
