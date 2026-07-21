# ゲーム公開前マトリクス

各ゲームで通常勝敗、start二重送信、action二重送信、残高不足、別ユーザーID、container再起動、Economy timeout、active round復帰、settled後非復帰を確認する。

Mines、Tower、Arcana、Ascent、Blackjack、Hold'em、Three Card、Scratchはactive APIがhidden stateを返さないことを確認する。特にArcanaはcardsを返さず、open/matched位置だけを返す。

Roulette/Sic Boは合計ベット、Blackjack double/split、War、Hold'em call、Three Card playは追加賭けも確認する。maintenanceとdisabled gameは新規開始を拒否し、進行中roundの精算を妨げない。
