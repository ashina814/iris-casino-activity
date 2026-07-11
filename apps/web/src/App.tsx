import type { DiscordUser } from "@iris/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { AuthenticatingScreen } from "./screens/AuthenticatingScreen.js";
import { EntranceScreen } from "./screens/EntranceScreen.js";
import { ErrorScreen } from "./screens/ErrorScreen.js";
import { LobbyScreen } from "./screens/LobbyScreen.js";
import { OpeningScreen } from "./screens/OpeningScreen.js";
import { exchangeAuthCode, getWallet } from "./lib/api.js";
import { getDiscordAuthorizationCode } from "./lib/discord.js";

type Screen = "entrance" | "authenticating" | "opening" | "lobby" | "error";

export function App() {
  const [screen, setScreen] = useState<Screen>("entrance");
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [wallet, setWallet] = useState<number | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const openingTimer = useRef<number | null>(null);

  const refreshWallet = useCallback(async () => {
    setLoadingWallet(true);
    setWalletError(null);

    try {
      const response = await getWallet();
      setWallet(response.wallet);
    } catch {
      setWallet(null);
      setWalletError("残高を取得できませんでした。時間をおいて再試行してください。");
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (openingTimer.current !== null) {
        window.clearTimeout(openingTimer.current);
      }
    };
  }, []);

  async function enterLounge() {
    setFatalError(null);
    setScreen("authenticating");

    try {
      const code = await getDiscordAuthorizationCode();
      const response = await exchangeAuthCode(code);
      setUser(response.user);
      setScreen("opening");

      openingTimer.current = window.setTimeout(() => {
        setScreen("lobby");
        void refreshWallet();
      }, 1100);
    } catch {
      setFatalError("Discord認証に失敗しました。設定を確認してから再試行してください。");
      setScreen("error");
    }
  }

  return (
    <main className="activity-shell">
      <div className="stars" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      {screen === "entrance" ? <EntranceScreen onEnter={enterLounge} /> : null}
      {screen === "authenticating" ? <AuthenticatingScreen /> : null}
      {screen === "opening" && user ? <OpeningScreen user={user} /> : null}
      {screen === "lobby" && user ? (
        <LobbyScreen
          user={user}
          wallet={wallet}
          walletError={walletError}
          loadingWallet={loadingWallet}
          onRefreshWallet={refreshWallet}
        />
      ) : null}
      {screen === "error" ? (
        <ErrorScreen
          message={fatalError ?? "不明なエラーが発生しました。"}
          onRetry={() => setScreen("entrance")}
        />
      ) : null}
    </main>
  );
}
