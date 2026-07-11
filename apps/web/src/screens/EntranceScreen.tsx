import { IrisMark } from "../components/IrisMark.js";

interface EntranceScreenProps {
  onEnter: () => void;
}

export function EntranceScreen({ onEnter }: EntranceScreenProps) {
  return (
    <section className="screen screen--center" aria-labelledby="entrance-title">
      <IrisMark />
      <div className="copy-stack">
        <h1 id="entrance-title" className="script-title">
          You're on the list tonight.
        </h1>
        <p className="subcopy">今夜の招待状はあなた宛です</p>
      </div>
      <button className="primary-button" type="button" onClick={onEnter}>
        Discordで入店する
      </button>
      <p className="tiny-note">IRIS Lounge · Discord Activity</p>
    </section>
  );
}
