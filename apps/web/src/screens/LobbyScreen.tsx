import type { DiscordUser } from "@iris/shared";
import { TableCard } from "../components/TableCard.js";
import { UserAvatar } from "../components/UserAvatar.js";

interface LobbyScreenProps {
  user: DiscordUser;
  wallet: number | null;
  walletError: string | null;
  loadingWallet: boolean;
  onRefreshWallet: () => void;
}

const tables = [
  { name: "星詠みルーレット", note: "静かな開場準備中" },
  { name: "ブラックジャック", note: "ディーラー調整中" },
  { name: "星屑スロット", note: "今回のMVPでは操作不可" }
];

export function LobbyScreen({
  user,
  wallet,
  walletError,
  loadingWallet,
  onRefreshWallet
}: LobbyScreenProps) {
  return (
    <section className="screen screen--lobby" aria-labelledby="lobby-title">
      <header className="lobby-header">
        <UserAvatar displayName={user.displayName} avatarUrl={user.avatarUrl} />
        <div>
          <p className="eyebrow">IRIS Lounge</p>
          <h1 id="lobby-title" className="jp-title">
            {user.displayName}
          </h1>
        </div>
      </header>

      <div className="wallet-panel">
        <div>
          <p className="panel-label">Balance</p>
          <p className="wallet-value">
            {wallet === null ? "確認中" : wallet.toLocaleString()}
            <span> Ris</span>
          </p>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onRefreshWallet}
          disabled={loadingWallet}
          aria-label="残高を再取得"
          title="残高を再取得"
        >
          ↻
        </button>
      </div>

      {walletError ? (
        <div className="inline-error" role="status">
          <p>{walletError}</p>
          <button type="button" onClick={onRefreshWallet}>
            再試行
          </button>
        </div>
      ) : null}

      <div className="table-list" aria-label="準備中の卓">
        {tables.map((table) => (
          <TableCard key={table.name} name={table.name} note={table.note} />
        ))}
      </div>
    </section>
  );
}
