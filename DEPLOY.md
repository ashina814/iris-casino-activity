# 本番デプロイ

1. `main` または承認済みrelease commitを確認し、`npm run check` を完走する。
2. 本番データボリュームを停止中にtarでバックアップする。`data/` と `.env` はGit操作の対象にしない。
3. `git pull --ff-only origin main`、`docker compose build`、`docker compose up -d --force-recreate` を実行する。
4. `docker compose ps`、`/api/health`、`/api/ready` を確認する。readyが503なら新規ベットを公開しない。
5. Caddy等のリバースプロキシはループバック公開だけを使う。rollbackは直前のimageへ戻し、データを初期化しない。

Dockerのhealthcheckは `/api/ready` を使う。`/api/health` はプロセス生存確認専用である。
