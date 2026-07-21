# 運用手順

## 追加設定

| 環境変数 | 既定値 | 用途 |
| --- | --- | --- |
| `LEGACY_MIGRATION_ENABLED` | `false` | legacy migration APIを一時的に有効化する。通常運用ではfalseのままにする。 |
| `LEGACY_MIGRATION_ALLOWLIST` | 空 | migrationを許可するDiscord IDのカンマ区切り一覧。productionでmigrationを有効にする場合は必須。 |
| `CASINO_NEW_BETS_ENABLED` | `true` | falseで新規round/spin/ticket/drop/draw開始を停止する。既存roundの操作は止めない。 |
| `CASINO_DISABLED_GAMES` | 空 | 新規開始だけを止めるゲームIDのカンマ区切り一覧。例: `arcana,moonshot`。 |
| `CASINO_BETA_MAX_BET` | `0` | 新規開始時の上限。0は無制限。RouletteとSic Boはbets配列の合計額を判定する。 |

設定を変更する前に進行中roundを確認し、変更後は`/api/ready`を確認する。秘密値、Cookie、API key、request bodyをログやチケットへ貼り付けない。

## Maintenanceの実際の挙動

| 操作 | 全体停止中 | ゲーム停止中 |
| --- | --- | --- |
| 新規round開始 | 拒否 | 対象ゲームだけ拒否 |
| active round取得 | 許可 | 許可 |
| 既存roundのreveal等 | 許可 | 許可 |
| cash out / settle | 許可 | 許可 |
| cancel / reconciliation | 許可 | 許可 |
| 同一roundの再送・復帰 | 許可 | 許可 |

停止判定は新規作成パスだけに掛かる。Blackjack double/split、War、Hold'em call、Three Card playは既存round内の追加賭けであり、この上限・停止ガードの対象外である。意図的な制限であり、これらを制限する必要がある運用では新規ベット停止だけでなく対象roundを開始させない。

## Readinessと日常確認

`GET /api/health` はlivenessだけを返す。`GET /api/ready` が200になるのは、startup reconciliation完了、failure 0件、Economy `/health`への到達、全state保存先でmarker作成・削除が可能、かつ`CASINO_NEW_BETS_ENABLED=true`のときである。ゲーム別停止だけではreadyを503にしない。

503時はレスポンスの`reconciliationFailures`、`economyReachable`、`storageWritable`、`acceptingNewBets`を読み、原因を一つずつ解消する。Economy確認はGET `/health`のみで、予約・精算・残高更新などの副作用を持つAPIは呼ばない。

## Read-only調査

```bash
npm run casino:status
npm run casino:active -- --user <DiscordID>
```

出力にはgame、round ID、Discord user ID、phase、bet、payout、transaction ID、`reconciliationFailure`が含まれる。CLIはJSONを読むだけで、保存・取消・精算を行わない。`reconciliationFailure: true`またはactive APIの`reconciliation_failed` / `support_required`を見つけた場合、手動でJSONを書き換えたり新IDで再開始せずincidentとして扱う。

## Legacy migration

対象は`/api/economy/ascension/migrate`、`eternal/migrate`、`duel-profile/migrate`、`albums/migrate`、`sovereign/migrate`、`artifacts/migrate`である。未認証は通常の401、無効時は404、allowlist外は403で拒否され、route handler前に止まるためstateは変化しない。受信した進捗値はログへ出さない。migration完了後は直ちに無効化し、allowlistも空に戻す。
