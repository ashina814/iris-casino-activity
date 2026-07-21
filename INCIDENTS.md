# 障害対応

最初に新規ベットを停止する必要がある場合は`CASINO_NEW_BETS_ENABLED=false`を使う。これは進行中roundのreveal、cash out、settle、cancel、reconciliationを止めない。JSONやEconomy transactionを直接編集しない。

## `/api/ready` が503

1. `/api/health`が200か確認し、プロセス停止とreadiness失敗を区別する。
2. `reconciliationFailures`が0以外ならactive-round APIとread-only CLIでround IDを確認する。`support_required`は自動復帰対象ではない。
3. `economyReachable=false`ならEconomy APIの生存、ネットワーク、認証設定を確認する。予約・精算の再送はtransaction IDを維持する。
4. `storageWritable=false`ならvolumeのmount、所有者、容量、read-only化を確認する。state fileの削除や初期化は禁止する。
5. `acceptingNewBets=false`だけならmaintenance設定を確認し、意図した停止でなければ設定を戻す。

## JSON破損

state読込時は本体JSONを構文・shapeともに確認し、失敗時だけ`.bak`を同じ方法で確認する。`.bak`が読めればwarningを残して復旧する。本体と`.bak`の両方が不正なら起動を継続して書き戻さず、volumeを保全して障害として扱う。

atomic writeは同じディレクトリへ`<state>.<pid>.<uuid>.tmp`を作り、flush後に既存本体を`.bak`へコピーし、renameで本体を置き換える。途中で失敗すればrename前の旧本体を維持し、tmpだけをcleanupする。残ったtmpは読込対象ではないため削除してよいが、原因調査前に本体・`.bak`を上書きしてはならない。

## Economy予約・精算

予約・精算タイムアウトでは、新しいround IDやtransaction IDを生成しない。同じIDで状態を照合し、二重控除・二重精算を避ける。remote cancelled、payout不一致、reconciliation failureはsupport対応として記録し、利用者に内部例外やstack traceを返さない。

## Hidden state疑い

active APIと通常のactive応答で、Arcana未開封カード、Mines地雷、Tower罠、Ascent crash point、Blackjack裏札、Hold'em/Three Cardのdeckとdealer、Scratch未開封symbolが出ていないか確認する。露出を発見した場合はゲームを停止し、レスポンス本文を限定共有して修正する。
