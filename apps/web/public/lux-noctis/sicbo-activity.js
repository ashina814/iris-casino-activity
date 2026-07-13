(function () {
  const core = window.__LUX_CORE__;
  if (!core || !core.SicBoGame) return;

  function setWallet(wallet) {
    if (!Number.isInteger(wallet)) return;
    const value = `${new Intl.NumberFormat("ja-JP").format(wallet)} Ris`;
    const gameWallet = document.querySelector("#balanceGame");
    if (gameWallet) { gameWallet.textContent = value; gameWallet.previousElementSibling.textContent = "IRIS WALLET"; }
    const irisWallet = document.querySelector(".iris-wallet strong");
    if (irisWallet) irisWallet.textContent = value;
  }

  core.SicBoGame.prototype.roll = async function () {
    if (this.rolling) return;
    const wager = this.total();
    if (!wager) { this.app.toast("PLACE A BET", "Put chips on the Sic Bo table first.", "L"); return; }
    this.rolling = true;
    this.lastBreakdown = [];
    this.root.querySelector("#sicStatus").textContent = "THE OBSIDIAN DICE ARE ROLLING";
    this.render();
    try {
      const response = await fetch("/api/games/sicbo/spins", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ spinId: crypto.randomUUID(), bets: [...this.bets].map(([selection, amount]) => ({ selection, amount })) })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "Sic Bo is unavailable.");
      const ticks = this.app.profile.data.settings.reducedMotion ? 2 : 18;
      for (let index = 0; index < ticks; index += 1) {
        this.dice = [1 + core.randomInt(6), 1 + core.randomInt(6), 1 + core.randomInt(6)];
        this.renderDice();
        await core.wait(this.app.profile.data.settings.reducedMotion ? 40 : 60 + index * 3);
      }
      this.dice = payload.spin.dice;
      this.lastBreakdown = payload.spin.breakdown.map((bet) => ({ key: bet.selection, amt: bet.amount, multi: bet.multiplier, pay: bet.payout }));
      this.renderDice();
      this.root.querySelector("#sicStatus").textContent = payload.spin.payout ? `${core.formatL(payload.spin.payout)} RETURN` : "THE HOUSE TAKES THIS ROUND";
      this.bets.clear();
      this.order = [];
      window.__IRIS_RECORD_REMOTE__?.("sicbo",payload.spin.spinId,wager,payload.spin.payout||0,"OBSIDIAN SIC BO",payload.spin.dice.join(" + "));
      setWallet(payload.spin.wallet);
    } catch (error) {
      this.app.toast("SIC BO UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
    } finally {
      this.rolling = false;
      this.render();
    }
  };
})();
