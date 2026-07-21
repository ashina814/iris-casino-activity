# インシデント対応

reserve/settle失敗、Economy timeout、active round復帰不能、JSON破損、hidden state露出はP0として扱う。

1. 新規ベットを停止する。
2. `/api/ready` とコンテナログを確認する。トークン、cookie、API key、Discord IDを報告へ含めない。
3. `data/` を編集せず、停止後にボリュームのバックアップを取得する。
4. reconciliation failureはsupport対応とし、同じround IDの再試行以外で新IDを作らない。
5. Economy取引は内部APIのidempotencyを優先し、直接返金・直接JSON編集をしない。
