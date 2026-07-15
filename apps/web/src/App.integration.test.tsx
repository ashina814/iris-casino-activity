import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDiscordAuthorizationCode: vi.fn().mockResolvedValue("discord-code"),
  exchangeAuthCode: vi.fn().mockResolvedValue({
    ok: true,
    user: { id: "234567890123456789", username: "Yuki", displayName: "Yuki", avatarUrl: null }
  })
}));

vi.mock("./lib/discord.js", () => ({ getDiscordAuthorizationCode: mocks.getDiscordAuthorizationCode }));
vi.mock("./lib/api.js", () => ({ exchangeAuthCode: mocks.exchangeAuthCode }));

import { App } from "./App.js";

describe("App", () => {
  it("keeps the Lux entrance visible until its authentication request completes", async () => {
    render(<App />);

    const frame = screen.getByTitle("LUX NOCTIS Treasury Reform");
    expect(frame).toHaveAttribute("src", "/lux-noctis/index.html");
    expect(frame.parentElement).toHaveClass("lux-casino-screen");
    expect(frame.closest("main")).toHaveClass("activity-shell--lux");

    window.dispatchEvent(new MessageEvent("message", {
      origin: "https://untrusted.example",
      data: { type: "iris-activity-authenticate" }
    }));
    expect(mocks.exchangeAuthCode).not.toHaveBeenCalled();

    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      data: { type: "iris-activity-authenticate" }
    }));

    await waitFor(() => {
      expect(mocks.exchangeAuthCode).toHaveBeenCalledWith("discord-code");
      expect(frame).toHaveAttribute(
        "src",
        "/lux-noctis/index.html?discord_id=234567890123456789&name=Yuki&autostart=1"
      );
    });
  });
});
