# IRIS Casino Activity 引継ぎ

最終更新: 2026-07-14

## 本番環境

- 公開URL: `https://iris-casino.duckdns.org`
- Caddy が HTTPS を終端し、`127.0.0.1:3100` の Activity コンテナへリバースプロキシする。
- コンテナ内部のアプリケーションはポート `3000` で待ち受ける。
- 永続データは Docker ボリューム `iris-casino-data` に保存される。コンテナを作り直しても、ボリュームを削除しない限り失われない。
- `DISCORD_ACTIVITY_MODE=true` のときだけ、Helmet の iframe 制限を Discord 用に緩和している。`X-Frame-Options` は出力せず、CSP の `frame-ancestors` に Discord のドメインを許可する。

## RIS 連携

残高の正本は `ashina814/iris-economy-bot` の RIS ウォレットだけである。画面に残る Lux Noctis のコイン表記は、RIS 残高を表示するための UI 状態であり、別通貨ではない。

- 各ゲームのベット、払戻し、予約、精算は既存のゲーム API と RIS 連携で処理する。
- 日次ギフトは RIS クレジット、連続ログインと Crown Notes は Activity サーバーの永続状態で管理する。
- Treasury は RIS デビットまたは Crown Notes で決済する。購入IDにより再試行時も二重決済しない。
- Palace Relief は RIS 残高が100未満のとき、一度だけ2,500 RISまで補充する。
- 日替わりミッションはゲームサーバーが信頼済みの精算結果から進捗を記録し、報酬を RIS へクレジットする。ラウンドIDと Bot 側の取引IDの両方で重複報酬を防止する。
- Eclipse Vault は信頼済みの各ゲーム精算でチャージし、サーバーが確定・保存した宝箱の結果を RIS へクレジットする。クライアントの再読み込みや通信再試行で金庫報酬は重複しない。
- 宮殿現象はサーバーが各ゲーム精算で進行する。GILDED VAULT のチャージ2倍と、FORTUNE ECHO の純利益3%ボーナスはサーバー側で判定し、Echo報酬は RIS へクレジットする。
- Party Crown は信頼済みの勝利純益から `floor(純益 / 2,000) + 1`（1〜18）のメーターを加算する。100到達時の参加者だけが500 RISを受け取れ、Party Crown IDを取引IDへ含めて重複支払いを防ぐ。

Activity 側の経済処理は `apps/server/src/services/activity-economy.ts` にある。Bot 側は `POST /internal/v1/activity/adjustments` を提供し、日次ギフト、Treasury、Relief、ミッションの調整を決定的な取引IDで処理する。

## UI と同期

- 最初の画面は Lux Noctis 本来の導入画面のまま表示する。
- Discord 認証後は `postMessage` で本人情報を渡し、同じ導入画面から `autostart=1` でロビーへ遷移する。
- Party は Discord セッションの本人性を使って参加者、在席、リアクション、フィードをサーバー同期する。
- ミッションの見た目、ゲーム記録、実績、秘宝、金庫などの Lux UI は残す。RIS 残高へ影響する経済処理だけは、ブラウザ保存ではなくサーバーと Bot を正とする。

## 現在のコミット

- `b9d6bd9` Treasury を RIS 決済へ移行
- `a5cb446` Palace Relief を RIS へ移行
- `2e94741` Lux の導入画面を Activity の開始画面に統一
- `0fb664e` 導入画面の認証連携テスト
- `ac4ea1c` 認証済み Party 同期
- `6d48663` 本番引継ぎ文書
- `98f697b` 日替わりミッションを RIS へ移行
- `e48e360` Eclipse Vault を RIS へ移行
- `a105c24` 宮殿現象と FORTUNE ECHO を RIS へ移行

## VPS 反映手順

Activity リポジトリで実行する。

```bash
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
curl -fsS https://iris-casino.duckdns.org/api/health
```

正常時の health API は `{"ok":true,"service":"iris-casino-activity","version":"0.1.0"}` を返す。Bot の `main` も Activity より先に更新し、`IRIS_ECONOMY_API_BASE_URL` と `IRIS_ECONOMY_API_KEY` が正しい Bot を指していることを確認する。

## 本番確認

1. Discord から Activity を開き、導入画面と自動入場が自然につながること。
2. `/api/wallet` が RIS 残高を返すこと。
3. 代表ゲームでベット、払戻し、再読み込み後の残高一致を確認すること。
4. 日次ギフト、Treasury、Palace Relief、ミッション、FORTUNE ECHO、Party Crownをそれぞれ一度実行し、Bot の取引ログと残高が一度だけ変化すること。
5. Eclipse Vault を100 CHARGEまで進め、任意の宝箱を選び、報酬と残高が一度だけ変化すること。
6. 同じゲーム操作を通信再試行しても、ミッション報酬、Vault報酬、Treasury決済が重複しないこと。
7. 2人以上で Party room URL を開き、在席、リアクション、フィードが同期すること。

## 残る運用確認

- Party room、Crownメーター、未受取Crownの受取資格は `PARTY_STATE_PATH`（既定: `data/party-state.json`）へ保存され、Dockerの永続ボリュームとともに復元される。SSE接続と30秒の在席TTLは再接続後に作り直される。
- 進行中ラウンドの最中に Activity コンテナを再起動し、ゲーム固有の予約・精算とParty Crownの受取資格が期待どおり復旧するかを本番前に確認する。
