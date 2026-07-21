# 運用手順

- 新規開始停止: `CASINO_NEW_BETS_ENABLED=false`。進行中roundのreveal、cash out、settle、reconciliationは継続する。
- 一時停止ゲーム: `CASINO_DISABLED_GAMES=arcana,moonshot`。既存roundの完了は許可する。
- ベータ上限: `CASINO_BETA_MAX_BET` は新規開始の合計賭け額だけを制限する。`0` は無制限。
- legacy migration: 通常は `LEGACY_MIGRATION_ENABLED=false`。有効化時は許可Discord IDだけを `LEGACY_MIGRATION_ALLOWLIST` に設定し、完了後ただちに無効化する。
- readiness: `/api/ready` の503時は `reconciliationFailures`、Economy到達性、storage書込み可能性を確認する。秘密値やrequest bodyをログへ出さない。
- JSON破損: `.bak` 復旧を確認し、元JSONを手編集しない。復旧できない場合はバックアップを確保して停止し、incidentとして扱う。
