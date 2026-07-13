import type { DiscordUser } from "@iris/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { exchangeAuthCode } from "./lib/api.js";
import { getDiscordAuthorizationCode } from "./lib/discord.js";
import { LuxCasinoScreen } from "./screens/LuxCasinoScreen.js";

export function App() {
  const [user, setUser] = useState<DiscordUser | null>(null);
  const authenticating = useRef(false);

  const enterLounge = useCallback(async () => {
    if (authenticating.current || user) return;
    authenticating.current = true;

    try {
      const code = await getDiscordAuthorizationCode();
      const response = await exchangeAuthCode(code);
      setUser(response.user);
    } catch {
      // The Lux entrance remains visible so the guest can retry its own action.
    } finally {
      authenticating.current = false;
    }
  }, [user]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== "iris-activity-authenticate") return;
      void enterLounge();
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [enterLounge]);

  return (
    <main className="activity-shell activity-shell--lux">
      <LuxCasinoScreen user={user} />
    </main>
  );
}
