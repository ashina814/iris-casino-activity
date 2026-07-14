(function () {
  const core = window.__LUX_CORE__;
  if (!core || !core.RouletteGame) return;

  function updateWallet(wallet) {
    if (!Number.isInteger(wallet)) return;
    const value = `${new Intl.NumberFormat("ja-JP").format(wallet)} Ris`;
    const gameWallet = document.querySelector("#balanceGame");
    if (gameWallet) {
      gameWallet.textContent = value;
      gameWallet.previousElementSibling.textContent = "IRIS WALLET";
    }
    const irisWallet = document.querySelector(".iris-wallet strong");
    if (irisWallet) irisWallet.textContent = value;
  }

  core.RouletteGame.prototype.spin = async function () {
    if (this.spinning) return;
    const wager = this.total();
    if (!wager) {
      this.app.toast("PLACE A BET", "Choose one or more roulette bets first.", "L");
      return;
    }

    const request = window.__IRIS_ACTIVITY_REQUESTS__.begin("roulette", () => ({ id: crypto.randomUUID(), bets: [...this.bets].map(([selection, amount]) => ({ selection, amount })) }));
    const spinId = request.id;
    const bets = request.bets;
    this.spinning = true;
    this.lastBets = new Map(this.bets);
    this.clearHighlight();
    document.querySelector("#rouletteSpin").disabled = true;
    document.querySelector("#rouletteStatus").textContent = "THE WHEEL IS TURNING";
    this.app.audio.play("spin");

    try {
      const response = await fetch("/api/games/roulette/spins", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spinId, bets })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "Roulette is unavailable.");

      const result = payload.spin.number;
      await this.animateWheel(core.WHEEL_ORDER.indexOf(result), this.app.profile.data.settings.reducedMotion ? 700 : 5200);
      this.app.audio.play("stop");
      navigator.vibrate?.(35);

      const color = result === 0 ? "GREEN" : core.RED_NUMBERS.has(result) ? "RED" : "BLACK";
      document.querySelector("#rouletteResult").textContent = `${result} · ${color}`;
      document.querySelector("#rouletteResultSub").textContent = payload.spin.payout ? `${core.formatL(payload.spin.payout)} RETURN` : "THE HOUSE TAKES THIS ROUND";
      document.querySelector("#rouletteStatus").textContent = `RESULT · ${result} ${color}`;
      this.history.unshift(result);
      this.history = this.history.slice(0, 20);
      this.lastResult = result;
      this.highlightResult(result);
      this.bets.clear();
      this.betOrder = [];
      window.__IRIS_RECORD_REMOTE__?.("roulette",payload.spin.spinId,wager,payload.spin.payout||0,"STELLAR ROULETTE",`${result} ${color}`);
      updateWallet(payload.spin.wallet);
      window.__IRIS_ACTIVITY_REQUESTS__.complete("roulette", spinId);
    } catch (error) {
      this.app.toast("ROULETTE UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
    } finally {
      this.spinning = false;
      this.render();
    }
  };
})();
