import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LuxCasinoScreen } from "./LuxCasinoScreen.js";

describe("LuxCasinoScreen", () => {
  it("passes the authenticated Discord identity to the migrated activity", () => {
    render(
      <LuxCasinoScreen
        user={{
          id: "234567890123456789",
          username: "Yuki",
          displayName: "Yuki",
          avatarUrl: null
        }}
      />
    );

    expect(screen.getByTitle("LUX NOCTIS Treasury Reform")).toHaveAttribute(
      "src",
      "/lux-noctis/index.html?discord_id=234567890123456789&name=Yuki"
    );
  });
});
