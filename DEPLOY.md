# 本番デプロイ手順

この手順は `main` にマージ済みのコミットだけを対象にする。`.env`、`data/`、Docker volumeはGit管理せず、作業前後とも削除・初期化しない。

## 事前確認

1. リリース対象のcommit、PR、`npm run check` の成功を確認する。
2. VPSで `git status --short` を確認し、未追跡の本番データや`.env`を変更しない。
3. Docker volumeまたは`data/`を日時付きでバックアップする。バックアップ先と対象commitを作業記録に残す。
4. `CASINO_NEW_BETS_ENABLED=true`、migration無効、mock認証・mock wallet無効を確認する。秘密値は表示しない。

## 反映

```bash
git fetch origin
git switch main
git pull --ff-only origin main
docker compose build
docker compose up -d --force-recreate
docker compose ps
```

Composeの公開ポートは `127.0.0.1:3000:3000` である。外部公開はCaddy等のリバースプロキシだけに任せ、3000番をインターネットへ直接公開しない。

## 反映後の確認

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
docker compose logs --tail=100 iris-casino-activity
```

`/api/health` はプロセス生存確認で、常に200を返す。`/api/ready` はreconciliation、Economy疎通、全state保存先への書込み、新規ベット受付を確認し、問題があれば503を返す。503時は新しいラウンドを開始せず、`OPERATIONS.md`と`INCIDENTS.md`に従って原因を解消する。

Docker HEALTHCHECKも`/api/ready`を使う。Docker単体のhealth status変化はrestart policyによる自動再起動を発生させないが、監視・オーケストレータがunhealthyを契機に再起動する設定では反復し得る。maintenance中に意図的に`CASINO_NEW_BETS_ENABLED=false`にする場合は、この監視挙動を事前に確認する。

## ロールバック

新規ベットを止め、進行中roundのsettle/cash outを妨げない状態で、直前の正常commitへ戻す。データvolumeは戻さず、コンテナイメージとアプリコードだけを戻す。`/api/ready`、ログ、対象ゲームのactive roundを確認してから新規ベットを再開する。
