(function () {
  const core = window.__LUX_CORE__;
  if (!core || !core.BaccaratGame) return;

  function total(cards) {
    return cards.reduce((sum, card) => sum + (card.rank === "A" ? 1 : ["10", "J", "Q", "K"].includes(card.rank) ? 0 : Number(card.rank)), 0) % 10;
  }

  function setWallet(wallet) {
    window.__IRIS_SET_WALLET?.(wallet);
  }

  async function request(roundId, bets) {
    const response = await fetch("/api/games/baccarat/rounds", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ roundId, bets })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "Baccarat is unavailable.");
    return payload.round;
  }

  async function reveal(game, side, card) {
    game[side].push(card);
    game.app.audio.play("card");
    game.renderHands();
    await core.wait(game.app.profile.data.settings.reducedMotion ? 35 : 360);
  }

  core.BaccaratGame.prototype.deal = async function () {
    if (this.phase !== "betting" || this.busy) return;
    const wager = this.totalBet();
    if (!wager) {
      this.app.toast("PLACE A BET", "Choose PLAYER, BANKER, TIE, or a pair bet first.", "L");
      return;
    }

    this.busy = true;
    try {
      const round = await request(crypto.randomUUID(), [...this.bets].map(([selection, amount]) => ({ selection, amount })));
      this.phase = "dealing";
      this.player = [];
      this.banker = [];
      this.resultText = "";
      this.root.querySelector("#bacResultBanner").hidden = true;
      this.root.querySelector("#bacStatus").textContent = "DEALING FROM THE IRIS SHOE";
      this.render();

      await reveal(this, "player", round.player[0]);
      await reveal(this, "banker", round.banker[0]);
      await reveal(this, "player", round.player[1]);
      await reveal(this, "banker", round.banker[1]);
      if (round.player[2]) await reveal(this, "player", round.player[2]);
      if (round.banker[2]) await reveal(this, "banker", round.banker[2]);
      if (this.disposed) return;

      this.resultText = round.outcome === "player" ? "PLAYER WINS" : round.outcome === "banker" ? "BANKER WINS" : "TIE";
      this.root.querySelector("#bacResultBanner").textContent = this.resultText;
      this.root.querySelector("#bacResultBanner").hidden = false;
      this.root.querySelector("#bacStatus").textContent = `${this.resultText}  ${total(round.player)} : ${total(round.banker)}`;
      this.phase = "result";
      this.bets.clear();
      window.__IRIS_RECORD_REMOTE__?.("baccarat",round.roundId,wager,round.payout||0,"VELVET BACCARAT",this.resultText);
      setWallet(round.wallet);
      this.render();
      this.setTimeout(() => {
        this.player = [];
        this.banker = [];
        this.resultText = "";
        this.phase = "betting";
        const banner = this.root.querySelector("#bacResultBanner");
        if (banner) banner.hidden = true;
        const status = this.root.querySelector("#bacStatus");
        if (status) status.textContent = "PLACE YOUR NEXT BET";
        this.render();
      }, this.app.profile.data.settings.reducedMotion ? 600 : 2600);
    } catch (error) {
      this.app.toast("BACCARAT UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
      this.phase = "betting";
    } finally {
      this.busy = false;
      this.render();
    }
  };
})();
