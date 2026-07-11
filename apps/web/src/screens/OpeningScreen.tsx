import type { DiscordUser } from "@iris/shared";
import { IrisMark } from "../components/IrisMark.js";

interface OpeningScreenProps {
  user: DiscordUser;
}

export function OpeningScreen({ user }: OpeningScreenProps) {
  return (
    <section className="screen screen--center screen--opening" aria-live="polite">
      <IrisMark />
      <div className="copy-stack">
        <p className="eyebrow">Welcome back,</p>
        <h1 className="jp-title">{user.displayName}</h1>
        <p className="subcopy">虹彩が開きます ── フロアへ</p>
      </div>
    </section>
  );
}
