# ゲーム検証マトリクス

各リリースで、対象ゲームの新規開始、決着、通信再送、Economy timeout、コンテナ再起動後の状態を確認する。結果、round ID、実施者、日時をリリース記録へ残す。未検証項目は空欄ではなく未実施と記載する。

| ゲーム | 新規開始と決着 | 同一ID再送 | timeout / 再起動 | active復帰 | hidden state確認 |
| --- | --- | --- | --- | --- | --- |
| Blackjack | deal、hit、stand、cash相当のsettle | deal/action | reserve/settleの再送 | player phase | dealer裏札 |
| Roulette / Sic Bo | 合計bet、payout | spin再送 | reserve/settle | settlingのみ | 未決着結果 |
| Slots / Baccarat / Poker / Keno / Dragon / Wheel / Plinko / Bingo | 1 round完走 | 同一ID | Economy timeout | settling確認 | 未決着の乱数結果 |
| Craps / Hi-Lo / War | action、cash outまたはsettle | action ID | 追加操作中の再起動 | active/tie復帰 | deck・次カード |
| Mines | 1000 Ris開始、2安全マス、Activity再起動、cash out | reveal action ID | reservation再送 | 開画面だけで復帰 | mines配列 |
| Scratch | 1マス、全開封、settle | reveal action ID | active/settling | active ticket | 未開封symbol |
| Tower / Hold'em / Three Card | 進行・追加操作・決着 | action ID | call/play中 | active round | traps、deck、dealer |
| Ascent / Arcana / Moonshot | 開始・操作・決着 | action ID | active/settling | active round | crash point、未開封cards |

## 共通の確認

- `CASINO_NEW_BETS_ENABLED=false`で新規開始が拒否され、既存Minesの復帰・reveal・cash outが可能であること。
- `CASINO_DISABLED_GAMES=<game>`で対象ゲームの新規開始だけが拒否され、既存roundの操作が可能であること。
- `CASINO_BETA_MAX_BET`でscalar wagerとRoulette/Sic Boのbets合計が拒否されること。追加ベットは現実装ではこの上限対象外であること。
- settled後にactive-round APIへ戻らず、同じtransactionが二重に精算されないこと。
- container再起動後にJSONが読め、`.bak`復旧が必要な場合はwarningだけを残して秘密値を出さないこと。
- `/api/ready`が200であり、Economy・storage・reconciliationの異常時は503になること。
