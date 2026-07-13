# IRIS Casino Activity 本番運用手順

このプロジェクトの現在の `.env` は、ローカル開発用です。`NODE_ENV=development` と
モック認証・モック残高が有効になっているため、そのまま公開してはいけません。

本番では、Discord Activity、IRIS Economy API、HTTPS公開環境を接続します。ゲームの
途中状態は `/app/data` に保存されるため、現状は**アプリケーションを1台だけ**起動します。
複数台運用は、ゲーム状態を共有トランザクションDBへ移行してから行ってください。

## 1. 本番用 `.env` を作成する

本番サーバー上で `.env.example` をコピーし、次の値を設定します。秘密情報はGitへ
追加せず、DiscordやIRISの管理画面にも貼り付けないでください。

```env
NODE_ENV=production
PORT=3000

# Activityを公開するHTTPS URL
WEB_ORIGIN=https://casino.example.com
DISCORD_ACTIVITY_MODE=true
ACTIVITY_COOKIE_DOMAIN=<DISCORD_CLIENT_ID>.discordsays.com

# Discord Developer Portalで発行する値
DISCORD_CLIENT_ID=<DiscordアプリケーションID>
DISCORD_CLIENT_SECRET=<Discordクライアントシークレット>
DISCORD_REDIRECT_URI=<Discord Developer Portalに登録したHTTPSリダイレクトURI>

# 32文字以上のランダム文字列
SESSION_SECRET=<ランダムな秘密文字列>

# 本番では必ずfalse
IRIS_MOCK_AUTH=false
IRIS_MOCK_WALLET=false

# ashina814/iris-economy-bot が提供するEconomy API
IRIS_ECONOMY_API_BASE_URL=https://economy.example.internal
IRIS_ECONOMY_API_KEY=<IRIS Economy APIキー>
ECONOMY_API_TIMEOUT_MS=2500
```

`DISCORD_CLIENT_SECRET`、`SESSION_SECRET`、`IRIS_ECONOMY_API_KEY` はサーバー専用の
秘密情報です。`VITE_` で始まる変数、フロントエンドのJavaScript、スクリーンショット、
Gitリポジトリに含めてはいけません。

`SESSION_SECRET` は、例えば次のコマンドで生成できます。

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 2. Discord Developer Portalを設定する

対象Discordアプリケーションで、次を確認します。

1. Activitiesを有効にする。
2. ActivityのURL Mappingで `/` を公開HTTPSホストへ向ける。
   例: `https://casino.example.com`
3. `DISCORD_REDIRECT_URI` と完全に同じリダイレクトURIをOAuth2設定へ登録する。
4. Activity Entry Pointを有効にする。
5. Activity Shelf用の名前、説明、画像などを設定する。

Activityモードでは、セッションCookieは
`<DISCORD_CLIENT_ID>.discordsays.com` 向けに `Secure`、`SameSite=None`、`Partitioned`
として発行されます。`ACTIVITY_COOKIE_DOMAIN` の値を別のドメインにすると本番起動時に
エラーになります。

## 3. IRIS Economy APIを接続する

`ashina814/iris-economy-bot` 側で、Activityサーバーから以下を実行できるようにします。

1. Discordユーザーの残高取得。
2. ベット額の予約。
3. 配当額での予約精算。
4. 同一取引IDでの再実行時に、二重課金・二重払戻しが発生しないこと。

本番公開前にテスト用Discordユーザーで、残高表示、負け、勝ち、通信再試行、ゲーム途中の
サーバー再起動を確認します。再起動時は未精算ラウンドを再照合し、精算できない場合は
Activityサーバーが待受を開始しません。

## 4. デプロイする

Dockerが使えるHTTPS環境で、プロジェクトのルートから実行します。

```bash
docker compose up -d --build
docker compose ps
```

コンテナはポート `3000` で、Activityフロントエンドと `/api` を同じプロセスから配信します。
外部にはHTTPSリバースプロキシ経由で公開し、`X-Forwarded-Proto` ヘッダーを転送してください。

ゲーム状態はDockerボリューム `iris-casino-data` に保存されます。コンテナの作り直しでは
残りますが、ボリュームを削除すると未精算ラウンドを含むローカル状態も失われます。

## 5. 公開後に確認する

```bash
curl https://casino.example.com/api/health
```

`{"ok":true,"service":"iris-casino-activity"}` が返ることを確認します。その後Discordの
テスト用サーバーからActivityを起動し、次を順に確認します。

1. Discord認証後にIRIS残高が表示される。
2. 各ゲームでベット、負け、勝ちの結果がIRIS残高へ一度だけ反映される。
3. 連打・通信再試行でも二重ベットにならない。
4. 進行中ラウンドでコンテナを再起動しても、予約と精算が正しく再開される。
5. Discordクライアントを閉じて開き直しても、ゲーム画面と残高を再取得できる。

## 現在の `.env` との差分

今のローカル `.env` は `development` とモック設定を使っています。本番用には少なくとも
`NODE_ENV`、`WEB_ORIGIN`、`DISCORD_ACTIVITY_MODE`、Discord OAuth情報、`SESSION_SECRET`、
`IRIS_ECONOMY_API_KEY`、モック2項目を上記の値へ切り替えてください。
