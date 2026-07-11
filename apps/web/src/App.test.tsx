import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntranceScreen } from "./screens/EntranceScreen.js";
import { AuthenticatingScreen } from "./screens/AuthenticatingScreen.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";

const user = {
  id: "234567890123456789",
  username: "Yuki",
  displayName: "Yuki",
  avatarUrl: null
};

describe("Activity screens", () => {
  it("renders the entrance screen", () => {
    render(<EntranceScreen onEnter={vi.fn()} />);

    expect(screen.getByText("You're on the list tonight.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discordで入店する" })).toBeInTheDocument();
  });

  it("renders the authenticating screen", () => {
    render(<AuthenticatingScreen />);

    expect(screen.getByText("瞳を確かめています")).toBeInTheDocument();
    expect(
      screen.getByText("記録係のリリスが名簿と照らし合わせています…")
    ).toBeInTheDocument();
  });

  it("renders user information and wallet in the lobby", () => {
    render(
      <LobbyScreen
        user={user}
        wallet={12500}
        walletError={null}
        loadingWallet={false}
        onRefreshWallet={vi.fn()}
      />
    );

    expect(screen.getByText("Yuki")).toBeInTheDocument();
    expect(screen.getByText(/12,500/)).toBeInTheDocument();
    expect(screen.getByText("星詠みルーレット")).toBeInTheDocument();
  });

  it("shows a retry button when wallet fetching fails", () => {
    render(
      <LobbyScreen
        user={user}
        wallet={null}
        walletError="残高を取得できませんでした。"
        loadingWallet={false}
        onRefreshWallet={vi.fn()}
      />
    );

    expect(screen.getByText("残高を取得できませんでした。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行" })).toBeInTheDocument();
  });
});
