import { IrisMark } from "../components/IrisMark.js";

export function AuthenticatingScreen() {
  return (
    <section className="screen screen--center" aria-live="polite">
      <IrisMark />
      <div className="copy-stack">
        <h1 className="jp-title">瞳を確かめています</h1>
        <p className="subcopy">記録係のリリスが名簿と照らし合わせています…</p>
      </div>
    </section>
  );
}
