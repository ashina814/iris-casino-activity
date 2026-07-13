import type { DiscordUser } from "@iris/shared";

interface LuxCasinoScreenProps {
  user: DiscordUser;
}

export function LuxCasinoScreen({ user }: LuxCasinoScreenProps) {
  const query = new URLSearchParams({
    discord_id: user.id,
    name: user.displayName || user.username
  });

  return (
    <section className="lux-casino-screen" aria-label="LUX NOCTIS casino">
      <iframe
        className="lux-casino-frame"
        src={`/lux-noctis/index.html?${query.toString()}`}
        title="LUX NOCTIS Treasury Reform"
        allow="autoplay"
      />
    </section>
  );
}
