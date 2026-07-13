# IRIS Casino Activity 引継ぎ

最終更新: 2026-07-14

## 本番構成

- 公開URL: `https://iris-casino.duckdns.org`
- Caddy: HTTPS終端後、`127.0.0.1:3100` のActivityコンテナへリバースプロキシ
- Activityコンテナ: 内部ポート `3000`
- Dockerボリューム: `iris-casino-data`。ゲームラウンドとActivity進捗を保持するため削除しない。
- ActivityモードではHelmetのiframe制約をDiscordドメイン向けに緩和済み。

## RIS連携

通貨の唯一の正本は `ashina814/iris-economy-bot` のRIS台帳。

- ゲームのベット・精算: 既存の予約/精算API
- 日次ギフト: RISクレジット。予備金・Crown NotesはActivityサーバーの進捗状態で保持
- Treasury: RISデビットまたはCrown Notes。購入IDで冪等化済み
- 救済金: RIS残高が100未満のとき2,500まで一度だけ補填。サーバー側で判定・記録
- Treasuryの通信失敗後の再試行: ブラウザセッションに購入IDを残し、再読込後も同じRIS取引を再利用

Activityの `ActivityEconomyService` は以下にある。

- `apps/server/src/services/activity-economy.ts`

Bot側には `POST /internal/v1/activity/adjustments` が必要。daily、treasury、reliefの調整理由を受け付け、取引IDで冪等に処理する。

## UXと同期

- 最初の画面はReact製の別入口ではなく、Lux Noctis本来の入口を直接表示する。
- Lux入口からの認証要求だけを同一オリジンの`postMessage`で受信し、認証後は同一画面を`autostart=1`で再読込する。
- PartyはDiscordセッションの本人性で参加者を確定し、在席・リアクション・フィードをサーバー同期する。
- Party CrownのRIS報酬、ミッション、Eclipse Vaultは未移行。クライアント申告での加算を許可せず、サーバー確定ラウンドから発火させる必要がある。

## 現在のActivityコミット

- `b9d6bd9` TreasuryをRIS精算へ移行
- `a5cb446` 救済金をRISへ移行、Treasury再試行保護
- `2e94741` Lux入口へ統一
- `0fb664e` 入口認証の統合テスト
- `ac4ea1c` 認証済みParty同期

## VPS更新

VPS上のActivityリポジトリで実施する。

```bash
git pull --ff-only origin main
docker compose up -d --build
docker compose ps
curl -fsS https://iris-casino.duckdns.org/api/health
```

正常時はhealth APIが `{"ok":true,"service":"iris-casino-activity","version":"0.1.0"}` を返す。

BotもActivityより先に、RIS調整APIを含むコミットを本番Botへ反映して再起動する。Activityを先に更新すると、日次ギフト・Treasury・救済金が `economy_unavailable` になる。

## 反映後の確認

1. DiscordからActivityを開き、Luxの入口が最初から表示される。
2. 認証後も同じLux画面のまま自動入場する。
3. `/api/wallet` がRIS残高を返す。
4. 日次ギフト、TreasuryのRIS支払い、低残高救済を少額テストアカウントで確認する。
5. 同じTreasury操作を通信失敗後に再試行し、RIS取引が一度だけであることをBotの取引ログで確認する。
6. 2人以上で同じParty room URLを開き、参加者・リアクション・フィードが同期する。

## 検証

Activityは `npm.cmd run check` でlint、型検査、全テスト、本番ビルドを実行する。
