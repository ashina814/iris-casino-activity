interface ErrorScreenProps {
  message: string;
  onRetry: () => void;
}

export function ErrorScreen({ message, onRetry }: ErrorScreenProps) {
  return (
    <section className="screen screen--center" role="alert">
      <div className="error-orb">!</div>
      <div className="copy-stack">
        <h1 className="jp-title">入店できませんでした</h1>
        <p className="subcopy">{message}</p>
      </div>
      <button className="primary-button" type="button" onClick={onRetry}>
        もう一度試す
      </button>
    </section>
  );
}
