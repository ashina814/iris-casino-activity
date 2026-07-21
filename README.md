# IRIS Casino Activity

Discord ActivityとしてRIS残高を使うCasinoサーバーです。賭けはEconomy APIのreserve/settleを通し、round IDとaction IDで冪等化します。`/api/health` は生存確認、`/api/ready` はEconomy・storage・reconciliationを含む公開可否です。

公開前は `npm run check` を実行し、[DEPLOY.md](DEPLOY.md)、[OPERATIONS.md](OPERATIONS.md)、[INCIDENTS.md](INCIDENTS.md)、[GAME_TEST_MATRIX.md](GAME_TEST_MATRIX.md) に従ってください。

IRIS Casino Activity は、Discord Activity として起動する IRIS カジノの最小構成プロジェクトです。今回の範囲はゲーム本体ではなく、Discord 認証の骨組み、ログイン中ユーザー取得、IRIS Economy API への安全なバックエンド中継、入口からロビーまでの Activity 画面です。

## 構成

```text
iris-casino-activity/
├─ apps/
│  ├─ web/       React + Vite の Discord Activity 画面
│  └─ server/    Express の Activity Backend
├─ packages/
│  └─ shared/    共有型と Zod スキーマ
├─ design-reference/
├─ .env.example
├─ .gitignore
├─ package.json
├─ README.md
└─ tsconfig.base.json
```

## 必要環境

- Node.js 22 以上
- npm

この環境では Node.js 24 系での動作を想定しています。

## インストール

```bash
npm install
```

## ローカル起動

```bash
cp .env.example .env
npm run dev
```

- Web: `http://localhost:5173`
- Server: `http://localhost:3000`
- `npm run dev` は `@iris/shared` を一度ビルドしてから、フロントエンドとバックエンドを同時起動します。

## モック認証での起動

`.env` で以下を設定してください。

```env
IRIS_MOCK_AUTH=true
IRIS_MOCK_WALLET=true
VITE_IRIS_MOCK_AUTH=true
SESSION_SECRET=local-development-session-secret
```

この状態では Discord API を実際に呼ばず、固定ユーザー `Yuki` とモック残高 `12500 Ris` で画面確認できます。

## 環境変数

```env
NODE_ENV=development
PORT=3000
WEB_ORIGIN=http://localhost:5173

DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=
SESSION_SECRET=

IRIS_MOCK_AUTH=true
IRIS_MOCK_WALLET=true
IRIS_ECONOMY_API_BASE_URL=http://127.0.0.1:8787
IRIS_ECONOMY_API_KEY=
ECONOMY_API_TIMEOUT_MS=2500

VITE_DISCORD_CLIENT_ID=
VITE_IRIS_MOCK_AUTH=true
```

`.env.example` には秘密値を入れません。`.env` は `.gitignore` 済みです。

## 接続構造

```text
Discord Activity frontend
        ↓
Activity backend
        ↓
IRIS Economy API
```

フロントエンドは Economy API を直接呼びません。`GET /api/wallet` がセッション中の Discord ユーザー ID をもとに、バックエンドから次の内部 API を呼びます。

```text
GET {IRIS_ECONOMY_API_BASE_URL}/internal/v1/wallets/{discordUserId}
Authorization: Bearer {IRIS_ECONOMY_API_KEY}
```

## API

- `GET /api/health`
- `POST /api/auth/exchange`
- `GET /api/me`
- `GET /api/wallet`

認証成功後は HttpOnly Cookie ベースのセッションを使います。Cookie は `SameSite=Lax`、production では `Secure` になります。

## セキュリティ上の注意

- JSON body は `16kb` に制限しています。
- Helmet と明示的な CORS 設定を使っています。
- CORS の許可 origin は `WEB_ORIGIN` で指定します。
- 入力は Zod で検証します。
- Economy API には短いタイムアウトを設定しています。
- エラーレスポンスは Activity 用の安全な形式へ変換します。
- Economy API キー、Discord Client Secret、アクセストークン、Cookie、Authorization ヘッダーはレスポンスやログに出しません。
- フロントエンドへ秘密情報を埋め込みません。

## 今回未実装の機能

- カジノゲーム本体
- 仮ゲーム
- reserve / settle / cancel
- 着席時の残高減算
- VPS デプロイ
- GitHub リポジトリ作成や push

ロビーの卓カードは見た目確認用で、操作は `準備中` の無効状態です。

## Discord Developer Portal で将来必要な設定

- Activity 用アプリケーションの作成
- OAuth2 client ID / client secret の取得
- Redirect URI の登録
- Embedded App / Activity URL の設定
- 必要 scope の確認
- 本番 URL と開発 URL の切り分け

## 検証コマンド

```bash
npm install
npm run lint
npm run typecheck
npm run test
npm run build
npm run check
```

すべて通る状態を完了条件とします。

## デザイン参考

`IRIS Lounge v2.dc.html` はデザイン参考です。本番コードへ直接改造せず、React コンポーネントとして再構成しています。`support.js` は参考確認用 runtime のため、本番アプリにはコピーも import もしません。

## デプロイについて

このプロジェクトはまだ VPS にデプロイしません。Git 操作、GitHub リポジトリ作成、push もこの段階では行いません。
