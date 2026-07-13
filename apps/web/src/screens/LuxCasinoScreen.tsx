import type { DiscordUser } from "@iris/shared";

interface LuxCasinoScreenProps {
  user: DiscordUser | null;
}

export function LuxCasinoScreen({ user }: LuxCasinoScreenProps) {
  const query = new URLSearchParams();
  if (user) {
    query.set("discord_id", user.id);
    query.set("name", user.displayName || user.username);
    query.set("autostart", "1");
  }

  return (
    <section className="lux-casino-screen" aria-label="LUX NOCTIS casino">
      <iframe
        className="lux-casino-frame"
        src={`/lux-noctis/index.html${query.size ? `?${query.toString()}` : ""}`}
        title="LUX NOCTIS Treasury Reform"
        allow="autoplay"
      />
    </section>
  );
}
