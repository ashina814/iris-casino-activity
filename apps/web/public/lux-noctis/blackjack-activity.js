(function () {
  const core = window.__LUX_CORE__;
  if (!core || !core.BlackjackGame) return;

  const prototype = core.BlackjackGame.prototype;
  const originalRender = prototype.render;

  async function request(path, body) {
    const response = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || "Blackjack request failed.");
    }
    return payload.round;
  }

  function placeholderCard() {
    return { rank: "A", suit: "S" };
  }

  function applyRound(game, round) {
    game.remoteRoundId = round.id;
    game.remoteRound = round;
    game.phase = round.phase;
    game.active = round.activeHand;
    game.dealer = round.dealer.map((card) => card || placeholderCard());
    game.hands = round.hands.map((hand) => ({
      cards: hand.cards,
      bet: hand.bet,
      status: hand.status,
      result: hand.result || "",
      split: hand.split
    }));
    game.totalWager = round.hands.reduce((total, hand) => total + hand.bet, 0);
    game.remoteWallet = round.wallet;
    const wallet = document.querySelector("#balanceGame");
    if (wallet && Number.isInteger(round.wallet)) {
      wallet.textContent = `${new Intl.NumberFormat("ja-JP").format(round.wallet)} Ris`;
      wallet.previousElementSibling.textContent = "IRIS WALLET";
    }
    const irisWallet = document.querySelector(".iris-wallet strong");
    if (irisWallet && Number.isInteger(round.wallet)) irisWallet.textContent = `${new Intl.NumberFormat("ja-JP").format(round.wallet)} Ris`;
    game.render();
  }

  async function action(game, name) {
    if (!game.remoteRoundId || game.busy) return;
    game.busy = true;
    game.render();
    try {
      game.irisBlackjackActionId ??= crypto.randomUUID();
      const round = await request(`/api/games/blackjack/rounds/${encodeURIComponent(game.remoteRoundId)}/actions`, { actionId: game.irisBlackjackActionId, action: name });
      game.irisBlackjackActionId = null;
      applyRound(game, round);
      if (game.phase === "settled") { window.__IRIS_RECORD_REMOTE__?.("blackjack",round.id,game.totalWager,round.payout||0,"NOCTURNE BLACKJACK","IRIS SETTLED"); game.app.toast("ROUND COMPLETE", "Ris settlement is recorded in the IRIS ledger.", "L"); }
    } catch (error) {
      game.app.toast("BLACKJACK UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
    } finally {
      game.busy = false;
      game.render();
    }
  }

  prototype.deal = async function () {
    if (this.busy || this.phase !== "betting") return;
    this.busy = true;
    this.render();
    try {
      this.irisBlackjackStartId ??= crypto.randomUUID();
      const round = await request("/api/games/blackjack/rounds", { roundId: this.irisBlackjackStartId, bet: this.bet });
      this.irisBlackjackStartId = null;
      applyRound(this, round);
      if (this.phase === "settled") window.__IRIS_RECORD_REMOTE__?.("blackjack",round.id,this.totalWager,round.payout||0,"NOCTURNE BLACKJACK","NATURAL SETTLEMENT");
      this.app.audio.play("deal");
    } catch (error) {
      this.app.toast("BLACKJACK UNAVAILABLE", error instanceof Error ? error.message : "Please try again.", "L");
    } finally {
      this.busy = false;
      this.render();
    }
  };

  prototype.hit = function () { return action(this, "hit"); };
  prototype.stand = function () { return action(this, "stand"); };
  prototype.double = function () { return action(this, "double"); };
  prototype.split = function () { return action(this, "split"); };

  prototype.render = function () {
    originalRender.call(this);
    if (!this.remoteRound || this.phase !== "player") return;
    const hand = this.hands[this.active];
    const canDouble = hand && hand.status === "active" && hand.cards.length === 2;
    const canSplit = canDouble && this.hands.length === 1 && hand.cards[0].rank === hand.cards[1].rank;
    const doubleButton = this.root.querySelector("#bjDouble");
    const splitButton = this.root.querySelector("#bjSplit");
    if (doubleButton) doubleButton.disabled = !canDouble;
    if (splitButton) splitButton.disabled = !canSplit;
  };
})();
