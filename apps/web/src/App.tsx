import type { DiscordUser } from "@iris/shared";
import { useEffect, useRef, useState } from "react";
import { exchangeAuthCode } from "./lib/api.js";
import { getDiscordAuthorizationCode } from "./lib/discord.js";
import { AuthenticatingScreen } from "./screens/AuthenticatingScreen.js";
import { EntranceScreen } from "./screens/EntranceScreen.js";
import { ErrorScreen } from "./screens/ErrorScreen.js";
import { LuxCasinoScreen } from "./screens/LuxCasinoScreen.js";
import { OpeningScreen } from "./screens/OpeningScreen.js";

type Screen = "entrance" | "authenticating" | "opening" | "casino" | "error";

export function App() {
  const [screen, setScreen] = useState<Screen>("entrance");
  const [user, setUser] = useState<DiscordUser | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const openingTimer = useRef<number | null>(null);

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
        setScreen("casino");
      }, 1100);
    } catch {
      setFatalError("Discord authentication failed. Check your setup and try again.");
      setScreen("error");
    }
  }

  return (
    <main className={`activity-shell${screen === "casino" ? " activity-shell--lux" : ""}`}>
      <div className="stars" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      {screen === "entrance" ? <EntranceScreen onEnter={enterLounge} /> : null}
      {screen === "authenticating" ? <AuthenticatingScreen /> : null}
      {screen === "opening" && user ? <OpeningScreen user={user} /> : null}
      {screen === "casino" && user ? <LuxCasinoScreen user={user} /> : null}
      {screen === "error" ? (
        <ErrorScreen
          message={fatalError ?? "An unexpected error occurred."}
          onRetry={() => setScreen("entrance")}
        />
      ) : null}
    </main>
  );
}
