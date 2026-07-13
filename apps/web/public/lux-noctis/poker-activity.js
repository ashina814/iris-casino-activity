(function () {
  const core = window.__LUX_CORE__;
  if (!core || !core.PokerGame) return;

  function setWallet(wallet) {
    window.__IRIS_SET_WALLET?.(wallet);
  }

  async function request(path, body) {
    const response = await fetch(path, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message || "Poker is unavailable.");
    return payload.round;
  }

  async function showCards(game, cards, held) {
    for (let index = 0; index < 5; index += 1) {
      if (held && held[index]) continue;
      game.cards[index] = cards[index];
      game.app.audio.play("card");
      game.renderCards();
      await core.wait(game.app.profile.data.settings.reducedMotion ? 35 : 160);
      if (game.disposed) return;
    }
  }

  core.PokerGame.prototype.deal = async function () {
    if (this.phase !== "betting" || this.busy) return;
    this.busy = true;
    this.phase = "dealing";
    this.cards = [];
    this.held = [false, false, false, false, false];
    this.result = null;
    this.render();
    try {
      const round = await request("/api/games/poker/rounds", { roundId: crypto.randomUUID(), bet: this.bet });
      this.remoteRoundId = round.roundId;
      await showCards(this, round.cards, null);
      if (this.disposed) return;
      this.phase = "holding";
      this.render();
    } catch (error) {
      this.phase = "betting";
      this.cards = [];
      this.app.toast("POKER UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
    } finally {
      this.busy = false;
      this.render();
    }
  };

  core.PokerGame.prototype.draw = async function () {
    if (this.phase !== "holding" || this.busy || !this.remoteRoundId) return;
    const held = [...this.held];
    this.busy = true;
    this.phase = "drawing";
    this.render();
    try {
      const round = await request(`/api/games/poker/rounds/${encodeURIComponent(this.remoteRoundId)}/draw`, { held });
      await showCards(this, round.cards, held);
      if (this.disposed) return;
      this.cards = round.cards;
      this.result = round.result;
      this.phase = "result";
      window.__IRIS_RECORD_REMOTE__?.("poker",round.roundId,this.bet,round.payout||0,"ROYAL DRAW",round.result?.name||"");
      setWallet(round.wallet);
    } catch (error) {
      this.phase = "holding";
      this.app.toast("POKER UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
    } finally {
      this.busy = false;
      this.render();
    }
  };
})();
